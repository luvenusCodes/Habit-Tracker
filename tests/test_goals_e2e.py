import os
import re
import sys
import uuid
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient

# Ensure project root is on sys.path so `main` and `storage` import cleanly
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from main import app  # noqa: E402
from storage.connection import get_db_connection  # noqa: E402


client = TestClient(app)


# ==============================================================================
# [PHASE 9: ROUTE AUTO-DISCOVERY & CLEANUP HELPERS]
# ==============================================================================
def _find_route_path(suffix_candidates: list[str], method: str) -> str | None:
    paths = app.openapi().get("paths", {})
    for candidate in suffix_candidates:
        for path, ops in paths.items():
            if method.lower() in ops and (path == candidate or path.endswith(candidate)):
                return path
    return None


def _purge_test_user(cur, uid: int) -> None:
    cur.execute("DELETE FROM goal_progress_records WHERE user_id = %s", (uid,))
    cur.execute("DELETE FROM goal_criteria_habits WHERE user_id = %s", (uid,))
    cur.execute("DELETE FROM habit_goals WHERE user_id = %s", (uid,))
    cur.execute(
        """
        DELETE gch FROM goal_criteria_history gch
        JOIN goal_criteria gc ON gch.criterion_id = gc.criterion_id
        WHERE gc.user_id = %s
        """,
        (uid,),
    )
    cur.execute("DELETE FROM goal_criteria WHERE user_id = %s", (uid,))
    cur.execute("DELETE FROM goal_status_history WHERE user_id = %s", (uid,))
    cur.execute("DELETE FROM goals WHERE user_id = %s", (uid,))
    cur.execute(
        """
        DELETE osh FROM occurrence_status_history osh
        JOIN habit_occurrences ho ON osh.occurrence_id = ho.occurrence_id
        JOIN habits h ON ho.habit_id = h.habit_id
        WHERE h.user_id = %s
        """,
        (uid,),
    )
    cur.execute(
        """
        DELETE ho FROM habit_occurrences ho
        JOIN habits h ON ho.habit_id = h.habit_id
        WHERE h.user_id = %s
        """,
        (uid,),
    )
    cur.execute(
        """
        SELECT DISTINCT TABLE_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME = 'habits'
          AND REFERENCED_COLUMN_NAME = 'habit_id'
        """
    )
    child_tables = [r[0] if isinstance(r, tuple) else r["TABLE_NAME"] for r in cur.fetchall()]
    for tbl in child_tables:
        if tbl in {"habit_occurrences", "habit_goals", "goal_criteria_habits"}:
            continue
        cur.execute(
            f"""
            DELETE t FROM `{tbl}` t
            JOIN habits h ON t.habit_id = h.habit_id
            WHERE h.user_id = %s
            """,
            (uid,),
        )
    cur.execute("DELETE FROM habits WHERE user_id = %s", (uid,))
    cur.execute("DELETE FROM categories WHERE user_id = %s", (uid,))
    cur.execute("DELETE FROM users WHERE user_id = %s", (uid,))


