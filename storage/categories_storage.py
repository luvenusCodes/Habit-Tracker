import mysql.connector

from storage.connection import get_db_connection

import datetime

def save_category_to_mysql(category_dict):
    #saves a new category to mysql database.
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            print("Database connection failed.")
            return False
        
        cursor = connection.cursor()

        query = """
                INSERT INTO CATEGORIES(
                    category_name, description, user_id)
                    VALUES (%s, %s, %s)
                    """
        #Safely extracting values from the dictionary
        cursor.execute(query, (  
            category_dict["category_name"],
            category_dict.get("description"), # .get() prevents errors if description is omited
            category_dict["user_id"]
        ))

        connection.commit()
        print(f"Successfully saved category '{category_dict['category_name']}'!")

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def get_categories_by_user(user_id):
    #Fetches all active categories belonging to the given user_id
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            return []

        cursor = connection.cursor(dictionary=True)

        query = """
        SELECT category_id, category_name, description, created_at
        FROM CATEGORIES
        WHERE   user_id = %s AND deleted_at IS NULL """

        cursor.execute(query, (user_id,))
        categories = cursor.fetchall()
        return categories

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return[]

    finally: 
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def get_category_by_id(category_id, user_id):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
                SELECT category_id, user_id, category_name, description
                FROM CATEGORIES
                WHERE category_id = %s AND user_id =%s AND deleted_at IS NULL"""

        cursor.execute(query, (category_id, user_id))
        category_record = cursor.fetchone()
        return category_record

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return None

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def delete_category_in_mysql(category_id, user_id):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            print("Database connection failed.")
            return False

        cursor = connection.cursor()

        query = """
                UPDATE CATEGORIES
                SET deleted_at = CURRENT_TIMESTAMP
                WHERE category_id = %s AND user_id = %s AND deleted_at IS NULL"""

        cursor.execute(query, (category_id, user_id))
        connection.commit()
        
        return cursor.rowcount > 0

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return False

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()
    