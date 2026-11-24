import os

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from typing import Optional
from jose import jwt, JWTError
from dotenv import load_dotenv

from storage.habits_storage import get_db_connection

load_dotenv()
SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"

router = APIRouter(prefix="/reminders", tags=["Occurrence Reminders"])

def get_current_user_id(authorization: Optional[str] = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=f"Missing or invalid authorization token.")

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, deatil="Invalid authentication credentials.")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials.")

# Pydantic Schema for reminder Creation
class ReminderCreate(BaseModel):
    occurrence_id: int
    reminder_time: str # Format: "YYYY-MM-DD HH:MM:SS" or time representation
    reminder_type: Optional[str] = "Push"

# Create a reminder for an occurrence
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_reminder(reminder_data: ReminderCreate, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        auth_query = """ 
                SELECT o.occurrence_id
                FROM habit_occurrence o
                JOIN habits h ON o.habit_id = h.habit_id
                WHERE o.occurrence_id = $s AND h.user_id = %s
                """
        cursor.execute(auth_query, (reminder_data.occurrence_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, deatil="Occurrence not found or unauthorized.")

        insert_query = """ 
                INSERT INTO occurrence_reminders (occurrence_id, reminder_time, reminder_type, is_active)
                VALUES (%s, %s, %s, TRUE)
                """
        cursor.execute(insert_query, (reminder_data.occurrence_id, reminder_data.reminder_time, reminder_data.reminder_type))
        connection.commit()
        reminder_id = cursor.lastrowid

        return {
            "message": "Reminder created successfully.",
            "reminder_id": reminder_id,
            "occurrence_id": reminder_data.occurrence_id,
            "reminder_time": reminder_data.reminder_time,
            "reminder_type": reminder_data.reminder_type
        }

    except HTTPException as he:
        raise he
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor():
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

# Get reminders for an occurrence
@router.get("/occurrence/{occurrence_id}")
def get_occurrence_reminders(occurrence_id: int, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        auth_query = """ 
            SELECT o.occurrence_id
            FROM habit_occurrences 0
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE o.occurrence_id = %s AND h.user_id = %s
            """
        cursor.execute(auth_query, (occurrence_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Occurrence not found or unauthorized.")

        cursor.execute(
            "SELECT reminder_id, reminder_time, reminder_type, is_active, sent_at FROM occurrence_reminders WHERE occurrence_id = %s",
            (occurrence_id,)
        )
        reminders = cursor.fetchall()

        for r in reminders:
            if r.get("reminder_time"): r["reminder_time"] = str(r["reminder_time"])
            if r.get("sent_at"): r["sent_at"] = str(r["sent_at"])

        return {"occurrence_id": occurrence_id, "reminders": reminders}

    except HTTPException as he:
        raise he
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()