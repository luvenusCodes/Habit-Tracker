import os

from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from typing import Optional
from jose import jwt, JWTError
from dotenv import load_dotenv

from storage.habits_storage import get_db_connection

load_dotenv()
SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"

router = APIRouter()


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


class CategoryCreate(BaseModel):
    category_name: str
    description: Optional[str] = None
    color_code: Optional[str] = "#3498db"


class CategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    description: Optional[str] = None
    color_code: Optional[str] = None


class Category:
    def __init__(self, user_id, category_name, description=None, color_code="#3498db", category_id=None):
        self.category_id = category_id
        self.user_id = user_id
        self.category_name = category_name
        self.description = description
        self.color_code = color_code

    def to_dict(self):
        return {
            "category_id": self.category_id,
            "user_id": self.user_id,
            "category_name": self.category_name,
            "description": self.description,
            "color_code": self.color_code,
        }

    def __str__(self):
        return f"Category(name={self.category_name}, user_id={self.user_id})"


@router.get("/")
def get_categories(user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT category_id, user_id, category_name, description
            FROM categories
            WHERE user_id = %s AND deleted_at IS NULL
            ORDER BY category_name ASC
            """,
            (user_id,),
        )
        rows = cursor.fetchall()

        categories_list = [
            Category(
                category_id=row["category_id"],
                user_id=row["user_id"],
                category_name=row["category_name"],
                description=row.get("description"),
            ).to_dict()
            for row in rows
        ]

        return {"categories": categories_list}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_category(category_data: CategoryCreate, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        clean_name = category_data.category_name.strip()

        cursor.execute(
            """
            SELECT category_id FROM categories
            WHERE user_id = %s AND category_name = %s AND deleted_at IS NULL
            """,
            (user_id, clean_name),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Category with this name already exists")

        insert_query = """
            INSERT INTO categories (user_id, category_name, description)
            VALUES (%s, %s, %s)
        """
        cursor.execute(insert_query, (user_id, clean_name, category_data.description))
        connection.commit()

        new_category_id = cursor.lastrowid
        new_cat = Category(
            user_id=user_id,
            category_name=clean_name,
            description=category_data.description,
            color_code=category_data.color_code or "#3498db",
            category_id=new_category_id,
        )

        return {
            "message": "Category created successfully",
            "category": new_cat.to_dict(),
        }

    except HTTPException as he:
        raise he
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@router.put("/{category_id}")
def update_category(category_id: int, category_data: CategoryUpdate, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT category_id FROM categories WHERE category_id = %s AND user_id = %s AND deleted_at IS NULL",
            (category_id, user_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Category not found or unauthorized.")

        update_fields = []
        values = []
        if category_data.category_name is not None:
            update_fields.append("category_name = %s")
            values.append(category_data.category_name.strip())
        if category_data.description is not None:
            update_fields.append("description = %s")
            values.append(category_data.description)

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields provided for update.")

        values.extend([category_id, user_id])
        update_query = f"UPDATE categories SET {', '.join(update_fields)} WHERE category_id = %s AND user_id = %s"

        cursor.execute(update_query, tuple(values))
        connection.commit()

        return {"message": "Category updated successfully."}

    except HTTPException as he:
        raise he
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@router.delete("/{category_id}")
def delete_category(category_id: int, user_id: int = Depends(get_current_user_id)):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT category_id FROM categories WHERE category_id = %s AND user_id = %s AND deleted_at IS NULL",
            (category_id, user_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Category not found or unauthorized.")

        cursor.execute(
            "UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE category_id = %s AND user_id = %s",
            (category_id, user_id),
        )
        connection.commit()

        return {"message": "Category deleted successfully."}

    except HTTPException as he:
        raise he
    except Exception as err:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()