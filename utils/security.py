import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from dotenv import load_dotenv
from jose import jwt

# Load security settings from .env
load_dotenv(override=False)

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("FATAL ERROR: JWT_SECRET_KEY is not set in the environment variables.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


def _truncate_password(password: str) -> bytes:
    if not isinstance(password, str):
        password = str(password)
    return password.encode("utf-8", errors="ignore")[:72]


def hash_password(password: str) -> str:
    pwd_bytes = _truncate_password(password)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = _truncate_password(plain_password)
    stored_hash_bytes = hashed_password.encode("utf-8")
    try:
        return bcrypt.checkpw(pwd_bytes, stored_hash_bytes)
    except ValueError:
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Generates a JWT access token for session authorization."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta is not None else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def generate_otp() -> tuple[str, str]:
    """Generate a 6-digit cryptographic OTP and its SHA-256 hex digest."""
    raw_code = f"{secrets.randbelow(1_000_000):06d}"
    hashed_code = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
    return raw_code, hashed_code


def verify_otp_hash(submitted_code: str, stored_hash: str) -> bool:
    """Verify a submitted OTP against its stored SHA-256 digest in constant time."""
    if not submitted_code or not stored_hash:
        return False
    submitted_hash = hashlib.sha256(submitted_code.strip().encode("utf-8")).hexdigest()
    return hmac.compare_digest(submitted_hash, stored_hash)