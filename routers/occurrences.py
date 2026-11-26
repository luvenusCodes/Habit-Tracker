import os
from datetime import date, datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from storage.occurrences_storage import (
    OccurrenceRuleError,
    carry_forward_occurrence_in_db,
    fetch_habit_analytics,
    fetch_occurrence_history,
    fetch_score_summary,
    fetch_user_occurrences_for_date,
    generate_occurrences_for_date,
    update_occurrence_status_in_db,
)

import logging

logger = logging.getLogger(__name__)

load_dotenv()
SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"

router = APIRouter(prefix="/occurrences", tags=["Habit Occurrences"])


def get_current_user_id(authorization: Optional[str] = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token.")

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials.")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials.")


# Pydantic schema for occurrence generation
class GenerateOccurrencesRequest(BaseModel):
    target_date: Optional[str] = None


# Generate Occurrences for Active Schedules
@router.post("/generate", status_code=status.HTTP_201_CREATED)
def generate_occurrences(payload: GenerateOccurrencesRequest, user_id: int = Depends(get_current_user_id)):
    try:
        return generate_occurrences_for_date(user_id=user_id, target_date_str=payload.target_date)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected se") 

# Get User Occurrences for a given date
@router.get("/")
def get_user_occurrences(date_str: Optional[str] = None, user_id: int = Depends(get_current_user_id)):
    try:
        return fetch_user_occurrences_for_date(user_id=user_id, date_str=date_str)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")


# Completion and Missed Activities Endpoint
class OccurrenceStatusUpdate(BaseModel):
    status: str  # 'Done', 'Not Done', 'Skipped', 'Cancelled'
    reason: Optional[str] = None


@router.patch("/{occurrence_id}/status")
def update_occurrence_status(
    occurrence_id: int,
    update_data: OccurrenceStatusUpdate,
    user_id: int = Depends(get_current_user_id),
):
    try:
        return update_occurrence_status_in_db(
            occurrence_id=occurrence_id,
            new_status=update_data.status,
            user_id=user_id,
            reason=update_data.reason,
        )
    except OccurrenceRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")


# Carry-Forward Endpoint
class CarryForwardRequest(BaseModel):
    target_date: Optional[str] = None  # Optional target date for the rolled-over task (defaults to tomorrow)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None


@router.post("/{occurrence_id}/carry-forward", status_code=status.HTTP_201_CREATED)
def carry_forward_occurrence(
    occurrence_id: int,
    payload: CarryForwardRequest,
    user_id: int = Depends(get_current_user_id),
):
    try:
        return carry_forward_occurrence_in_db(
            occurrence_id=occurrence_id,
            user_id=user_id,
            target_date_str=payload.target_date,
            start_time_str=payload.start_time,
            end_time_str=payload.end_time,
            duration_minutes=payload.duration_minutes,
        )
    except OccurrenceRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")


@router.get("/{occurrence_id}/history")
def get_occurrence_history(occurrence_id: int, user_id: int = Depends(get_current_user_id)):
    try:
        return fetch_occurrence_history(occurrence_id=occurrence_id, user_id=user_id)
    except OccurrenceRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")


# Scoring Summary & Analytics Endpoint
@router.get("/score-summary")
def get_score_summary(date_str: Optional[str] = None, user_id: int = Depends(get_current_user_id)):
    try:
        return fetch_score_summary(user_id=user_id, date_str=date_str)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")


# Multi-Day Analytics & Streak Tracking Endpoint
@router.get("/analytics")
def get_habit_analytics(days: int = 30, user_id: int = Depends(get_current_user_id)):
    try:
        return fetch_habit_analytics(user_id=user_id, days=days)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")