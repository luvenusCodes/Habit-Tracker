import logging
import os
from datetime import date, timedelta
from typing import Dict, List, Literal, Optional, Tuple

import mysql.connector
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from storage.connection import get_db_connection
from storage.occurrences_storage import generate_occurrences_for_date

load_dotenv()

logger = logging.getLogger(__name__)

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


def _time_to_minutes(time_str: str) -> int:
    parts = [int(p) for p in time_str.split(":")]
    return parts[0] * 60 + parts[1]


def _compute_interval(
    start_str: str,
    end_str: Optional[str],
    duration_minutes: Optional[int],
) -> Tuple[int, int, str]:
    start_min = _time_to_minutes(start_str)
    start_short = f"{start_min // 60:02d}:{start_min % 60:02d}"

    if end_str:
        raw_end = _time_to_minutes(end_str)
        end_min = raw_end if raw_end > start_min else raw_end + 1440
    elif duration_minutes and duration_minutes > 0:
        end_min = start_min + int(duration_minutes)
    else:
        end_min = start_min

    end_display_min = end_min % 1440
    end_short = f"{end_display_min // 60:02d}:{end_display_min % 60:02d}"
    next_day_tag = " (+1d)" if end_min >= 1440 else ""
    return start_min, end_min, f"{start_short}–{end_short}{next_day_tag}"


