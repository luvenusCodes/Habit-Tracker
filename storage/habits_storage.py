# Handles local file reading and writing
import os

import mysql.connector

from dotenv import load_dotenv

load_dotenv()


import datetime

from storage.connection import get_db_connection

#load environment variables from thr .env file

def test_connection():
    try:
        connection = get_db_connection()
        if connection.is_connected():
            db_info = connection.server_info
            print(f"Successfully connected to MySQL Server version {db_info}")
            
            cursor = connection.cursor()
            cursor.execute("SELECT DATABASE();")
            record = cursor.fetchone()
            print(f"Connected to database: {record[0]}")
            
    except mysql.connector.Error as e:
        print(f"Error while connecting to MySQL: {e}")
        
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()
            print("MySQL connection is closed.")

def save_habit_to_mysql(habit_dict):
    """Takes a habit dictionary, opens a MySQL connection, and inserts it."""
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        query = """
            INSERT INTO HABITS (
                user_id, category_id, habit_name, description, 
                priority, status, start_date, target_value, measurement_type
            ) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        cursor.execute(query, (
            habit_dict["user_id"],
            habit_dict["category_id"],
            habit_dict["habit_name"],
            habit_dict.get("description"), #.get() prevents crashing if description is not provided
            habit_dict["priority"],
            habit_dict["status"],
            habit_dict["start_date"],
            habit_dict.get("target_value"),
            habit_dict.get("measurement_type")
        ))
        
        connection.commit()
        print(f"Successfully saved habit '{habit_dict['habit_name']}' to your MySQL database!")

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def get_habit_by_user(user_id):
    #fetches all habits belonging to the provided user_id
    connection = None
    cursor = None
    try: 
        connection = get_db_connection()
        #1. Use dictionary=True so rows come back as clean dictionaries
        # mapping column names to values (e.g, row['habit_name])
        cursor = connection.cursor(dictionary=True)

        query = """ 
                SELECT habit_id, user_id, category_id, habit_name,
                        description, priority, status, start_date, target_value, measurement_type,
                        completed_at, created_at
                FROM HABITS
                WHERE user_id = %s AND deleted_at IS NULL 
                """
        #2. pass parameters as a tuple with the critical trailing comma
        cursor.execute(query, (user_id,))
        return cursor.fetchall()

    except mysql.connector.Error as err:
        print(f"MySql Error occurred: {err}")
        return None

    finally:
        #4. Guarantee resource cleanup regardless of success or failure
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def get_habit_by_id(habit_id, user_id):
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
        SELECT habit_id, user_id, category_id, habit_name,
               description, priority, status, start_date, target_value, measurement_type,
               completed_at, created_at 
        FROM HABITS
        WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL"""

        cursor.execute(query, (habit_id, user_id))
        return cursor.fetchone()

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return None

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def complete_habit(habit_id, user_id, completed_at_str=None):
    """Updates a habit's status to 'Completed' in mysql and records
    the completed_at timestamp, and logs the change to habit_status_history"""
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            print("Database connection failed.")
            return False
        
        cursor = connection.cursor(dictionary=True)
        #1. Fetch current status and verify ownership
        select_query = """
                SELECT status FROM HABITS
                WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL
            """
        cursor.execute(select_query, (habit_id, user_id))
        habit = cursor.fetchone()

        if not habit:
            print("Habit not found or unathorized.")
            return False

        old_status = habit["status"]
        if old_status == 'Completed':
            print("Habit is already marked as completed.")
            return True
         #Determine completion timestamp (default to current UTC/system time if not provided)
        completion_timestamp = completed_at_str or datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        update_query = """
                UPDATE HABITS
                SET status = 'Completed', completed_at = %s
                WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL
                """
        cursor.execute(update_query, (completion_timestamp, habit_id, user_id))

        history_query = """
                INSERT INTO habit_status_history (habit_id, old_status, new_status, changed_by, changed_by_type, reason)
                VALUES (%s, %s, 'Completed', %s, 'User', %s) 
                """
        cursor.execute(history_query, (habit_id, old_status, user_id, "Habit completed via API"))
        
        connection.commit()
        #4. CHeck if a row was actually changed
        return cursor.rowcount > 0
    
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        print(f"MySQL Error occurred: {err}")
        return False

    finally:
        #5. Resource cleanup
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def delete_habit_in_mysql(habit_id, user_id):
    """Soft-deletes a habit by setting its deleted_at timestamp in MySQL."""
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if not connection:
            print("Database connection failed.")
            return False

        cursor = connection.cursor()
        #soft delete: update deleted_at instead of wiping the row
        query = """
                UPDATE HABITS
                SET deleted_at = CURRENT_TIMESTAMP
                WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL
                """
        cursor.execute(query, (habit_id, user_id))
        connection.commit()
        #Returns true if a row was actually updated
        return cursor.rowcount > 0

    except mysql.connector.Error as err:
        print(f"MySQL Error occurred: {err}")
        return False
    
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

if __name__ == "__main__":
    test_connection()