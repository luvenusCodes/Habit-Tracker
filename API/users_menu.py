from routers.users import User

from storage.users_storage import(
    save_user_to_mysql,
    get_user_by_username,
    delete_user_in_mysql
)

import datetime

import bcrypt

def authenticate_user(username, plain_password):
    #Fetches user record and verifies password hash using bcrypt.
    user_record = get_user_by_username(username)
    if not user_record:
        return None

    stored_hash = user_record['password_hash'].encode('utf-8')

    password_bytes = plain_password.encode('utf-8')[:72]
                                                    
    if bcrypt.checkpw(password_bytes, stored_hash):
        return user_record
    return None

def user_menu():
    #manages the user authentication and management workflow.
    current_user = None

    while True:
        print("\n=== USERS & AUTHENTICATION MENU ===")
        print("1. Sign Up (Create a new account)")
        print("2. Log In (Existing user)")
        print("3. View User Details")
        print("4. Delete User Account")
        print("5. Return to Main Menu")

        choice = input("Choose an option (1-5): ").strip()

        if choice == "1":  #Sign Up worflow
            print("\n--- CREATE NEW ACCOUNT ---")
            username = input("Enter your username: ").strip()
            email = input("Enter your email address: ").strip()
            plain_password = input("Enter your password: ").strip()
            confirm_password = input("Confirm your password: ").strip()

            #Verify that both password fields match
            if plain_password != confirm_password:
                print("\nError: Passwords do not match! Please try again.")
                continue
            
            new_user_obj = User(
                username=username,
                email=email,
                )
            new_user_obj.set_password(plain_password)

            user_payload = new_user_obj.to_dict()
            if save_user_to_mysql(user_payload):
                print(f"Account for '{username}' created successfully! You can now log in.")
            else:
                print("Registration failed. This username or email may already be in use.")

        elif choice == "2":
            try:
                username = str(input("Enter your username: ")).strip()
                user_data = get_user_by_username(username)

                if user_data:
                    print("\n-- USER DETAILS --")
                    print(f"username          : {user_data['username']}")
                    print("--------------------------")
                else:
                    print(f"No user found with the username: {username}.")

            except ValueError:
                print("Invalid input! Please eneter a valid username.")

        elif choice == "3":
            try:
                username = str(input("Enter the username you want to delete: ").strip())
                confirm = input(f"Are you sure you want to delete username: {username}? (y/n): ").strip().lower()


                if confirm != 'y':
                    print("Deletion cancelled.")
                    continue

                success = delete_user_in_mysql(username)

                if success:
                    print(f"\nSuccess! Username {username} has been deleted.")
                else:
                    print(f"\n Failed to delete uername. No such username found with username: {username}.")

            except ValueError:
                print("Invalid input! Please enter a valid username.")

        elif choice == "4":
            print("Returning to Main Menu...")
            break
        else:
            print("Invalid choice, please choose between 1 and 4.")