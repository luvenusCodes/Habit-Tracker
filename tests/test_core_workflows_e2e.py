import os
import sys
import uuid
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from main import app  # noqa: E402
from storage.connection import get_db_connection  # noqa: E402
from tests.test_goals_e2e import _find_route_path, _purge_test_user  # noqa: E402

client = TestClient(app)


def _find_matching_route(candidates: list[str], method: str) -> str | None:
    paths = app.openapi().get("paths", {})
    for candidate in candidates:
        for path, ops in paths.items():
            if method.lower() in ops and (path == candidate or path.endswith(candidate)):
                return path
    return None


def _clean_user_cascade(cur, uid: int) -> None:
    cur.execute(
        """
        UPDATE habit_occurrences o
        JOIN habits h ON o.habit_id = h.habit_id
        SET o.original_occurrence_id = NULL
        WHERE h.user_id = %s
        """,
        (uid,),
    )
    _purge_test_user(cur, uid)


@pytest.fixture(scope="module")
def core_context():
    # Pre-clean any stale core_e2e_% users from interrupted runs
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT user_id FROM users WHERE username LIKE 'core_e2e_%'")
        for row in cur.fetchall():
            _clean_user_cascade(cur, row["user_id"])
        conn.commit()
    finally:
        cur.close()
        conn.close()

    register_path = _find_route_path(["/users/register", "/auth/register", "/users/", "/register"], "post")
    login_path = _find_route_path(["/auth/login", "/users/login", "/login", "/token"], "post")
    assert register_path and login_path, "Register/Login routes not found in OpenAPI schema."

    suffix = uuid.uuid4().hex[:8]
    user_a_creds = {
        "username": f"core_e2e_a_{suffix}",
        "email": f"core_e2e_a_{suffix}@example.com",
        "password": "StrongPassword123!",
    }
    user_b_creds = {
        "username": f"core_e2e_b_{suffix}",
        "email": f"core_e2e_b_{suffix}@example.com",
        "password": "StrongPassword123!",
    }

    def _provision_user(creds: dict) -> dict:
        reg_res = client.post(register_path, json=creds)
        assert reg_res.status_code in (200, 201), reg_res.text

        login_res = client.post(
            login_path,
            json={"username": creds["username"], "password": creds["password"]},
        )
        if login_res.status_code != 200:
            login_res = client.post(
                login_path,
                data={"username": creds["username"], "password": creds["password"]},
            )
        assert login_res.status_code == 200, login_res.text

        headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}
        conn_l = get_db_connection()
        cur_l = conn_l.cursor(dictionary=True)
        try:
            cur_l.execute("SELECT user_id FROM users WHERE email = %s", (creds["email"],))
            uid = cur_l.fetchone()["user_id"]
        finally:
            cur_l.close()
            conn_l.close()

        return {"user_id": uid, "headers": headers}

    ctx = {
        "user_a": _provision_user(user_a_creds),
        "user_b": _provision_user(user_b_creds),
        "state": {},
    }

    yield ctx

    # FK-safe teardown
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for uid in (ctx["user_a"]["user_id"], ctx["user_b"]["user_id"]):
            _clean_user_cascade(cur, uid)
        conn.commit()
    finally:
        cur.close()
        conn.close()