def _intervals_collide(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    for shift in (-1440, 0, 1440):
        s2 = b_start + shift
        e2 = b_end + shift
        if a_start <= e2 and s2 <= a_end:
            return True
    return False


# Pydantic Schemas
class ScheduleCreate(BaseModel):
    habit_id: int
    day_of_week: str
    start_time: str
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Literal["Active", "Inactive"] = "Active"
    allow_overlap: bool = False


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
        cursor = connection.cursor(dictionary=True, buffered=True)

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
                detail=f"This habit already has a schedule on {schedule_data.day_of_week} at {schedule_data.start_time[:5]}.",
            )

        # Check time collisions across all active schedules on that day of the week
        if schedule_data.status == "Active" and not schedule_data.allow_overlap:
            new_start, new_end, new_window = _compute_interval(
                schedule_data.start_time,
                schedule_data.end_time,
                schedule_data.duration_minutes,
            )

            cursor.execute(
                """
                SELECT s.schedule_id, s.habit_id, h.habit_name, s.start_time, s.end_time, s.duration_minutes
                FROM habit_schedule s
                JOIN habits h ON s.habit_id = h.habit_id
                WHERE h.user_id = %s
                  AND h.deleted_at IS NULL
                  AND s.status = 'Active'
                  AND s.day_of_week = %s
                """,
                (user_id, schedule_data.day_of_week),
            )
            existing_slots = cursor.fetchall()

            conflicts: List[Dict[str, str]] = []
            for slot in existing_slots:
                ex_start_str = _format_time_str(slot.get("start_time")) or "00:00:00"
                ex_end_str = _format_time_str(slot.get("end_time"))
                ex_dur = slot.get("duration_minutes")
                ex_start, ex_end, ex_window = _compute_interval(ex_start_str, ex_end_str, ex_dur)

                if _intervals_collide(new_start, new_end, ex_start, ex_end):
                    conflicts.append(
                        {
                            "habit_name": slot["habit_name"],
                            "window": ex_window,
                        }
                    )

            if conflicts:
                conflict_summary = ", ".join(
                    f"{c['habit_name']} ({c['window']})" for c in conflicts
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "SCHEDULE_COLLISION",
                        "message": (
                            f"{schedule_data.day_of_week} ({new_window}) overlaps or touches "
                            f"{conflict_summary}."
                        ),
                        "day_of_week": schedule_data.day_of_week,
                        "conflicts": conflicts,
                    },
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

        # Auto-generate today's occurrence immediately if this active schedule matches today
        today = date.today()
        if schedule_data.status == "Active" and schedule_data.day_of_week == today.strftime("%A"):
            try:
                generate_occurrences_for_date(user_id=user_id, target_date_str=str(today))
            except Exception:
                logger.exception("Auto-generation after schedule creation failed")

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
    except Exception:
        if connection:
            connection.rollback()
        logger.exception("Unexpected error creating schedule")
        raise HTTPException(
            status_code=500,
            detail="Unable to save the schedule right now. Please try again.",
        )
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
        cursor = connection.cursor(dictionary=True, buffered=True)

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
    except Exception:
        logger.exception("Unexpected error fetching schedules for habit_id=%s", habit_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to load schedules right now. Please try again.",
        )
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
        cursor = connection.cursor(dictionary=True, buffered=True)

        cursor.execute(
            """
            SELECT s.schedule_id, s.day_of_week
            FROM habit_schedule s
            JOIN habits h ON s.habit_id = h.habit_id
            WHERE s.schedule_id = %s AND h.user_id = %s AND h.deleted_at IS NULL
            """,
            (schedule_id, user_id),
        )
        schedule_row = cursor.fetchone()
        if not schedule_row:
            raise HTTPException(status_code=404, detail="Schedule not found or unauthorized.")

        cursor.execute(
            "UPDATE habit_schedule SET status = %s WHERE schedule_id = %s",
            (status_data.status, schedule_id),
        )

        today = date.today()
        if status_data.status == "Inactive":
            cursor.execute(
                """
                DELETE FROM habit_occurrences
                WHERE schedule_id = %s
                  AND user_id = %s
                  AND occurrence_date >= %s
                  AND status = 'Pending'
                """,
                (schedule_id, user_id, today),
            )

        connection.commit()

        if status_data.status == "Active" and schedule_row["day_of_week"] == today.strftime("%A"):
            try:
                generate_occurrences_for_date(user_id=user_id, target_date_str=str(today))
            except Exception:
                logger.exception("Auto-generation after schedule activation failed")

        return {
            "message": f"Schedule status updated to '{status_data.status}'.",
            "schedule_id": schedule_id,
            "status": status_data.status,
        }

    except HTTPException:
        raise
    except Exception:
        if connection:
            connection.rollback()
        logger.exception("Unexpected error updating schedule status schedule_id=%s", schedule_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to update schedule status right now. Please try again.",
        )
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
        cursor = connection.cursor(dictionary=True, buffered=True)

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

        # Remove pending future/today occurrences first so they vanish from the dashboard
        cursor.execute(
            """
            DELETE FROM habit_occurrences
            WHERE schedule_id = %s
              AND user_id = %s
              AND occurrence_date >= %s
              AND status = 'Pending'
            """,
            (schedule_id, user_id, date.today()),
        )

        cursor.execute(
            "SELECT COUNT(*) AS cnt FROM habit_occurrences WHERE schedule_id = %s",
            (schedule_id,),
        )
        occurrence_count = cursor.fetchone()["cnt"]

        if occurrence_count > 0:
            cursor.execute(
                "UPDATE habit_schedule SET status = 'Inactive' WHERE schedule_id = %s",
                (schedule_id,),
            )
            connection.commit()
            return {
                "message": "This schedule already has logged occurrences, so it was set to Inactive to preserve your history.",
                "schedule_id": schedule_id,
                "archived": True,
            }

        cursor.execute("DELETE FROM habit_schedule WHERE schedule_id = %s", (schedule_id,))
        connection.commit()

        return {
            "message": "Schedule removed successfully.",
            "schedule_id": schedule_id,
            "archived": False,
        }

    except HTTPException:
        raise
    except mysql.connector.IntegrityError:
        if connection:
            connection.rollback()
        raise HTTPException(
            status_code=400,
            detail="This schedule has linked history and cannot be permanently removed. Switch it to Inactive instead.",
        )
    except Exception:
        if connection:
            connection.rollback()
        logger.exception("Unexpected error deleting schedule schedule_id=%s", schedule_id)
        raise HTTPException(
            status_code=500,
            detail="Unable to remove this schedule right now. Please try again.",
        )
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()