def _seed_habit_and_occurrence(cur, user_id: int, today: date) -> tuple[int, int]:
    """
    Seeds a category, habit, and today's Pending occurrence by dynamically reading
    INFORMATION_SCHEMA.COLUMNS and CHECK_CONSTRAINTS for habit_occurrences.
    """
    cur.execute(
        "INSERT INTO categories (user_id, category_name) VALUES (%s, %s)",
        (user_id, "Engineering E2E"),
    )
    cat_id = cur.lastrowid

    cur.execute(
        """
        INSERT INTO habits (user_id, category_id, habit_name, start_date, status)
        VALUES (%s, %s, %s, %s, 'Active')
        """,
        (user_id, cat_id, "Code Architecture Practice", today),
    )
    habit_id = cur.lastrowid

    cur.execute(
        """
        SELECT cc.CHECK_CLAUSE
        FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
        JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
         AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = DATABASE()
          AND tc.TABLE_NAME = 'habit_occurrences'
          AND tc.CONSTRAINT_TYPE = 'CHECK'
        """
    )
    check_allowed: dict[str, object] = {}
    for row in cur.fetchall():
        clause = row[0] if isinstance(row, tuple) else row["CHECK_CLAUSE"]
        m_in = re.search(r"`([a-zA-Z0-9_]+)`\s+in\s*\(([^)]+)\)", clause, flags=re.IGNORECASE)
        if m_in:
            col = m_in.group(1)
            vals = re.findall(r"'([^']+)'", m_in.group(2))
            if vals:
                check_allowed[col] = vals[0]
        m_num = re.search(r"`([a-zA-Z0-9_]+)`\s*(?:>=|>)\s*(\d+)", clause, flags=re.IGNORECASE)
        if m_num and m_num.group(1) not in check_allowed:
            check_allowed[m_num.group(1)] = int(m_num.group(2)) + 1

    cur.execute(
        """
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'habit_occurrences'
        ORDER BY ORDINAL_POSITION
        """
    )
    cols_info = cur.fetchall()
    insert_cols = []
    insert_vals = []

    for c in cols_info:
        col_name = c[0] if isinstance(c, tuple) else c["COLUMN_NAME"]
        data_type = (c[1] if isinstance(c, tuple) else c["DATA_TYPE"]).lower()
        col_type = (c[2] if isinstance(c, tuple) else c["COLUMN_TYPE"]).lower()
        is_nullable = (c[3] if isinstance(c, tuple) else c["IS_NULLABLE"]).upper() == "YES"
        col_default = c[4] if isinstance(c, tuple) else c["COLUMN_DEFAULT"]
        extra = (c[5] if isinstance(c, tuple) else c["EXTRA"]).lower()

        if "auto_increment" in extra:
            continue
        if col_name == "habit_id":
            insert_cols.append(col_name)
            insert_vals.append(habit_id)
        elif col_name == "user_id":
            insert_cols.append(col_name)
            insert_vals.append(user_id)
        elif col_name == "schedule_id":
            insert_cols.append(col_name)
            insert_vals.append(0)
        elif col_name == "habit_name_snapshot":
            insert_cols.append(col_name)
            insert_vals.append("Code Architecture Practice")
        elif col_name == "occurrence_date":
            insert_cols.append(col_name)
            insert_vals.append(today)
        elif col_name == "status":
            insert_cols.append(col_name)
            insert_vals.append("Pending")
        elif col_name in check_allowed:
            insert_cols.append(col_name)
            insert_vals.append(check_allowed[col_name])
        elif is_nullable or col_default is not None:
            continue
        elif "enum(" in col_type:
            first_enum = col_type.split("enum(", 1)[1].split(")", 1)[0].split(",")[0].strip().strip("'")
            insert_cols.append(col_name)
            insert_vals.append(first_enum)
        elif data_type in {"date"}:
            insert_cols.append(col_name)
            insert_vals.append(today)
        elif data_type in {"datetime", "timestamp"}:
            insert_cols.append(col_name)
            insert_vals.append(f"{today} 08:00:00")
        elif data_type in {"time"}:
            insert_cols.append(col_name)
            insert_vals.append("08:00:00")
        elif data_type in {"int", "tinyint", "smallint", "mediumint", "bigint", "decimal", "float", "double"}:
            insert_cols.append(col_name)
            insert_vals.append(1)
        else:
            insert_cols.append(col_name)
            insert_vals.append("Medium")

    placeholders = ", ".join(["%s"] * len(insert_cols))
    cols_sql = ", ".join(f"`{col}`" for col in insert_cols)

    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    try:
        cur.execute(
            f"INSERT INTO habit_occurrences ({cols_sql}) VALUES ({placeholders})",
            tuple(insert_vals),
        )
        occurrence_id = cur.lastrowid
    finally:
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")

    return habit_id, occurrence_id


