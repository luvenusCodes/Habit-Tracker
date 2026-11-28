import os
import re
import secrets
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, field_validator

from storage.habits_storage import get_db_connection
from utils.email_service import send_otp_email
from utils.rate_limiter import login_rate_limiter, otp_rate_limiter
from utils.security import (
    create_access_token,
    generate_otp,
    hash_password,
    verify_otp_hash,
    verify_password,
)

load_dotenv(override=False)
SECRET_KEY = os.environ["JWT_SECRET_KEY"]
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
ALGORITHM = "HS256"
MAX_OTP_ATTEMPTS = 5

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token.")

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[int] = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials.")
        return {"user_id": user_id, "username": payload.get("sub")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials.")


PASSWORD_POLICY_MSG = (
    "Password must be at least 8 characters long and include at least "
    "one uppercase letter, one lowercase letter, and one special character."
)


def validate_password_strength(password: str) -> str:
    if (
        len(password) < 8
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise ValueError(PASSWORD_POLICY_MSG)
    return password


# Pydantic Schemas
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class UserLogin(BaseModel):
    username: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str


class SendOtpRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp_code: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_new_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


def cleanup_stale_otps(cursor) -> None:
    cursor.execute(
        "DELETE FROM user_otps WHERE is_used = TRUE OR expires_at <= UTC_TIMESTAMP()"
    )


def _issue_otp(cursor, user_id: int, token_type: str) -> str:
    raw_otp, hashed_otp = generate_otp()
    cursor.execute(
        """
        UPDATE user_otps
        SET is_used = TRUE
        WHERE user_id = %s AND token_type = %s AND is_used = FALSE
        """,
        (user_id, token_type),
    )
    cleanup_stale_otps(cursor)
    cursor.execute(
        """
        INSERT INTO user_otps (user_id, token_type, otp_code, expires_at, is_used, attempts)
        VALUES (%s, %s, %s, UTC_TIMESTAMP() + INTERVAL 10 MINUTE, FALSE, 0)
        """,
        (user_id, token_type, hashed_otp),
    )
    return raw_otp


def _validate_otp(connection, cursor, user_id: int, token_type: str, submitted_code: str) -> int:
    cursor.execute(
        """
        SELECT token_id, otp_code, attempts
        FROM user_otps
        WHERE user_id = %s AND token_type = %s
          AND is_used = FALSE AND expires_at > UTC_TIMESTAMP()
        ORDER BY created_at DESC LIMIT 1
        """,
        (user_id, token_type),
    )
    otp_record = cursor.fetchone()
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code.")

    if not verify_otp_hash(submitted_code, otp_record["otp_code"]):
        new_attempts = otp_record["attempts"] + 1
        cursor.execute(
            """
            UPDATE user_otps
            SET attempts = %s,
                is_used = CASE WHEN %s >= %s THEN TRUE ELSE FALSE END
            WHERE token_id = %s
            """,
            (new_attempts, new_attempts, MAX_OTP_ATTEMPTS, otp_record["token_id"]),
        )
        connection.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code.")

    return otp_record["token_id"]


def _generate_unique_username(cursor, base_name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "", base_name.replace(" ", "_")).lower()
    if len(cleaned) < 3:
        cleaned = f"user_{secrets.token_hex(3)}"
    cleaned = cleaned[:24]

    candidate = cleaned
    counter = 1
    while True:
        cursor.execute("SELECT user_id FROM users WHERE username = %s", (candidate,))
        if not cursor.fetchone():
            return candidate
        suffix = f"_{counter}"
        candidate = f"{cleaned[: 24 - len(suffix)]}{suffix}"
        counter += 1


# Register User
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: UserRegister):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT user_id FROM users WHERE username = %s OR email = %s",
            (user.username, user.email),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username or email already registered.")

        hashed_pw = hash_password(user.password)
        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)",
            (user.username, user.email, hashed_pw),
        )
        connection.commit()

        return {
            "message": "User registered successfully",
            "user_id": cursor.lastrowid,
            "username": user.username,
        }

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Login User
@router.post("/login", dependencies=[Depends(login_rate_limiter)])
def login_user(user: UserLogin):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT user_id, username, password_hash FROM users WHERE username = %s",
            (user.username,),
        )
        db_user = cursor.fetchone()

        if not db_user or not verify_password(user.password, db_user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password.")

        access_token = create_access_token(
            data={"sub": db_user["username"], "user_id": db_user["user_id"]}
        )

        return {
            "message": "Login successful",
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": db_user["user_id"],
            "username": db_user["username"],
        }

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Google OAuth Login / Auto-Registration
@router.post("/google", dependencies=[Depends(login_rate_limiter)])
def google_auth(payload: GoogleAuthRequest):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured on the server.",
        )

    try:
        idinfo = google_id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired Google credential.")

    email = idinfo.get("email")
    if not email or not idinfo.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google account email is not verified.")

    picture_url = idinfo.get("picture")
    display_name = idinfo.get("name") or email.split("@")[0]

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT user_id, username, avatar_url FROM users WHERE email = %s",
            (email,),
        )
        db_user = cursor.fetchone()

        if db_user:
            user_id = db_user["user_id"]
            username = db_user["username"]
            if picture_url and not db_user.get("avatar_url"):
                cursor.execute(
                    "UPDATE users SET avatar_url = %s WHERE user_id = %s",
                    (picture_url, user_id),
                )
                connection.commit()
        else:
            username = _generate_unique_username(cursor, display_name)
            random_pw_hash = hash_password(f"Ggl!{secrets.token_urlsafe(24)}9a")
            cursor.execute(
                """
                INSERT INTO users (username, email, password_hash, avatar_url)
                VALUES (%s, %s, %s, %s)
                """,
                (username, email, random_pw_hash, picture_url),
            )
            user_id = cursor.lastrowid
            connection.commit()

        access_token = create_access_token(
            data={"sub": username, "user_id": user_id}
        )

        return {
            "message": "Google authentication successful",
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": user_id,
            "username": username,
        }

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Send OTP (Email Verification)
@router.post("/send-otp", dependencies=[Depends(otp_rate_limiter)])
def send_otp(data: SendOtpRequest, background_tasks: BackgroundTasks):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT user_id FROM users WHERE email = %s", (data.email,))
        user = cursor.fetchone()
        if not user:
            return {"message": "If this email is registered, a verification OTP has been sent."}

        raw_otp = _issue_otp(cursor, user["user_id"], "EmailVerification")
        connection.commit()

        background_tasks.add_task(send_otp_email, data.email, raw_otp, "Email Verification")
        return {"message": "If this email is registered, a verification OTP has been sent."}

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Verify OTP
@router.post("/verify-otp", dependencies=[Depends(login_rate_limiter)])
def verify_otp(data: VerifyOtpRequest):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT user_id FROM users WHERE email = %s", (data.email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP code.")

        token_id = _validate_otp(connection, cursor, user["user_id"], "EmailVerification", data.otp_code)

        cursor.execute("UPDATE user_otps SET is_used = TRUE WHERE token_id = %s", (token_id,))
        cleanup_stale_otps(cursor)
        connection.commit()

        return {"message": "Email verified successfully."}

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Forgot Password
@router.post("/forgot-password", dependencies=[Depends(otp_rate_limiter)])
def forgot_password(data: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT user_id FROM users WHERE email = %s", (data.email,))
        user = cursor.fetchone()
        if not user:
            return {"message": "If this email is registered, a password reset OTP has been sent."}

        raw_otp = _issue_otp(cursor, user["user_id"], "PasswordReset")
        connection.commit()

        background_tasks.add_task(send_otp_email, data.email, raw_otp, "Password Reset")
        return {"message": "If this email is registered, a password reset OTP has been sent."}

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Reset Password
@router.post("/reset-password", dependencies=[Depends(login_rate_limiter)])
def reset_password(data: ResetPasswordRequest):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT user_id FROM users WHERE email = %s", (data.email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired password reset OTP.")

        token_id = _validate_otp(connection, cursor, user["user_id"], "PasswordReset", data.otp_code)
        new_hashed_password = hash_password(data.new_password)

        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE user_id = %s",
            (new_hashed_password, user["user_id"]),
        )
        cursor.execute("UPDATE user_otps SET is_used = TRUE WHERE token_id = %s", (token_id,))
        cleanup_stale_otps(cursor)
        connection.commit()

        return {"message": "Password has been successfully reset. You can now log in."}

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()