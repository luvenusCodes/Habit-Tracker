# Handles all internet requests with Error handling

import requests

def create_habit(habit_title):
    url = "https://jsonplaceholder.typicode.com/todos"
    new_habit = {"title": habit_title, "userId": 1, "completed": False}
    try:
        response = requests.post(url, json=new_habit)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Network error occurred: {e}")
        return None

def get_habit(habit_id):
    url = f"https://jsonplaceholder.typicode.com/todos/{habit_id}"
    try: 
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Oops something went wrong: {e}")
        return None

def complete_habit(habit_id):
    url = f"https://jsonplaceholder.typicode.com/todos/{habit_id}"
    update_payload = {"completed": True}
    try:
        response = requests.patch(url, json=update_payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Oops, something went wrong: {e}")
        return None

def delete_habit(habit_id):
    url = f"https://jsonplaceholder.typicode.com/todos/{habit_id}"
    try:
        response = requests.delete(url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Oops something went wrong: {e}")
        return None