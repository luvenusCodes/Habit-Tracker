from categories_storage import get_categories_by_user

from habits import Habit

from storage.habits_storage import (
    save_habit_to_mysql, 
    get_habit_by_user, 
    complete_habit, 
    delete_habit_in_mysql
)
import datetime

def habit_menu(user_id):
    #Handles the terminal menu loop for habit operations.
    while True:
        print("\n=== HABIT MANAGEMENT ===")
        print("1. Add a new habit")
        print("2. View my Habits")
        print("3. Complete  habit")
        print("4. Delete  habit")
        print("5. Return to Main Menu")
        
        choice = input("Choose an option (1-5): ").strip()
        
        if choice == "1":
            # Step A: Habits require a category. Let's fetch categories first.
            categories = get_categories_by_user(user_id)
            if not categories:
                print("\nYou must create a category before adding habits! Please go to Category Management first.")
                continue

            print('\n--- Your Categories ---')
            for cat in categories:
                print(f"- {cat['category_name']}")

            cat_name = input("Enter the category name for this habit: ").strip()

            category_id = None
            for cat in categories:
                if cat['category_name'].lower() == cat_name.lower():
                    category_id = cat['category_id']
                    break
            if not category_id:
                print(f"No category named '{cat_name}' found. Habit creation cancelled.")
                continue
            #Get Habit Details
            habit_name = input("Enter habit name (e.g., Morning jog): ").strip()
            if not habit_name:
                print("Habit name cannot be empty.")
                continue

            description = input("Enter description (optional, pree Enter to skip): ").strip()
            description = description if description else None

            priority_input = input("Enter priority [High, Medium, Low] (Default is Medium): ").strip().capitalize()
            priority = priority_input if priority_input in ["High, Medium, Low"] else "Medium"

            #Optional Measurement Pairing
            has_target = input("Do you want to set a measurable target (e.g., 30mins, 5 pages)? (y/n): ").strip().lower()
            measurement_type = None
            target_value = None

            if has_target == 'y':
                mesurement_type = input("Enter measurement unit (e.g., minutyes, pages, reps): ").strip()
                try:
                    target_value = float(input("Enter numeric target value: ").strip())
                except ValueError:
                    print("Invalid target value. Setting measurements to None.")
                    measurement_type = None
                    target_value = None

                #Build the habit dictionary payload
                habit_dict = {
                    "user_id": user_id,
                    "category_id": category_id,
                    "habit_name": habit_name,
                    "description": description,
                    "priority": priority,
                    "status": "Active",
                    "start_date": datetime.date.today(),
                    "target_calue": target_value,
                    "measurement_type": measurement_type                    
                }

                save_habit_to_mysql(habit_dict)
                
        elif choice == "2":
            habits = get_habit_by_user(user_id)
            if not habits:
                print("\nYou have no habits saved yet.")
            else:
                print("\n--- Your habits ---")
                for h in habits:
                    print(f"Name: {h['habit_name']} | Status: {h['status']} | Priority: {h['priority']} | Start: {h['start_date']}")
                    if h['description']:
                        print(f"    Description: {h['description']}")
                    if h['target_value']:
                        print(f"    Target: {h['target_value']} {h['measurement_type']}")
                    print("-" * 40)
                       
        elif choice == "3":
            habits = get_habit_by_user(user_id)
            #filter for active/paused habits that can be completed
            active_habits = [h for h in habits if h['status'] in ['Active', 'Paused']]

            if not active_habits:
                print("\nYou have no active habits to complete.")
                continue

            print("\n-- Active Habits ---")
            for h in active_habits:
                print(f"- {h['habit_name']}")

            habit_name_to_complete = input("\nEnter the name of the habit you completed: ").strip()

            habit_id = None
            for h in active_habits:
                if h['habit_name'].lower() == habit_name_to_complete.lower():
                    habit_id = h['habit_id']
                    break

            if habit_id:
                #capture current timestamp for completed_at
                completed_at = datetime.datetime.now()
                success = complete_habit(habit_id, user_id, completed_at)
                if success:
                    print(f"Awesome job💪! Habit '{habit_name_to_complete}' marked as Completed🫡.")
                else:
                    print("Failed to complete habit due to a database error.")
            else:
                print("No active habit named '{habit_name_to_complete}' found.")
          
        elif choice == "4":
            habits = get_habit_by_user(user_id)
            if not habits:
                print("\nYou have no habits to delete")
                continue

            print("\n--- Your Habits --")
            for h in habits:
                print(f"- {h['habit_name']}")

            habit_name_to_delete = input("\Enter the name of the habit you want to delete: ").strip()

            habit_id = None
            for h in habits:
                if h['habit_name'].lower() == habit_name_to_delete.lower():
                    habit_id = h['habit_id']
                    break

            if habit_id:
                success = delete_habit_in_mysql(habit_id, user_id)
                if success:
                    print(f"Habit '{habit_name_to_delete}' successfully deleted.")
                else:
                    print("Failed to delete due to a database error.")
            else:
                print(f"No habit named '{habit_name_to_delete}' found.")
                           
        elif choice == "5":
            print("Returning to Main Menu...")
            break
        else:
            print("Invalid choice, please choose between 1 and 5.")