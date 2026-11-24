from categories import Category

from storage.categories_storage import(
    save_category_to_mysql,
    get_category_by_user,
    delete_category_in_mysql
)

import datetime

def category_menu(user_id):
    # Handles the terminal workflow for the categories's CRUD operations.
    while True: 
        print("\n=== CATEGORIES MANAGEMENT ===")
        print("1. Add a new category")
        print("2. View My categories")
        print("3. Delete  Category")
        print("4. Return to Main Menu")

        choice = input("Choose an option (1-4): ").strip()

        if choice == "1":
            name = input("Enter the category name (e.g., Fitness, Education): ").strip()
            if not name:
                print("Category name cannot be empty.")
                continue
            
            description = input("Enter description (optional, press Enter to skip): ").strip() or None
            #If description is empty string, convert it to None for dtb safety
            description = description if description else None
            #instantiate our object-oriented category model
            new_category = Category(
                user_id=user_id,
                category_name=name,
                description=description,
                )
            #Convert to dictionary and save via storage layer
            save_category_to_mysql(new_category.to_dict())

        elif choice == "2":
                categories = get_category_by_user(user_id)
                if not categories:
                     print("\You have no category saved yet.")
                else:
                     print("\n--- Your Categories ---")
                     for cat in categories:
                          print(f"- {cat['category_name']} | Description: {cat['description'] or 'N/A'}")

        elif choice == "3":
            categories = get_category_by_user(user_id)
            if not categories:
                 print("\nYou have no categories to delete.")
                 continue

            print("\n-- Your Categories ---")
            for cat in categories:
                 print(f"- {cat['category_name']}")

            name_to_delete = input("\n Enter the name of the category you want to delete: ").strip()

            #Find the category ID matching that name for this user
            matching_id = None
            for cat in categories:
                 # .lower() ensure case-insensitive match ie fitness = Fitness
                 if cat['category_name'].lower() == name_to_delete.lower():
                      matching_id = cat['category_id']
                      break

            if matching_id:
                success = delete_category_in_mysql(matching_id, user_id)
                if success:
                      print(f"Category '{name_to_delete} successfully deleted.")
                else:
                    print("Failed to delete due to a database error.")

            else:
                 print(f"No category named '{name_to_delete} found.")

        elif choice == "4":
            print("Returning to Main Menu...")
            break
        else:
            print("Invalid choice, please choose between 1 and 4.")