# ==============================================================================
# [PHASE 9: FIXTURES & DATABASE CLEANUP]
# ==============================================================================
@pytest.fixture(scope="module")
def test_context():
    # Pre-clean any stale goal_e2e_% users from earlier interrupted runs
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT user_id FROM users WHERE username LIKE 'goal_e2e_%'")
        stale_users = cur.fetchall()
        for row in stale_users:
            _purge_test_user(cur, row["user_id"])
        conn.commit()
    finally:
        cur.close()
        conn.close()

    register_path = _find_route_path(
        ["/users/register", "/auth/register", "/users/", "/users", "/register"],
        "post",
    )
    login_path = _find_route_path(
        ["/auth/login", "/users/login", "/login", "/token"],
        "post",
    )
    me_path = _find_route_path(
        ["/users/me", "/auth/me", "/me"],
        "get",
    )

    assert register_path is not None, f"Could not find register route in {list(app.openapi()['paths'].keys())}"
    assert login_path is not None, f"Could not find login route in {list(app.openapi()['paths'].keys())}"

    suffix = uuid.uuid4().hex[:8]
    user_a_creds = {
        "username": f"goal_e2e_a_{suffix}",
        "email": f"goal_e2e_a_{suffix}@example.com",
        "password": "StrongPassword123!",
    }
    user_b_creds = {
        "username": f"goal_e2e_b_{suffix}",
        "email": f"goal_e2e_b_{suffix}@example.com",
        "password": "StrongPassword123!",
    }

    def _register_and_login(creds: dict) -> dict:
        reg_res = client.post(register_path, json=creds)
        assert reg_res.status_code in (200, 201), f"Registration failed on {register_path}: {reg_res.text}"

        login_res = client.post(
            login_path,
            data={"username": creds["email"], "password": creds["password"]},
        )
        if login_res.status_code != 200:
            login_res = client.post(
                login_path,
                data={"username": creds["username"], "password": creds["password"]},
            )
        if login_res.status_code != 200:
            login_res = client.post(
                login_path,
                json={"email": creds["email"], "password": creds["password"]},
            )
        if login_res.status_code != 200:
            login_res = client.post(
                login_path,
                json={"username": creds["username"], "password": creds["password"]},
            )
        assert login_res.status_code == 200, f"Login failed on {login_path}: {login_res.text}"

        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        user_id = None
        if me_path:
            me_res = client.get(me_path, headers=headers)
            if me_res.status_code == 200:
                me_body = me_res.json()
                user_id = me_body.get("user_id") or me_body.get("user", {}).get("user_id")

        if user_id is None:
            conn_lookup = get_db_connection()
            cur_lookup = conn_lookup.cursor(dictionary=True)
            try:
                cur_lookup.execute("SELECT user_id FROM users WHERE email = %s", (creds["email"],))
                row = cur_lookup.fetchone()
                user_id = row["user_id"] if row else None
            finally:
                cur_lookup.close()
                conn_lookup.close()

        assert user_id is not None, f"Could not resolve user_id for {creds['email']}"
        return {"user_id": user_id, "headers": headers, "creds": creds}

    ctx = {
        "user_a": _register_and_login(user_a_creds),
        "user_b": _register_and_login(user_b_creds),
        "state": {},
    }

    yield ctx

    # Teardown: remove all test records for user_a and user_b in FK-safe order
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        for uid in (ctx["user_a"]["user_id"], ctx["user_b"]["user_id"]):
            _purge_test_user(cur, uid)
        conn.commit()
    finally:
        if cur:
            cur.close()
        if conn and conn.is_connected():
            conn.close()


# ==============================================================================
# [PHASE 9: END-TO-END INTEGRATION TESTS]
# ==============================================================================
def test_01_create_active_and_planned_goals(test_context):
    headers_a = test_context["user_a"]["headers"]
    today = date.today()

    # 1. Active goal (starts today)
    res_active = client.post(
        "/goals/",
        headers=headers_a,
        json={
            "goal_name": "Build Backend Mastery",
            "description": "Complete core engineering milestones",
            "start_date": str(today),
            "end_date": str(today + timedelta(days=30)),
            "notes": "Phase 9 E2E active goal",
        },
    )
    assert res_active.status_code == 201, res_active.text
    active_goal = res_active.json()["goal"]
    assert active_goal["status"] == "Active"
    assert active_goal["progress_percentage"] == 0.0
    test_context["state"]["active_goal_id"] = active_goal["goal_id"]

    # 2. Planned goal (starts in 5 days)
    res_planned = client.post(
        "/goals/",
        headers=headers_a,
        json={
            "goal_name": "Future Marathon Prep",
            "start_date": str(today + timedelta(days=5)),
            "end_date": str(today + timedelta(days=60)),
        },
    )
    assert res_planned.status_code == 201, res_planned.text
    planned_goal = res_planned.json()["goal"]
    assert planned_goal["status"] == "Planned"
    test_context["state"]["planned_goal_id"] = planned_goal["goal_id"]

    # 3. Invalid date range (end_date < start_date) must fail with 400
    res_bad = client.post(
        "/goals/",
        headers=headers_a,
        json={
            "goal_name": "Invalid Date Goal",
            "start_date": str(today + timedelta(days=10)),
            "end_date": str(today + timedelta(days=5)),
        },
    )
    assert res_bad.status_code == 400


def test_02_user_ownership_isolation(test_context):
    headers_b = test_context["user_b"]["headers"]
    active_goal_id = test_context["state"]["active_goal_id"]

    res = client.get(f"/goals/{active_goal_id}", headers=headers_b)
    assert res.status_code == 404