# ==============================================================================
# 1. CATEGORIES & HABITS CRUD + ISOLATION
# ==============================================================================
def test_01_category_and_habit_lifecycle(core_context):
    headers_a = core_context["user_a"]["headers"]
    headers_b = core_context["user_b"]["headers"]
    today = date.today()

    # 1. Create Category
    res_cat = client.post(
        "/categories/",
        headers=headers_a,
        json={"category_name": "Strength & Conditioning"},
    )
    assert res_cat.status_code in (200, 201), res_cat.text
    cat_body = res_cat.json()
    cat_id = (cat_body.get("category") or cat_body).get("category_id")
    assert cat_id is not None
    core_context["state"]["category_id"] = cat_id

    # 2. List Categories confirms creation
    res_cats = client.get("/categories/", headers=headers_a)
    assert res_cats.status_code == 200
    cats_list = res_cats.json().get("categories") or res_cats.json()
    assert any(c.get("category_id") == cat_id for c in cats_list)

    # 3. Create Habit under Category
    res_habit = client.post(
        "/habits/",
        headers=headers_a,
        json={
            "category_id": cat_id,
            "habit_name": "Barbell Back Squats",
            "description": "4 sets of 6 reps",
            "priority": "High",
            "start_date": str(today),
        },
    )
    assert res_habit.status_code in (200, 201), res_habit.text
    habit_body = res_habit.json()
    habit_id = (habit_body.get("habit") or habit_body).get("habit_id")
    assert habit_id is not None
    core_context["state"]["habit_id"] = habit_id

    # 4. User B cannot view schedules or delete User A's habit (cross-user isolation)
    res_iso_sched = client.get(f"/schedules/habit/{habit_id}", headers=headers_b)
    assert res_iso_sched.status_code == 404

    res_iso_del = client.delete(f"/habits/{habit_id}", headers=headers_b)
    assert res_iso_del.status_code in (403, 404)


# ==============================================================================
# 2. SCHEDULES CRUD, VALIDATION & STATUS TOGGLE
# ==============================================================================
def test_02_schedule_management_and_validation(core_context):
    headers_a = core_context["user_a"]["headers"]
    habit_id = core_context["state"]["habit_id"]
    today_weekday = date.today().strftime("%A")

    # 1. Invalid weekday must return 400
    res_bad_day = client.post(
        "/schedules/",
        headers=headers_a,
        json={
            "habit_id": habit_id,
            "day_of_week": "NotADay",
            "start_time": "07:00:00",
            "status": "Active",
        },
    )
    assert res_bad_day.status_code == 400

    # 2. Providing both end_time and duration_minutes simultaneously must return 400
    res_both = client.post(
        "/schedules/",
        headers=headers_a,
        json={
            "habit_id": habit_id,
            "day_of_week": today_weekday,
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "duration_minutes": 60,
            "status": "Active",
        },
    )
    assert res_both.status_code == 400

    # 3. Create primary Active schedule using end_time
    res_sched = client.post(
        "/schedules/",
        headers=headers_a,
        json={
            "habit_id": habit_id,
            "day_of_week": today_weekday,
            "start_time": "07:00:00",
            "end_time": "08:00:00",
            "status": "Active",
        },
    )
    assert res_sched.status_code == 201, res_sched.text
    sched_id = res_sched.json()["schedule"]["schedule_id"]
    core_context["state"]["schedule_id"] = sched_id

    # 4. Duplicate schedule (same habit, day, start_time) must return 400
    res_dup = client.post(
        "/schedules/",
        headers=headers_a,
        json={
            "habit_id": habit_id,
            "day_of_week": today_weekday,
            "start_time": "07:00:00",
            "status": "Active",
        },
    )
    assert res_dup.status_code == 400

    # 5. Create temporary second slot with duration_minutes, toggle Inactive, then delete it
    res_temp = client.post(
        "/schedules/",
        headers=headers_a,
        json={
            "habit_id": habit_id,
            "day_of_week": today_weekday,
            "start_time": "18:30:00",
            "duration_minutes": 30,
            "status": "Active",
        },
    )
    assert res_temp.status_code == 201, res_temp.text
    temp_sched_id = res_temp.json()["schedule"]["schedule_id"]

    res_toggle = client.patch(
        f"/schedules/{temp_sched_id}/status",
        headers=headers_a,
        json={"status": "Inactive"},
    )
    assert res_toggle.status_code == 200
    assert res_toggle.json()["status"] == "Inactive"

    res_del = client.delete(f"/schedules/{temp_sched_id}", headers=headers_a)
    assert res_del.status_code == 200


