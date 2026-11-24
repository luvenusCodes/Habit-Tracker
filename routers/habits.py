import os
from datetime import date, datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from storage.habits_storage import get_db_connection

load_dotenv()

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"

router = APIRouter(prefix="/habits", tags=["Habits"])


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


# Pydantic schemas for request validation
class HabitCreate(BaseModel):
    category_id: Optional[int] = None
    habit_name: str
    description: Optional[str] = None
    priority: Optional[str] = "Medium"
    start_date: Optional[str] = None
    target_value: Optional[float] = None
    measurement_type: Optional[str] = None


class HabitUpdate(BaseModel):
    category_id: Optional[int] = None
    habit_name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    target_value: Optional[float] = None
    measurement_type: Optional[str] = None


# Habit domain model
class Habit:
    def __init__(
        self,
        habit_name,
        habit_id=None,
        user_id=1,
        category_id=None,
        description=None,
        priority="Medium",
        status="Active",
        start_date=None,
        target_value=None,
        measurement_type=None,
        completed_at=None,
    ):
        self.habit_id = habit_id
        self.user_id = user_id
        self.category_id = category_id
        self.habit_name = habit_name
        self.description = description

        self.priority = priority if priority in ["High", "Medium", "Low"] else "Medium"
        self.status = status if status in ["Active", "Paused", "Completed", "Archived", "Deleted"] else "Active"

        self.start_date = start_date or date.today().isoformat()
        self.target_value = target_value
        self.measurement_type = measurement_type
        self.completed_at = completed_at

    def to_dict(self):
        return {
            "habit_id": self.habit_id,
            "user_id": self.user_id,
            "category_id": self.category_id,
            "habit_name": self.habit_name,
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
            "start_date": self.start_date,
            "target_value": self.target_value,
            "measurement_type": self.measurement_type,
            "completed_at": self.completed_at,
        }


# Create Habit
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_habit(habit_data: HabitCreate, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        clean_name = habit_data.habit_name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Habit name cannot be empty.")

        resolved_category_id = habit_data.category_id
        if resolved_category_id is not None:
            cursor.execute(
                "SELECT category_id FROM categories WHERE category_id = %s AND user_id = %s AND deleted_at IS NULL",
                (resolved_category_id, user_id),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=400, detail="Invalid category_id or category does not belong to user.")
        else:
            cursor.execute(
                "SELECT category_id FROM categories WHERE user_id = %s AND deleted_at IS NULL ORDER BY category_id ASC LIMIT 1",
                (user_id,),
            )
            cat_row = cursor.fetchone()
            resolved_category_id = cat_row["category_id"] if cat_row else None

        if resolved_category_id is None:
            raise HTTPException(status_code=400, detail="Please create or select a category before creating a habit.")

        resolved_start_date = (habit_data.start_date or "").strip() or date.today().isoformat()

        new_habit_obj = Habit(
            user_id=user_id,
            category_id=resolved_category_id,
            habit_name=clean_name,
            description=habit_data.description,
            priority=habit_data.priority,
            start_date=resolved_start_date,
            target_value=habit_data.target_value,
            measurement_type=habit_data.measurement_type,
        )

        insert_query = """
            INSERT INTO habits (
                user_id, category_id, habit_name, description, priority, status,
                start_date, target_value, measurement_type
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(
            insert_query,
            (
                new_habit_obj.user_id,
                new_habit_obj.category_id,
                new_habit_obj.habit_name,
                new_habit_obj.description,
                new_habit_obj.priority,
                new_habit_obj.status,
                new_habit_obj.start_date,
                new_habit_obj.target_value,
                new_habit_obj.measurement_type,
            ),
        )
        connection.commit()
        new_habit_obj.habit_id = cursor.lastrowid

        return {
            "message": "Habit created successfully",
            "habit": new_habit_obj.to_dict(),
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


# Get all habits for logged-in user
@router.get("/")
def get_habits(user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT * FROM habits WHERE user_id = %s AND deleted_at IS NULL ORDER BY habit_id DESC",
            (user_id,),
        )
        rows = cursor.fetchall()

        habits_list = [
            Habit(
                habit_id=row["habit_id"],
                user_id=row["user_id"],
                category_id=row["category_id"],
                habit_name=row["habit_name"],
                description=row.get("description"),
                priority=row.get("priority", "Medium"),
                status=row.get("status", "Active"),
                start_date=str(row.get("start_date")) if row.get("start_date") else None,
                target_value=float(row["target_value"]) if row.get("target_value") is not None else None,
                measurement_type=row.get("measurement_type"),
                completed_at=str(row.get("completed_at")) if row.get("completed_at") else None,
            ).to_dict()
            for row in rows
        ]

        return {"habits": habits_list}

    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# Update Habit
@router.put("/{habit_id}")
def update_habit(habit_id: int, habit_data: HabitUpdate, user_id: int = Depends(get_current_user_id)):
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

        update_fields = []
        values = []

        if habit_data.category_id is not None:
            cursor.execute(
                "SELECT category_id FROM categories WHERE category_id = %s AND user_id = %s AND deleted_at IS NULL",
                (habit_data.category_id, user_id),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=400, detail="Provided category_id does not belong to user.")
            update_fields.append("category_id = %s")
            values.append(habit_data.category_id)

        if habit_data.habit_name is not None:
            clean_name = habit_data.habit_name.strip()
            if not clean_name:
                raise HTTPException(status_code=400, detail="Habit name cannot be empty.")
            update_fields.append("habit_name = %s")
            values.append(clean_name)

        if habit_data.description is not None:
            update_fields.append("description = %s")
            values.append(habit_data.description)

        if habit_data.priority is not None:
            if habit_data.priority not in ["High", "Medium", "Low"]:
                raise HTTPException(status_code=400, detail="Invalid priority value.")
            update_fields.append("priority = %s")
            values.append(habit_data.priority)

        if habit_data.status is not None:
            if habit_data.status not in ["Active", "Paused", "Completed", "Archived", "Deleted"]:
                raise HTTPException(status_code=400, detail="Invalid status value.")
            update_fields.append("status = %s")
            values.append(habit_data.status)

        if habit_data.target_value is not None:
            update_fields.append("target_value = %s")
            values.append(habit_data.target_value)

        if habit_data.measurement_type is not None:
            update_fields.append("measurement_type = %s")
            values.append(habit_data.measurement_type)

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields provided for update.")

        values.extend([habit_id, user_id])
        update_query = f"UPDATE habits SET {', '.join(update_fields)} WHERE habit_id = %s AND user_id = %s"

        cursor.execute(update_query, tuple(values))
        connection.commit()

        return {"message": "Habit updated successfully."}

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


# Delete Habit (soft-delete)
@router.delete("/{habit_id}")
def delete_habit(habit_id: int, user_id: int = Depends(get_current_user_id)):
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
            "UPDATE habits SET deleted_at = CURRENT_TIMESTAMP WHERE habit_id = %s AND user_id = %s",
            (habit_id, user_id),
        )
        connection.commit()

        return {"message": "Habit deleted successfully."}

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