def test_03_goal_metadata_and_status_state_machine(test_context):
    headers_a = test_context["user_a"]["headers"]
    active_goal_id = test_context["state"]["active_goal_id"]
    today = date.today()

    # Cannot modify start_date after goal has started
    res_bad_start = client.patch(
        f"/goals/{active_goal_id}",
        headers=headers_a,
        json={"start_date": str(today + timedelta(days=1))},
    )
    assert res_bad_start.status_code == 400

    # Valid metadata update (notes)
    res_ok = client.patch(
        f"/goals/{active_goal_id}",
        headers=headers_a,
        json={"notes": "Updated notes in Phase 9"},
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["goal"]["notes"] == "Updated notes in Phase 9"

    # Manual transition to Completed must be rejected
    res_manual_complete = client.patch(
        f"/goals/{active_goal_id}/status",
        headers=headers_a,
        json={"status": "Completed", "reason": "Trying to bypass criteria"},
    )
    assert res_manual_complete.status_code == 400

    # Active -> Paused -> Active
    res_pause = client.patch(
        f"/goals/{active_goal_id}/status",
        headers=headers_a,
        json={"status": "Paused", "reason": "Short break"},
    )
    assert res_pause.status_code == 200
    assert res_pause.json()["goal"]["status"] == "Paused"

    res_resume = client.patch(
        f"/goals/{active_goal_id}/status",
        headers=headers_a,
        json={"status": "Active", "reason": "Resuming work"},
    )
    assert res_resume.status_code == 200
    assert res_resume.json()["goal"]["status"] == "Active"


def test_04_criteria_crud_and_audit_history(test_context):
    headers_a = test_context["user_a"]["headers"]
    active_goal_id = test_context["state"]["active_goal_id"]

    # Create mandatory Count criterion (target = 2 sessions, later updated to 1)
    res_c1 = client.post(
        f"/goals/{active_goal_id}/criteria",
        headers=headers_a,
        json={
            "criterion_name": "Deep Work Sessions",
            "measurement_type": "Count",
            "target_value": 2,
            "measurement_unit": "sessions",
            "is_mandatory": True,
        },
    )
    assert res_c1.status_code == 201, res_c1.text
    c1 = res_c1.json()["criterion"]
    test_context["state"]["criterion_mandatory_id"] = c1["criterion_id"]

    # Create optional Duration criterion
    res_c2 = client.post(
        f"/goals/{active_goal_id}/criteria",
        headers=headers_a,
        json={
            "criterion_name": "Bonus Reading Minutes",
            "measurement_type": "Duration",
            "target_value": 120,
            "measurement_unit": "minutes",
            "is_mandatory": False,
        },
    )
    assert res_c2.status_code == 201, res_c2.text
    c2 = res_c2.json()["criterion"]
    test_context["state"]["criterion_optional_id"] = c2["criterion_id"]

    # Update mandatory target_value from 2 -> 1 with reason
    res_patch = client.patch(
        f"/goals/{active_goal_id}/criteria/{c1['criterion_id']}",
        headers=headers_a,
        json={"target_value": 1, "reason": "Calibrating target for single-session E2E test"},
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["criterion"]["target_value"] == 1.0

    # Deactivate optional criterion so goal completion depends strictly on mandatory c1
    res_deact = client.request(
        "DELETE",
        f"/goals/{active_goal_id}/criteria/{c2['criterion_id']}",
        headers=headers_a,
        json={"reason": "Deactivating optional criterion"},
    )
    assert res_deact.status_code == 200
    assert res_deact.json()["criterion"]["status"] == "Inactive"

    # Verify Phase 7 criterion audit trail
    res_hist = client.get(
        f"/goals/{active_goal_id}/criteria/{c1['criterion_id']}/history",
        headers=headers_a,
    )
    assert res_hist.status_code == 200, res_hist.text
    hist_items = res_hist.json()["history"]
    assert len(hist_items) >= 1
    assert hist_items[0]["field_name"] == "target_value"
    assert hist_items[0]["new_value"] == "1.00"

    # Verify goal-wide criteria history endpoint
    res_all_hist = client.get(
        f"/goals/{active_goal_id}/criteria-history",
        headers=headers_a,
    )
    assert res_all_hist.status_code == 200, res_all_hist.text
    assert res_all_hist.json()["count"] >= 2


def test_05_habit_relationships_and_cascading_unlink(test_context):
    headers_a = test_context["user_a"]["headers"]
    user_id = test_context["user_a"]["user_id"]
    active_goal_id = test_context["state"]["active_goal_id"]
    c1_id = test_context["state"]["criterion_mandatory_id"]
    today = date.today()

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        habit_id, occurrence_id = _seed_habit_and_occurrence(cur, user_id, today)
        conn.commit()
    finally:
        cur.close()
        conn.close()

    test_context["state"]["habit_id"] = habit_id
    test_context["state"]["occurrence_id"] = occurrence_id

    # Linking to criterion BEFORE linking to parent goal must fail (400)
    res_premature = client.post(
        f"/goals/{active_goal_id}/criteria/{c1_id}/habits",
        headers=headers_a,
        json={"habit_id": habit_id},
    )
    assert res_premature.status_code == 400

    # Link habit to parent goal
    res_link_goal = client.post(
        f"/goals/{active_goal_id}/habits",
        headers=headers_a,
        json={"habit_id": habit_id},
    )
    assert res_link_goal.status_code == 201

    # Duplicate active link must return 409
    res_dup = client.post(
        f"/goals/{active_goal_id}/habits",
        headers=headers_a,
        json={"habit_id": habit_id},
    )
    assert res_dup.status_code == 409

    # Link habit to mandatory criterion
    res_link_crit = client.post(
        f"/goals/{active_goal_id}/criteria/{c1_id}/habits",
        headers=headers_a,
        json={"habit_id": habit_id},
    )
    assert res_link_crit.status_code == 201


def test_06_occurrence_completion_triggers_progress_and_goal_completion(test_context):
    headers_a = test_context["user_a"]["headers"]
    active_goal_id = test_context["state"]["active_goal_id"]
    occurrence_id = test_context["state"]["occurrence_id"]

    # Complete occurrence via PATCH /occurrences/{occurrence_id}/status with "Done"
    res_complete = client.patch(
        f"/occurrences/{occurrence_id}/status",
        headers=headers_a,
        json={"status": "Done"},
    )
    assert res_complete.status_code == 200, res_complete.text

    # Check Phase 6 progress summary
    res_prog = client.get(f"/goals/{active_goal_id}/progress", headers=headers_a)
    assert res_prog.status_code == 200, res_prog.text
    prog_data = res_prog.json()

    assert prog_data["records_count"] == 1
    assert prog_data["progress_records"][0]["contribution_amount"] == 1.0
    assert prog_data["goal"]["status"] == "Completed"
    assert prog_data["goal"]["progress_percentage"] == 100.0
    assert prog_data["goal"]["completed_at"] is not None

    # Completed goal must be locked against edits
    res_locked = client.patch(
        f"/goals/{active_goal_id}",
        headers=headers_a,
        json={"notes": "Should fail on completed goal"},
    )
    assert res_locked.status_code == 400

    # Phase 8 cleanup verification: active habit links must now be closed
    res_links = client.get(f"/goals/{active_goal_id}/habits", headers=headers_a)
    assert res_links.status_code == 200
    assert res_links.json()["count"] == 0

    # Phase 7 status history verification: Planned/Active -> Paused -> Active -> Completed
    res_status_hist = client.get(f"/goals/{active_goal_id}/history", headers=headers_a)
    assert res_status_hist.status_code == 200
    statuses = [h["new_status"] for h in res_status_hist.json()["history"]]
    assert "Completed" in statuses


def test_07_scheduled_expiration_and_cleanup(test_context):
    headers_a = test_context["user_a"]["headers"]
    user_id = test_context["user_a"]["user_id"]
    habit_id = test_context["state"]["habit_id"]

    # Create a valid goal starting today, link a habit, then backdate start_date & end_date in DB
    res_g = client.post(
        "/goals/",
        headers=headers_a,
        json={
            "goal_name": "Time-Bound Sprint Goal",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=7)),
        },
    )
    assert res_g.status_code == 201
    exp_goal_id = res_g.json()["goal"]["goal_id"]

    res_link = client.post(
        f"/goals/{exp_goal_id}/habits",
        headers=headers_a,
        json={"habit_id": habit_id},
    )
    assert res_link.status_code == 201

    # Simulate passage of time while preserving end_date >= start_date (goals_chk_1)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE goals
            SET start_date = %s, end_date = %s
            WHERE goal_id = %s AND user_id = %s
            """,
            (
                date.today() - timedelta(days=2),
                date.today() - timedelta(days=1),
                exp_goal_id,
                user_id,
            ),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()

    # Run Phase 8 maintenance endpoint
    res_maint = client.post("/goals/maintenance/run", headers=headers_a)
    assert res_maint.status_code == 200, res_maint.text
    assert res_maint.json()["result"]["expired_count"] >= 1

    # Confirm goal transitioned to Expired
    res_check = client.get(f"/goals/{exp_goal_id}", headers=headers_a)
    assert res_check.status_code == 200
    assert res_check.json()["goal"]["status"] == "Expired"

    # Confirm active habit link was cleaned up automatically
    res_active_links = client.get(f"/goals/{exp_goal_id}/habits", headers=headers_a)
    assert res_active_links.status_code == 200
    assert res_active_links.json()["count"] == 0

    # Confirm historical link record is still preserved with unlinked_by_type == 'System'
    res_all_links = client.get(
        f"/goals/{exp_goal_id}/habits?include_history=true",
        headers=headers_a,
    )
    assert res_all_links.status_code == 200
    all_links = res_all_links.json()["relationships"]
    assert len(all_links) == 1
    assert all_links[0]["unlinked_by_type"] == "System"

def test_08_archive_and_paused_recovery_workflow(test_context):
    headers_a = test_context["user_a"]["headers"]
    user_id = test_context["user_a"]["user_id"]
    today = date.today()

    # Create a goal, pause it, then archive it
    res_create = client.post(
        "/goals/",
        headers=headers_a,
        json={
            "goal_name": "Recoverable Archive Goal",
            "start_date": str(today),
            "end_date": str(today + timedelta(days=10)),
        },
    )
    assert res_create.status_code == 201
    goal_id = res_create.json()["goal"]["goal_id"]

    res_pause = client.patch(
        f"/goals/{goal_id}/status",
        headers=headers_a,
        json={"status": "Paused", "reason": "Pausing before archive"},
    )
    assert res_pause.status_code == 200

    res_archive = client.patch(
        f"/goals/{goal_id}/status",
        headers=headers_a,
        json={"status": "Archived", "reason": "Archiving temporarily"},
    )
    assert res_archive.status_code == 200
    assert res_archive.json()["goal"]["status"] == "Archived"

    # Direct transition Archived -> Active must be rejected (400)
    res_direct_active = client.patch(
        f"/goals/{goal_id}/status",
        headers=headers_a,
        json={"status": "Active"},
    )
    assert res_direct_active.status_code == 400

    # Safe recovery Archived -> Paused succeeds
    res_restore = client.patch(
        f"/goals/{goal_id}/status",
        headers=headers_a,
        json={"status": "Paused", "reason": "Unarchiving for review"},
    )
    assert res_restore.status_code == 200
    assert res_restore.json()["goal"]["status"] == "Paused"

    # Simulate an expired end_date while Paused -> activating must fail until end_date is extended
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE goals
            SET start_date = %s, end_date = %s
            WHERE goal_id = %s AND user_id = %s
            """,
            (today - timedelta(days=5), today - timedelta(days=1), goal_id, user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()

    res_expired_activate = client.patch(
        f"/goals/{goal_id}/status",
        headers=headers_a,
        json={"status": "Active"},
    )
    assert res_expired_activate.status_code == 400
    assert "Expired" in res_expired_activate.json()["detail"]

    # Create a second goal with a valid future end_date to verify full Archived -> Paused -> Active recovery
    res_create_2 = client.post(
        "/goals/",
        headers=headers_a,
        json={
            "goal_name": "Valid Future Archive Recovery",
            "start_date": str(today),
            "end_date": str(today + timedelta(days=14)),
        },
    )
    assert res_create_2.status_code == 201
    goal_id_2 = res_create_2.json()["goal"]["goal_id"]

    assert client.patch(
        f"/goals/{goal_id_2}/status",
        headers=headers_a,
        json={"status": "Paused"},
    ).status_code == 200

    assert client.patch(
        f"/goals/{goal_id_2}/status",
        headers=headers_a,
        json={"status": "Archived"},
    ).status_code == 200

    res_restore_2 = client.patch(
        f"/goals/{goal_id_2}/status",
        headers=headers_a,
        json={"status": "Paused", "reason": "Restoring valid goal"},
    )
    assert res_restore_2.status_code == 200
    assert res_restore_2.json()["goal"]["status"] == "Paused"

    res_reactivate = client.patch(
        f"/goals/{goal_id_2}/status",
        headers=headers_a,
        json={"status": "Active", "reason": "Resuming recovered goal"},
    )
    assert res_reactivate.status_code == 200
    assert res_reactivate.json()["goal"]["status"] == "Active"