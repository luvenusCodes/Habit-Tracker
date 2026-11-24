import os
from datetime import datetime, timedelta
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from storage.connection import get_db_connection

load_dotenv()

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"

router = APIRouter(prefix="/schedules", tags=["Schedules"])

VALID_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


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


def _format_time_str(val) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, timedelta):
        total_seconds = int(val.total_seconds())
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return str(val)


# Pydantic Schemas
class ScheduleCreate(BaseModel):
    habit_id: int
    day_of_week: str
    start_time: str
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Literal["Active", "Inactive"] = "Active"


class ScheduleStatusUpdate(BaseModel):
    status: Literal["Active", "Inactive"]


# Create Schedule
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_schedule(schedule_data: ScheduleCreate, user_id: int = Depends(get_current_user_id)):
    if schedule_data.day_of_week not in VALID_DAYS:
        raise HTTPException(status_code=400, detail=f"day_of_week must be one of {VALID_DAYS}.")

    if schedule_data.end_time and schedule_data.duration_minutes is not None:
        raise HTTPException(
            status_code=400,
            detail="Provide either end_time or duration_minutes, not both.",
        )

    if schedule_data.duration_minutes is not None and schedule_data.duration_minutes <= 0:
        raise HTTPException(
            status_code=400,
            detail="duration_minutes must be greater than 0.",
        )

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Verify habit ownership
        cursor.execute(
            "SELECT habit_id FROM habits WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL",
            (schedule_data.habit_id, user_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Habit not found or unauthorized.")

        # Prevent duplicate slot for same habit, day, and start_time
        cursor.execute(
            """
            SELECT schedule_id FROM habit_schedule
            WHERE habit_id = %s AND day_of_week = %s AND start_time = %s
            """,
            (schedule_data.habit_id, schedule_data.day_of_week, schedule_data.start_time),
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail=f"A schedule already exists for {schedule_data.day_of_week} at {schedule_data.start_time}.",
            )

        insert_query = """
            INSERT INTO habit_schedule (
                habit_id, day_of_week, start_time, end_time, duration_minutes, status
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        cursor.execute(
            insert_query,
            (
                schedule_data.habit_id,
                schedule_data.day_of_week,
                schedule_data.start_time,
                schedule_data.end_time,
                schedule_data.duration_minutes,
                schedule_data.status,
            ),
        )
        connection.commit()
        new_schedule_id = cursor.lastrowid

        return {
            "message": "Schedule created successfully.",
            "schedule": {
                "schedule_id": new_schedule_id,
                "habit_id": schedule_data.habit_id,
                "day_of_week": schedule_data.day_of_week,
                "start_time": schedule_data.start_time,
                "end_time": schedule_data.end_time,
                "duration_minutes": schedule_data.duration_minutes,
                "status": schedule_data.status,
            },
        }

    except HTTPException:
        raise
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Get all schedules for a specific habit
@router.get("/habit/{habit_id}")
def get_schedules_for_habit(habit_id: int, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT habit_id FROM habits WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL",
            (habit_id, user_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Habit not found or unauthorized.")

        cursor.execute(
            """
            SELECT schedule_id, habit_id, day_of_week, start_time, end_time, duration_minutes, status, created_at
            FROM habit_schedule
            WHERE habit_id = %s
            ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
                     start_time ASC
            """,
            (habit_id,),
        )
        rows = cursor.fetchall()

        schedules = []
        for row in rows:
            schedules.append(
                {
                    "schedule_id": row["schedule_id"],
                    "habit_id": row["habit_id"],
                    "day_of_week": row["day_of_week"],
                    "start_time": _format_time_str(row.get("start_time")),
                    "end_time": _format_time_str(row.get("end_time")),
                    "duration_minutes": row.get("duration_minutes"),
                    "status": row["status"],
                    "created_at": str(row["created_at"]) if row.get("created_at") else None,
                }
            )

        return {"habit_id": habit_id, "schedules": schedules}

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Update schedule status (Active / Inactive)
@router.patch("/{schedule_id}/status")
def update_schedule_status(
    schedule_id: int,
    status_data: ScheduleStatusUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT s.schedule_id
            FROM habit_schedule s
            JOIN habits h ON s.habit_id = h.habit_id
            WHERE s.schedule_id = %s AND h.user_id = %s AND h.deleted_at IS NULL
            """,
            (schedule_id, user_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Schedule not found or unauthorized.")

        cursor.execute(
            "UPDATE habit_schedule SET status = %s WHERE schedule_id = %s",
            (status_data.status, schedule_id),
        )
        connection.commit()

        return {
            "message": f"Schedule status updated to '{status_data.status}'.",
            "schedule_id": schedule_id,
            "status": status_data.status,
        }

    except HTTPException:
        raise
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Delete Schedule
@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT s.schedule_id
            FROM habit_schedule s
            JOIN habits h ON s.habit_id = h.habit_id
            WHERE s.schedule_id = %s AND h.user_id = %s
            """,
            (schedule_id, user_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Schedule not found or unauthorized.")

        cursor.execute("DELETE FROM habit_schedule WHERE schedule_id = %s", (schedule_id,))
        connection.commit()

        return {"message": "Schedule deleted successfully.", "schedule_id": schedule_id}

    except HTTPException:
        raise
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()