# ==============================================================================
# 3. OCCURRENCE GENERATION & IDEMPOTENCY
# ==============================================================================
def test_03_occurrence_generation_and_status_updates(core_context):
    headers_a = core_context["user_a"]["headers"]
    habit_id = core_context["state"]["habit_id"]
    today = date.today()

    # 1. Generate occurrences for today
    res_gen = client.post(
        "/occurrences/generate",
        headers=headers_a,
        json={"target_date": str(today)},
    )
    assert res_gen.status_code in (200, 201), res_gen.text

    # 2. Fetch today's occurrences
    res_list = client.get(f"/occurrences/?date_str={today}", headers=headers_a)
    assert res_list.status_code == 200, res_list.text
    occs = res_list.json().get("occurrences", [])
    matching = [o for o in occs if o["habit_id"] == habit_id]
    assert len(matching) == 1
    occ_id = matching[0]["occurrence_id"]
    assert matching[0]["status"] == "Pending"
    core_context["state"]["occurrence_id"] = occ_id

    # 3. Idempotency check: re-running generator on the same date creates no duplicates
    res_regen = client.post(
        "/occurrences/generate",
        headers=headers_a,
        json={"target_date": str(today)},
    )
    assert res_regen.status_code in (200, 201)
    res_list_again = client.get(f"/occurrences/?date_str={today}", headers=headers_a)
    matching_again = [o for o in res_list_again.json().get("occurrences", []) if o["habit_id"] == habit_id]
    assert len(matching_again) == 1


# ==============================================================================
# 4. CARRY-FORWARD WORKFLOW, HISTORY & COMPLETION ANALYTICS
# ==============================================================================
def test_04_carry_forward_and_completion_analytics(core_context):
    headers_a = core_context["user_a"]["headers"]
    habit_id = core_context["state"]["habit_id"]
    occ_id = core_context["state"]["occurrence_id"]
    today = date.today()
    tomorrow = today + timedelta(days=1)

    cf_path = _find_matching_route(
        [f"/occurrences/{{occurrence_id}}/carry-forward", f"/occurrences/{{occurrence_id}}/carry_forward"],
        "post",
    )
    assert cf_path is not None, f"Carry-forward route not found in {list(app.openapi()['paths'].keys())}"
    resolved_cf_url = cf_path.replace("{occurrence_id}", str(occ_id))

    # 1. Carry forward today's Pending occurrence to tomorrow
    res_cf = client.post(
        resolved_cf_url,
        headers=headers_a,
        json={"target_date": str(tomorrow)},
    )
    assert res_cf.status_code in (200, 201), res_cf.text
    tmrw_occ_id = res_cf.json()["new_occurrence_id"]

    # 2. Verify tomorrow has the carried-forward occurrence
    res_tmrw = client.get(f"/occurrences/?date_str={tomorrow}", headers=headers_a)
    assert res_tmrw.status_code == 200
    tmrw_occs = [o for o in res_tmrw.json().get("occurrences", []) if o["habit_id"] == habit_id]
    assert len(tmrw_occs) >= 1

    # 3. Verify status history on original occurrence records 'Carried Over'
    res_hist = client.get(f"/occurrences/{occ_id}/history", headers=headers_a)
    assert res_hist.status_code == 200, res_hist.text
    assert any(h["new_status"] == "Carried Over" for h in res_hist.json().get("history", []))

    # 4. Mark the carried-forward occurrence as Done
    res_done = client.patch(
        f"/occurrences/{tmrw_occ_id}/status",
        headers=headers_a,
        json={"status": "Done"},
    )
    assert res_done.status_code == 200, res_done.text
    assert res_done.json()["new_status"] == "Done"

    # 5. Verify analytics and score summary endpoints return 200
    analytics_path = _find_matching_route(["/occurrences/analytics", "/analytics"], "get")
    if analytics_path:
        res_stats = client.get(f"{analytics_path}?days=7", headers=headers_a)
        assert res_stats.status_code == 200, res_stats.text

    res_score = client.get(f"/occurrences/score-summary?date_str={tomorrow}", headers=headers_a)
    assert res_score.status_code == 200, res_score.text