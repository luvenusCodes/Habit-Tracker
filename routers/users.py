import bcrypt

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from routers.auth import get_current_user
from storage.users_storage import (
    get_user_by_username,
    get_user_settings_from_db,
    update_user_settings_in_db,
    update_user_profile_in_db
)

router = APIRouter(prefix="/users", tags=["Users & Setttings"])


# Pydantic Schemas
class UserSettingsResponse(BaseModel):
    email_notifications: bool
    push_notifications: bool
    reminder_time: str
    timezone: str
    theme: str
    avatar_url: Optional[str] = None


class UserSettingsUpdate(BaseModel):
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    reminder_time: Optional[str] = None
    timezone: Optional[str] = None
    theme: Optional[str] = None


class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = Field(default=None, max_length=500_000)


@router.get("/")
def get_users():
    return {"habits": []}


class User:
    def __init__(
        self,
        username,
        email,
        user_id=None,
        password_hash=None,
        avatar_url=None
    ):
        self.user_id = user_id
        self.username = username
        self.email = email
        self.password_hash = password_hash
        self.avatar_url = avatar_url

    def set_password(self, plain_password: str):
        # Hashes a plain_text password and stores it.
        password_bytes = plain_password.encode('utf-8')[:72]
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password_bytes, salt).decode('utf-8')

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "username": self.username,
            "email": self.email,
            "password_hash": self.password_hash,
            "avatar_url": self.avatar_url
        }


def _resolve_user_id(current_user: dict) -> Optional[int]:
    user_id = current_user.get("user_id") or current_user.get("id")
    if user_id is not None:
        return int(user_id)

    lookup_name = current_user.get("username") or current_user.get("sub")
    if lookup_name:
        db_user = get_user_by_username(lookup_name)
        if db_user:
            return db_user.get("user_id")

    return None


# Endpoints
@router.get("/settings", response_model=UserSettingsResponse)
def get_user_settings(current_user: dict = Depends(get_current_user)):
    user_id = _resolve_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not resolve user identity")

    settings = get_user_settings_from_db(user_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return settings


@router.patch("/settings", response_model=UserSettingsResponse)
def update_user_settings(
    settings: UserSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    user_id = _resolve_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not resolve user identity")

    update_data = settings.dict(exclude_unset=True)
    updated_settings = update_user_settings_in_db(user_id, update_data)
    if not updated_settings:
        raise HTTPException(status_code=400, detail="Failed to update settings")
    return updated_settings


@router.patch("/profile")
def update_user_profile(
    profile: UserProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    user_id = _resolve_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not resolve user identity")

    update_data = profile.dict(exclude_unset=True)
    try:
        updated_user = update_user_profile_in_db(user_id, update_data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not updated_user:
        raise HTTPException(status_code=400, detail=f"User {user_id} not found after update")

    return {
        "message": "Profile updated successfully",
        "username": updated_user.get("username"),
        "email": updated_user.get("email"),
        "avatar_url": updated_user.get("avatar_url")
    }