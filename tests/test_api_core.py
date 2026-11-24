from datetime import date, timedelta
from unittest.mock import patch

from storage.goals_storage import GoalRuleError

def test_protected_routes_reject_missing_token(client):
    endpoints = [
        ("GET", "/habits/"),
        ("GET", "/categories/"),
        ("GET", "/goals/"),
        ("GET", "/occurrences/"),
    ]
    for method, url in endpoints:
        res = client.request(method, url)
        assert res.status_code  == 401, f"{method} {url} should require auth"

def test_protected_routes_reject_expired_token(client, expired_auth_headers):
    res = client.get("/goals/", headers=expired_auth_headers)
    assert res.status_code == 401

def test_create_schedule_rejects_invalid_weekday(client, auth_headers_user1):
    payload = {
        "habit_id": 10,
        "day_of_week": "Funday",
        "start_time": "08:00:00",
        "status": "Active",
    }
    res = client.post("/schedules/", json=payload, headers=auth_headers_user1)
    assert res.status_code == 400
    assert "day_of_week" in res.json()["detail"]

def test_goal_criterion_rejects_end_date_before_start_date(client, auth_headers_user1):
        today = date.today()
        payload = {
            "goal_name": "Invalid Date Goal",
            "start_date": str(today),
            "end_date": str(today - timedelta(days=1)),
        }
        res = client.post("/goals", json=payload, headers=auth_headers_user1)
        assert res.status_code == 400
        assert "end_date" in res.json()["detail"]

def test_goal_manual_completed_status_is_blocked(client, auth_headers_user1):
        res = client.patch(
            "/goals/1/status",
            json={"status": "Completed", "reason": "Trying to force complete"},
            headers=auth_headers_user1,
        )
        assert res.status_code == 400
        assert "automatically" in res.json()["detail"].lower()

def test_archived_goal_can_restore_to_paused(client, auth_headers_user1):
    mocked_restored_goal = {
          "goal_id": 5,
          "user_id": 1,
          "goal_name": "Recovered Goal",
          "description": None,
          "start_date": str(date.today()),
          "end_date": str(date.today() + timedelta(days=14)),
          "status": "Paused",
          "completed_at": None,
          "notes": None,
          "progress_percentage": 40.0,
          "created_at": "2026-11-23 10:00:00",
          "updated_at": "2026-11-23 20:00:00",
    }

    with patch("routers.goals.change_goal_status", return_value=mocked_restored_goal) as mock_fn:
        res = client.patch(
             "/goals/5/status",
             json={"status": "Paused", "reason": "Restoring accidentally archived goal"},
             headers=auth_headers_user1,
        )
        assert res.status_code == 200
        body = res.json()
        assert body ["goal"]["status"] == "Paused"
        mock_fn.assert_called_once_with(
             goal_id=5,
             user_id=1,
             new_status="Paused",
             reason="Restoring accidentally archived goal",
        )

def test_activating_goal_with_past_end_date_returns_400(client, auth_headers_user1):
     with patch(
          "routers.goals.change_goal_status",
          side_effect=GoalRuleError(
               "Cannot activate a goal whose end_date has already passed. Extend the end_date first.",
               status_code=400,
          ),
     ):
          res = client.patch(
               "/goals/5/status",
               json={"status": "Active"},
               headers=auth_headers_user1,
          )
          assert res.status_code == 400
          assert "end_date" in res.json()["detail"]

def test_user_cannot_access_another_users_goal(client, auth_headers_user2):
     with patch("routers.goals.get_goal_by_id", return_value=None) as mock_get:
          res = client.get("/goals/5", headers=auth_headers_user2)
          assert res.status_code == 404
          mock_get.assert_called_once_with(goal_id=5, user_id=2)