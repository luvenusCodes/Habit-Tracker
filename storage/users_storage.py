import datetime
import mysql.connector

from storage.connection import get_db_connection


def save_user_to_mysql(user_dict):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            print("Database connection failed")
            return False

        cursor = connection.cursor()

        query = """
            INSERT INTO USERS (username, email, password_hash)
            VALUES (%s, %s, %s)
        """
        values = (
            user_dict["username"],
            user_dict["email"],
            user_dict["password_hash"],
        )

        cursor.execute(query, values)
        user_id = cursor.lastrowid

        query_settings = """
            INSERT INTO user_settings (user_id)
            VALUES (%s)
        """
        cursor.execute(query_settings, (user_id,))

        connection.commit()
        print(f"Successfully saved user '{user_dict['username']}' and default settings to MySQL!")
        return True

    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        print(f"MySQL Error occurred: {err}")
        return False

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_user_by_username(username):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
            SELECT username, user_id, email, password_hash, avatar_url
            FROM USERS
            WHERE username = %s
        """
        cursor.execute(query, (username,))
        return cursor.fetchone()

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return None

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_user_by_email(email: str):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
            SELECT username, user_id, email, password_hash, avatar_url
            FROM USERS
            WHERE email = %s
        """
        cursor.execute(query, (email,))
        return cursor.fetchone()

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return None

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_user_settings_from_db(user_id: int):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
            SELECT
                s.email_notifications,
                s.push_notifications,
                s.reminder_time,
                s.timezone,
                s.theme,
                u.avatar_url
            FROM user_settings s
            JOIN USERS u ON u.user_id = s.user_id
            WHERE s.user_id = %s
        """
        cursor.execute(query, (user_id,))
        settings = cursor.fetchone()

        if not settings:
            cursor.execute("INSERT INTO user_settings (user_id) VALUES (%s)", (user_id,))
            connection.commit()
            cursor.execute(query, (user_id,))
            settings = cursor.fetchone()

        return settings

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return None

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def update_user_settings_in_db(user_id: int, settings_dict: dict):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        fields = []
        values = []
        for key, val in settings_dict.items():
            if val is not None:
                fields.append(f"{key} = %s")
                values.append(val)

        if not fields:
            return get_user_settings_from_db(user_id)

        values.append(user_id)
        query = f"UPDATE user_settings SET {', '.join(fields)} WHERE user_id = %s"

        cursor.execute(query, tuple(values))
        connection.commit()
        return get_user_settings_from_db(user_id)

    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        print(f"MySQL Error occurred: {err}")
        return None

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def update_user_profile_in_db(user_id: int, profile_dict: dict):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            raise RuntimeError("Database connection returned None")
        cursor = connection.cursor()

        fields = []
        values = []
        for key, val in profile_dict.items():
            if val is not None or key == "avatar_url":
                fields.append(f"{key} = %s")
                values.append(val)

        if not fields:
            raise ValueError(f"No valid fields in payload: {list(profile_dict.keys())}")

        values.append(user_id)
        query = f"UPDATE USERS SET {', '.join(fields)} WHERE user_id = %s"

        cursor.execute(query, tuple(values))
        connection.commit()

        return get_user_by_id_basic(user_id)

    except Exception as err:
        if connection:
            connection.rollback()
        print(f"Profile update error: {err}", flush=True)
        raise


def get_user_by_id_basic(user_id: int):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT user_id, username, email, avatar_url FROM USERS WHERE user_id = %s",
            (user_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        connection.close()


def delete_user_in_mysql(username):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            print("Database connection failed.")
            return False

        cursor = connection.cursor()

        query = """
            UPDATE USERS
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE username = %s AND deleted_at IS NULL
        """
        cursor.execute(query, (username,))
        connection.commit()

        return cursor.rowcount > 0

    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        print(f"MySQL Error occurred: {err}")
        return False

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()