from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
import mysql.connector

from storage.connection import get_db_connection


VALID_GOAL_STATUSES = {
    "Planned",
    "Active",
    "Paused",
    "Completed",
    "Abandoned",
    "Archived",
    "Expired",
}

ALLOWED_MANUAL_TRANSITIONS = {
    "Planned": {"Active", "Abandoned", "Archived"},
    "Active": {"Paused", "Abandoned", "Expired"},
    "Paused": {"Active", "Abandoned", "Archived"},
    "Completed": {"Archived"},
    "Abandoned": {"Archived"},
    "Expired": {"Archived"},
    "Archived": {"Paused"},
}

VALID_MEASUREMENT_TYPES = {"Count", "Duration", "Quantity"}
VALID_CRITERION_STATUSES = {"Active", "Completed", "Inactive"}
VALID_ACTOR_TYPES = {"User", "System"}


class GoalRuleError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _serialize_goal(row: Dict[str, Any], progress_percentage: float = 0.0) -> Dict[str, Any]:
    return {
        "goal_id": row["goal_id"],
        "user_id": row["user_id"],
        "goal_name": row["goal_name"],
        "description": row["description"],
        "start_date": str(row["start_date"]) if row.get("start_date") else None,
        "end_date": str(row["end_date"]) if row.get("end_date") else None,
        "status": row["status"],
        "completed_at": str(row["completed_at"]) if row.get("completed_at") else None,
        "notes": row["notes"],
        "progress_percentage": round(float(progress_percentage), 2),
        "created_at": str(row["created_at"]) if row.get("created_at") else None,
        "updated_at": str(row["updated_at"]) if row.get("updated_at") else None,
    }


def _activate_due_planned_goals(cursor, user_id: Optional[int] = None, goal_id: Optional[int] = None) -> int:
    today = date.today()
    conditions = [
        "status = 'Planned'",
        "start_date <= %s",
        "(end_date IS NULL OR end_date >= %s)",
        "deleted_at IS NULL",
    ]
    params: List[Any] = [today, today]

    if user_id is not None:
        conditions.append("user_id = %s")
        params.append(user_id)
    if goal_id is not None:
        conditions.append("goal_id = %s")
        params.append(goal_id)

    cursor.execute(
        f"""
        SELECT goal_id, user_id, status
        FROM goals
        WHERE {" AND ".join(conditions)}
        FOR UPDATE
        """,
        tuple(params),
    )
    due_goals = cursor.fetchall()
    activated_count = 0

    for g in due_goals:
        cursor.execute(
            """
            UPDATE goals
            SET status = 'Active'
            WHERE goal_id = %s AND user_id = %s AND status = 'Planned' AND deleted_at IS NULL
            """,
            (g["goal_id"], g["user_id"]),
        )
        if cursor.rowcount > 0:
            activated_count += 1
            cursor.execute(
                """
                INSERT INTO goal_status_history
                    (goal_id, user_id, old_status, new_status, changed_by, changed_by_type, reason)
                VALUES (%s, %s, 'Planned', 'Active', NULL, 'System', %s)
                """,
                (g["goal_id"], g["user_id"], "Goal start_date reached; automatically activated."),
            )

    return activated_count


def _auto_unlink_terminal_goal_habits(cursor, goal_id: int, user_id: int) -> None:
    cursor.execute(
        """
        UPDATE habit_goals
        SET unlinked_at = CURRENT_TIMESTAMP,
            unlinked_by = NULL,
            unlinked_by_type = 'System'
        WHERE goal_id = %s
          AND user_id = %s
          AND unlinked_at IS NULL
          AND deleted_at IS NULL
        """,
        (goal_id, user_id),
    )
    cursor.execute(
        """
        UPDATE goal_criteria_habits gch
        JOIN goal_criteria gc
            ON gch.criterion_id = gc.criterion_id AND gch.user_id = gc.user_id
        SET gch.unlinked_at = CURRENT_TIMESTAMP,
            gch.unlinked_by = NULL,
            gch.unlinked_by_type = 'System'
        WHERE gc.goal_id = %s
          AND gch.user_id = %s
          AND gch.unlinked_at IS NULL
          AND gch.deleted_at IS NULL
        """,
        (goal_id, user_id),
    )


def _expire_overdue_goals(cursor, user_id: Optional[int] = None, goal_id: Optional[int] = None) -> int:
    today = date.today()
    conditions = [
        "status IN ('Planned', 'Active', 'Paused')",
        "end_date IS NOT NULL",
        "end_date < %s",
        "deleted_at IS NULL",
    ]
    params: List[Any] = [today]

    if user_id is not None:
        conditions.append("user_id = %s")
        params.append(user_id)
    if goal_id is not None:
        conditions.append("goal_id = %s")
        params.append(goal_id)

    cursor.execute(
        f"""
        SELECT goal_id, user_id, status, end_date
        FROM goals
        WHERE {" AND ".join(conditions)}
        FOR UPDATE
        """,
        tuple(params),
    )
    overdue_goals = cursor.fetchall()
    expired_count = 0

    for g in overdue_goals:
        gid = g["goal_id"]
        uid = g["user_id"]
        old_status = g["status"]

        if old_status == "Active":
            _evaluate_goal_and_criteria_completion(cursor, gid, uid)
            cursor.execute(
                "SELECT status FROM goals WHERE goal_id = %s AND user_id = %s",
                (gid, uid),
            )
            refreshed = cursor.fetchone()
            if refreshed and refreshed["status"] == "Completed":
                continue

        cursor.execute(
            """
            UPDATE goals
            SET status = 'Expired'
            WHERE goal_id = %s
              AND user_id = %s
              AND status IN ('Planned', 'Active', 'Paused')
              AND deleted_at IS NULL
            """,
            (gid, uid),
        )
        if cursor.rowcount > 0:
            expired_count += 1
            cursor.execute(
                """
                INSERT INTO goal_status_history
                    (goal_id, user_id, old_status, new_status, changed_by, changed_by_type, reason)
                VALUES (%s, %s, %s, 'Expired', NULL, 'System', %s)
                """,
                (
                    gid,
                    uid,
                    old_status,
                    f"Automatically expired after passing end_date ({g['end_date']}).",
                ),
            )
            _auto_unlink_terminal_goal_habits(cursor, gid, uid)

    return expired_count


def _sync_goal_lifecycle_states(cursor, user_id: Optional[int] = None, goal_id: Optional[int] = None) -> Dict[str, int]:
    activated = _activate_due_planned_goals(cursor, user_id=user_id, goal_id=goal_id)
    expired = _expire_overdue_goals(cursor, user_id=user_id, goal_id=goal_id)
    return {"activated_count": activated, "expired_count": expired}


def _compute_goal_progress_percentage(cursor, goal_id: int, user_id: int) -> float:
    cursor.execute(
        """
        SELECT
            gc.criterion_id,
            gc.target_value,
            COALESCE(SUM(gpr.contribution_amount), 0) AS earned_amount
        FROM goal_criteria gc
        LEFT JOIN goal_progress_records gpr
            ON gc.criterion_id = gpr.criterion_id AND gpr.user_id = gc.user_id
        WHERE gc.goal_id = %s
          AND gc.user_id = %s
          AND gc.status IN ('Active', 'Completed')
          AND gc.deleted_at IS NULL
        GROUP BY gc.criterion_id, gc.target_value
        """,
        (goal_id, user_id),
    )
    criteria_rows = cursor.fetchall()
    if not criteria_rows:
        return 0.0

    percentages = []
    for row in criteria_rows:
        target = float(row["target_value"])
        earned = float(row["earned_amount"] or 0.00)
        if target > 0:
            pct = min(100.0, (earned / target) * 100.0)
            percentages.append(pct)

    if not percentages:
        return 0.0
    return round(sum(percentages) / len(percentages), 2)


def create_goal(
    user_id: int,
    goal_name: str,
    description: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    effective_start = start_date or date.today()
    if end_date is not None and end_date < effective_start:
        raise GoalRuleError("end_date cannot be earlier than start_date.", status_code=400)

    if end_date is not None and end_date < date.today():
        raise GoalRuleError("end_date cannot be in the past.", status_code=400)

    initial_status = "Active" if effective_start <= date.today() else "Planned"

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            INSERT INTO goals (user_id, goal_name, description, start_date, end_date, status, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (user_id, goal_name.strip(), description, effective_start, end_date, initial_status, notes),
        )
        new_goal_id = cursor.lastrowid

        cursor.execute(
            """
            INSERT INTO goal_status_history
                (goal_id, user_id, old_status, new_status, changed_by, changed_by_type, reason)
            VALUES (%s, %s, NULL, %s, %s, 'User', %s)
            """,
            (
                new_goal_id,
                user_id,
                initial_status,
                user_id,
                "Goal created" + (" and activated on start_date" if initial_status == "Active" else ""),
            ),
        )

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s
            """,
            (new_goal_id, user_id),
        )
        created_goal = cursor.fetchone()
        connection.commit()
        return _serialize_goal(created_goal, progress_percentage=0.0)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database constraint or query error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def list_user_goals(user_id: int, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    if status_filter and status_filter not in VALID_GOAL_STATUSES:
        raise GoalRuleError(f"Invalid status filter '{status_filter}'.", status_code=400)

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id)
        connection.commit()

        if status_filter:
            cursor.execute(
                """
                SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                       status, completed_at, notes, created_at, updated_at
                FROM goals
                WHERE user_id = %s AND status = %s AND deleted_at IS NULL
                ORDER BY created_at DESC, goal_id DESC
                """,
                (user_id, status_filter),
            )
        else:
            cursor.execute(
                """
                SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                       status, completed_at, notes, created_at, updated_at
                FROM goals
                WHERE user_id = %s AND deleted_at IS NULL
                ORDER BY created_at DESC, goal_id DESC
                """,
                (user_id,),
            )

        rows = cursor.fetchall()
        results = []
        for row in rows:
            pct = _compute_goal_progress_percentage(cursor, row["goal_id"], user_id)
            results.append(_serialize_goal(row, progress_percentage=pct))
        return results

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_goal_by_id(goal_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)
        connection.commit()

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )
        row = cursor.fetchone()
        if not row:
            return None

        pct = _compute_goal_progress_percentage(cursor, goal_id, user_id)
        return _serialize_goal(row, progress_percentage=pct)

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def update_goal_details(
    goal_id: int,
    user_id: int,
    goal_name: Optional[str] = None,
    description: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    notes: Optional[str] = None,
    provided_fields: Optional[set] = None,
) -> Dict[str, Any]:
    provided_fields = provided_fields or set()
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, user_id),
        )
        existing = cursor.fetchone()
        if not existing:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        if existing["status"] == "Completed":
            raise GoalRuleError("Completed goals are locked and cannot be modified.", status_code=400)

        if existing["status"] in {"Abandoned", "Archived", "Expired"}:
            raise GoalRuleError(
                f"Goals with status '{existing['status']}' cannot be edited.",
                status_code=400,
            )

        current_start = existing["start_date"]
        today = date.today()

        if "start_date" in provided_fields and start_date != current_start:
            if existing["status"] != "Planned" or current_start <= today:
                raise GoalRuleError(
                    "Goal start_date cannot be changed after the goal has started.",
                    status_code=400,
                )
            if start_date is None:
                raise GoalRuleError("start_date cannot be null.", status_code=400)
            new_start = start_date
        else:
            new_start = current_start

        new_end = end_date if "end_date" in provided_fields else existing["end_date"]
        if new_end is not None and new_end < new_start:
            raise GoalRuleError("end_date cannot be earlier than start_date.", status_code=400)

        new_name = goal_name.strip() if ("goal_name" in provided_fields and goal_name is not None) else existing["goal_name"]
        if not new_name:
            raise GoalRuleError("goal_name cannot be empty.", status_code=400)

        new_description = description if "description" in provided_fields else existing["description"]
        new_notes = notes if "notes" in provided_fields else existing["notes"]

        cursor.execute(
            """
            UPDATE goals
            SET goal_name = %s,
                description = %s,
                start_date = %s,
                end_date = %s,
                notes = %s
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (new_name, new_description, new_start, new_end, new_notes, goal_id, user_id),
        )

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s
            """,
            (goal_id, user_id),
        )
        updated = cursor.fetchone()
        pct = _compute_goal_progress_percentage(cursor, goal_id, user_id)
        connection.commit()
        return _serialize_goal(updated, progress_percentage=pct)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def change_goal_status(
    goal_id: int,
    user_id: int,
    new_status: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    if new_status not in VALID_GOAL_STATUSES:
        raise GoalRuleError(
            f"Invalid goal status '{new_status}'. Must be one of {sorted(VALID_GOAL_STATUSES)}.",
            status_code=400,
        )

    if new_status == "Completed":
        raise GoalRuleError(
            "Goal status cannot be manually set to 'Completed'. Completion is calculated automatically when all mandatory criteria are satisfied.",
            status_code=400,
        )

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, user_id),
        )
        existing = cursor.fetchone()
        if not existing:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        old_status = existing["status"]
        if old_status == new_status:
            raise GoalRuleError(f"Goal is already in status '{new_status}'.", status_code=400)

        if old_status == "Completed" and new_status == "Abandoned":
            raise GoalRuleError("Completed goals cannot be abandoned.", status_code=400)

        allowed_next = ALLOWED_MANUAL_TRANSITIONS.get(old_status, set())
        if new_status not in allowed_next:
            raise GoalRuleError(
                f"Invalid status transition from '{old_status}' to '{new_status}'. Allowed transitions: {sorted(allowed_next)}.",
                status_code=400,
            )

        if new_status == "Active":
            end_date = existing.get("end_date")
            if end_date is not None:
                if isinstance(end_date, str):
                    end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
                if end_date < date.today():
                    raise GoalRuleError(
                        "Cannot activate a goal whose end_date has already passed. Extend the end_date first.",
                        status_code=400,
                    )

        cursor.execute(
            """
            UPDATE goals
            SET status = %s
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (new_status, goal_id, user_id),
        )

        cursor.execute(
            """
            INSERT INTO goal_status_history
                (goal_id, user_id, old_status, new_status, changed_by, changed_by_type, reason)
            VALUES (%s, %s, %s, %s, %s, 'User', %s)
            """,
            (goal_id, user_id, old_status, new_status, user_id, reason),
        )

        if new_status in {"Abandoned", "Archived", "Expired"}:
            _auto_unlink_terminal_goal_habits(cursor, goal_id, user_id)
        elif new_status == "Active":
            _evaluate_goal_and_criteria_completion(cursor, goal_id, user_id)

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s
            """,
            (goal_id, user_id),
        )
        updated = cursor.fetchone()
        pct = _compute_goal_progress_percentage(cursor, goal_id, user_id)
        connection.commit()
        return _serialize_goal(updated, progress_percentage=pct)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def delete_goal(goal_id: int, user_id: int) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT goal_id, goal_name, status
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, user_id),
        )
        existing = cursor.fetchone()
        if not existing:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        _auto_unlink_terminal_goal_habits(cursor, goal_id, user_id)

        cursor.execute(
            """
            UPDATE goal_criteria
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )

        cursor.execute(
            """
            UPDATE goals
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )

        connection.commit()
        return {
            "goal_id": existing["goal_id"],
            "goal_name": existing["goal_name"],
            "deleted": True,
        }

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

def _serialize_criterion(row: Dict[str, Any]) -> Dict[str, Any]:
    target = float(row["target_value"])
    earned = float(row.get("earned_amount") or 0.0)
    completion_pct = round(min(100.0, (earned / target) * 100.0), 2) if target > 0 else 0.0
    return {
        "criterion_id": row["criterion_id"],
        "goal_id": row["goal_id"],
        "user_id": row["user_id"],
        "criterion_name": row["criterion_name"],
        "description": row["description"],
        "measurement_type": row["measurement_type"],
        "target_value": target,
        "measurement_unit": row["measurement_unit"],
        "is_mandatory": bool(row["is_mandatory"]),
        "status": row["status"],
        "earned_amount": round(earned, 2),
        "completion_percentage": completion_pct,
        "created_at": str(row["created_at"]) if row.get("created_at") else None,
        "updated_at": str(row["updated_at"]) if row.get("updated_at") else None,
    }


def _evaluate_goal_and_criteria_completion(cursor, goal_id: int, user_id: int) -> None:
    cursor.execute(
        """
        SELECT status
        FROM goals
        WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
        FOR UPDATE
        """,
        (goal_id, user_id),
    )
    goal_row = cursor.fetchone()
    if not goal_row or goal_row["status"] != "Active":
        return

    cursor.execute(
        """
        SELECT
            gc.criterion_id,
            gc.target_value,
            gc.is_mandatory,
            gc.status,
            COALESCE(SUM(gpr.contribution_amount), 0) AS earned_amount
        FROM goal_criteria gc
        LEFT JOIN goal_progress_records gpr
            ON gc.criterion_id = gpr.criterion_id AND gpr.user_id = gc.user_id
        WHERE gc.goal_id = %s
          AND gc.user_id = %s
          AND gc.status IN ('Active', 'Completed')
          AND gc.deleted_at IS NULL
        GROUP BY gc.criterion_id, gc.target_value, gc.is_mandatory, gc.status
        """,
        (goal_id, user_id),
    )
    criteria = cursor.fetchall()

    mandatory_total = 0
    mandatory_completed = 0

    for c in criteria:
        target = float(c["target_value"])
        earned = float(c["earned_amount"] or 0.0)
        current_status = c["status"]
        new_status = current_status

        if earned >= target and current_status == "Active":
            new_status = "Completed"
        elif earned < target and current_status == "Completed":
            new_status = "Active"

        if new_status != current_status:
            cursor.execute(
                """
                UPDATE goal_criteria
                SET status = %s
                WHERE criterion_id = %s AND user_id = %s
                """,
                (new_status, c["criterion_id"], user_id),
            )
            cursor.execute(
                """
                INSERT INTO goal_criteria_history
                    (criterion_id, user_id, field_name, old_value, new_value, changed_by, changed_by_type, reason)
                VALUES (%s, %s, 'status', %s, %s, NULL, 'System', %s)
                """,
                (
                    c["criterion_id"],
                    user_id,
                    current_status,
                    new_status,
                    "Criterion status recalculated automatically from recorded progress.",
                ),
            )

        if bool(c["is_mandatory"]):
            mandatory_total += 1
            if new_status == "Completed":
                mandatory_completed += 1

    if mandatory_total > 0 and mandatory_completed == mandatory_total:
        cursor.execute(
            """
            UPDATE goals
            SET status = 'Completed', completed_at = CURRENT_TIMESTAMP
            WHERE goal_id = %s AND user_id = %s AND status = 'Active' AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )
        if cursor.rowcount > 0:
            cursor.execute(
                """
                INSERT INTO goal_status_history
                    (goal_id, user_id, old_status, new_status, changed_by, changed_by_type, reason)
                VALUES (%s, %s, 'Active', 'Completed', NULL, 'System', %s)
                """,
                (goal_id, user_id, "All mandatory goal criteria satisfied."),
            )
            _auto_unlink_terminal_goal_habits(cursor, goal_id, user_id)


def _fetch_criterion_with_progress(cursor, criterion_id: int, goal_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    cursor.execute(
        """
        SELECT
            gc.criterion_id,
            gc.goal_id,
            gc.user_id,
            gc.criterion_name,
            gc.description,
            gc.measurement_type,
            gc.target_value,
            gc.measurement_unit,
            gc.is_mandatory,
            gc.status,
            gc.created_at,
            gc.updated_at,
            COALESCE(SUM(gpr.contribution_amount), 0) AS earned_amount
        FROM goal_criteria gc
        LEFT JOIN goal_progress_records gpr
            ON gc.criterion_id = gpr.criterion_id AND gpr.user_id = gc.user_id
        WHERE gc.criterion_id = %s
          AND gc.goal_id = %s
          AND gc.user_id = %s
          AND gc.deleted_at IS NULL
        GROUP BY
            gc.criterion_id, gc.goal_id, gc.user_id, gc.criterion_name,
            gc.description, gc.measurement_type, gc.target_value,
            gc.measurement_unit, gc.is_mandatory, gc.status,
            gc.created_at, gc.updated_at
        """,
        (criterion_id, goal_id, user_id),
    )
    row = cursor.fetchone()
    return _serialize_criterion(row) if row else None


def create_goal_criterion(
    goal_id: int,
    user_id: int,
    criterion_name: str,
    measurement_type: str,
    target_value: float,
    measurement_unit: str,
    description: Optional[str] = None,
    is_mandatory: bool = True,
) -> Dict[str, Any]:
    if measurement_type not in VALID_MEASUREMENT_TYPES:
        raise GoalRuleError(
            f"Invalid measurement_type '{measurement_type}'. Must be one of {sorted(VALID_MEASUREMENT_TYPES)}.",
            status_code=400,
        )
    if target_value <= 0:
        raise GoalRuleError("target_value must be greater than 0.", status_code=400)

    clean_name = criterion_name.strip()
    clean_unit = measurement_unit.strip()
    if not clean_name or not clean_unit:
        raise GoalRuleError("criterion_name and measurement_unit cannot be empty.", status_code=400)

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT goal_id, status
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, user_id),
        )
        goal = cursor.fetchone()
        if not goal:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        if goal["status"] == "Completed":
            raise GoalRuleError("Completed goals cannot accept new criteria.", status_code=400)

        if goal["status"] in {"Abandoned", "Archived", "Expired"}:
            raise GoalRuleError(
                f"Cannot add criteria to a goal with status '{goal['status']}'.",
                status_code=400,
            )

        cursor.execute(
            """
            INSERT INTO goal_criteria (
                goal_id, user_id, criterion_name, description,
                measurement_type, target_value, measurement_unit, is_mandatory, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'Active')
            """,
            (
                goal_id,
                user_id,
                clean_name,
                description,
                measurement_type,
                target_value,
                clean_unit,
                1 if is_mandatory else 0,
            ),
        )
        new_criterion_id = cursor.lastrowid

        created = _fetch_criterion_with_progress(cursor, new_criterion_id, goal_id, user_id)
        connection.commit()
        return created

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def list_goal_criteria(goal_id: int, user_id: int, include_inactive: bool = True) -> List[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT goal_id
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )
        if not cursor.fetchone():
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        status_clause = "" if include_inactive else "AND gc.status <> 'Inactive'"
        cursor.execute(
            f"""
            SELECT
                gc.criterion_id,
                gc.goal_id,
                gc.user_id,
                gc.criterion_name,
                gc.description,
                gc.measurement_type,
                gc.target_value,
                gc.measurement_unit,
                gc.is_mandatory,
                gc.status,
                gc.created_at,
                gc.updated_at,
                COALESCE(SUM(gpr.contribution_amount), 0) AS earned_amount
            FROM goal_criteria gc
            LEFT JOIN goal_progress_records gpr
                ON gc.criterion_id = gpr.criterion_id AND gpr.user_id = gc.user_id
            WHERE gc.goal_id = %s
              AND gc.user_id = %s
              AND gc.deleted_at IS NULL
              {status_clause}
            GROUP BY
                gc.criterion_id, gc.goal_id, gc.user_id, gc.criterion_name,
                gc.description, gc.measurement_type, gc.target_value,
                gc.measurement_unit, gc.is_mandatory, gc.status,
                gc.created_at, gc.updated_at
            ORDER BY gc.created_at ASC, gc.criterion_id ASC
            """,
            (goal_id, user_id),
        )
        rows = cursor.fetchall()
        return [_serialize_criterion(row) for row in rows]

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_goal_criterion(goal_id: int, criterion_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        return _fetch_criterion_with_progress(cursor, criterion_id, goal_id, user_id)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def update_goal_criterion(
    goal_id: int,
    criterion_id: int,
    user_id: int,
    updates: Dict[str, Any],
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT goal_id, status
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, user_id),
        )
        goal = cursor.fetchone()
        if not goal:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        if goal["status"] == "Completed":
            raise GoalRuleError("Cannot modify criteria on a Completed goal.", status_code=400)

        if goal["status"] in {"Abandoned", "Archived", "Expired"}:
            raise GoalRuleError(
                f"Cannot modify criteria on a goal with status '{goal['status']}'.",
                status_code=400,
            )

        cursor.execute(
            """
            SELECT criterion_id, goal_id, user_id, criterion_name, description,
                   measurement_type, target_value, measurement_unit, is_mandatory, status
            FROM goal_criteria
            WHERE criterion_id = %s AND goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (criterion_id, goal_id, user_id),
        )
        existing = cursor.fetchone()
        if not existing:
            raise GoalRuleError("Criterion not found or unauthorized.", status_code=404)

        if "measurement_type" in updates:
            if updates["measurement_type"] not in VALID_MEASUREMENT_TYPES:
                raise GoalRuleError(
                    f"Invalid measurement_type '{updates['measurement_type']}'.",
                    status_code=400,
                )

        if "target_value" in updates:
            if updates["target_value"] is None or float(updates["target_value"]) <= 0:
                raise GoalRuleError("target_value must be greater than 0.", status_code=400)

        if "status" in updates:
            if updates["status"] not in {"Active", "Inactive"}:
                raise GoalRuleError(
                    "Criterion status can only be manually set to 'Active' or 'Inactive'. 'Completed' is calculated automatically.",
                    status_code=400,
                )

        if "criterion_name" in updates:
            if not updates["criterion_name"] or not updates["criterion_name"].strip():
                raise GoalRuleError("criterion_name cannot be empty.", status_code=400)
            updates["criterion_name"] = updates["criterion_name"].strip()

        if "measurement_unit" in updates:
            if not updates["measurement_unit"] or not updates["measurement_unit"].strip():
                raise GoalRuleError("measurement_unit cannot be empty.", status_code=400)
            updates["measurement_unit"] = updates["measurement_unit"].strip()

        if "is_mandatory" in updates:
            if updates["is_mandatory"] is None:
                raise GoalRuleError("is_mandatory cannot be null.", status_code=400)
            updates["is_mandatory"] = 1 if updates["is_mandatory"] else 0

        history_entries = []
        set_clauses = []
        params = []

        for field_name, new_val in updates.items():
            old_val = existing[field_name]
            if field_name == "target_value":
                changed = float(old_val) != float(new_val)
                old_str = f"{float(old_val):.2f}"
                new_str = f"{float(new_val):.2f}"
            elif field_name == "is_mandatory":
                changed = int(bool(old_val)) != int(bool(new_val))
                old_str = str(int(bool(old_val)))
                new_str = str(int(bool(new_val)))
            else:
                changed = old_val != new_val
                old_str = str(old_val) if old_val is not None else None
                new_str = str(new_val) if new_val is not None else None

            if changed:
                set_clauses.append(f"{field_name} = %s")
                params.append(new_val)
                history_entries.append((criterion_id, user_id, field_name, old_str, new_str, user_id, reason))

        if not set_clauses:
            raise GoalRuleError("No actual changes detected for the criterion.", status_code=400)

        params.extend([criterion_id, goal_id, user_id])
        cursor.execute(
            f"""
            UPDATE goal_criteria
            SET {", ".join(set_clauses)}
            WHERE criterion_id = %s AND goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            tuple(params),
        )

        for entry in history_entries:
            cursor.execute(
                """
                INSERT INTO goal_criteria_history
                    (criterion_id, user_id, field_name, old_value, new_value, changed_by, changed_by_type, reason)
                VALUES (%s, %s, %s, %s, %s, %s, 'User', %s)
                """,
                entry,
            )

        _evaluate_goal_and_criteria_completion(cursor, goal_id, user_id)

        updated = _fetch_criterion_with_progress(cursor, criterion_id, goal_id, user_id)
        connection.commit()
        return updated

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def deactivate_goal_criterion(
    goal_id: int,
    criterion_id: int,
    user_id: int,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    return update_goal_criterion(
        goal_id=goal_id,
        criterion_id=criterion_id,
        user_id=user_id,
        updates={"status": "Inactive"},
        reason=reason or "Criterion deactivated by user.",
    )


def _serialize_habit_goal_link(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "habit_goal_id": row["habit_goal_id"],
        "habit_id": row["habit_id"],
        "habit_name": row.get("habit_name"),
        "goal_id": row["goal_id"],
        "user_id": row["user_id"],
        "is_active": row["unlinked_at"] is None,
        "linked_at": str(row["linked_at"]) if row.get("linked_at") else None,
        "unlinked_at": str(row["unlinked_at"]) if row.get("unlinked_at") else None,
        "linked_by": row["linked_by"],
        "linked_by_type": row["linked_by_type"],
        "unlinked_by": row["unlinked_by"],
        "unlinked_by_type": row["unlinked_by_type"],
    }


def _serialize_criterion_habit_link(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "goal_criterion_habits_id": row["goal_criterion_habits_id"],
        "criterion_id": row["criterion_id"],
        "habit_id": row["habit_id"],
        "habit_name": row.get("habit_name"),
        "user_id": row["user_id"],
        "is_active": row["unlinked_at"] is None,
        "linked_at": str(row["linked_at"]) if row.get("linked_at") else None,
        "unlinked_at": str(row["unlinked_at"]) if row.get("unlinked_at") else None,
        "linked_by": row["linked_by"],
        "linked_by_type": row["linked_by_type"],
        "unlinked_by": row["unlinked_by"],
        "unlinked_by_type": row["unlinked_by_type"],
    }


def link_habit_to_goal(
    goal_id: int,
    habit_id: int,
    user_id: int,
    actor_type: str = "User",
) -> Dict[str, Any]:
    if actor_type not in VALID_ACTOR_TYPES:
        raise GoalRuleError(f"Invalid actor_type '{actor_type}'.", status_code=400)

    linked_by = user_id if actor_type == "User" else None

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT goal_id, status
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, user_id),
        )
        goal = cursor.fetchone()
        if not goal:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        if goal["status"] in {"Completed", "Abandoned", "Archived", "Expired"}:
            raise GoalRuleError(
                f"Cannot link habits to a goal with status '{goal['status']}'.",
                status_code=400,
            )

        cursor.execute(
            """
            SELECT habit_id, habit_name, status
            FROM habits
            WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (habit_id, user_id),
        )
        habit = cursor.fetchone()
        if not habit:
            raise GoalRuleError("Habit not found or unauthorized.", status_code=404)

        if habit["status"] == "Deleted":
            raise GoalRuleError("Cannot link a deleted habit to a goal.", status_code=400)

        cursor.execute(
            """
            SELECT habit_goal_id
            FROM habit_goals
            WHERE habit_id = %s AND goal_id = %s AND user_id = %s
              AND unlinked_at IS NULL AND deleted_at IS NULL
            """,
            (habit_id, goal_id, user_id),
        )
        if cursor.fetchone():
            raise GoalRuleError(
                "This habit is already actively linked to this goal.",
                status_code=409,
            )

        cursor.execute(
            """
            INSERT INTO habit_goals
                (habit_id, goal_id, user_id, linked_by, linked_by_type)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (habit_id, goal_id, user_id, linked_by, actor_type),
        )
        new_link_id = cursor.lastrowid

        cursor.execute(
            """
            SELECT hg.*, h.habit_name
            FROM habit_goals hg
            JOIN habits h ON hg.habit_id = h.habit_id
            WHERE hg.habit_goal_id = %s
            """,
            (new_link_id,),
        )
        created_link = cursor.fetchone()
        connection.commit()
        return _serialize_habit_goal_link(created_link)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.IntegrityError as err:
        if connection:
            connection.rollback()
        if getattr(err, "errno", None) == 1062:
            raise GoalRuleError("This habit is already actively linked to this goal.", status_code=409)
        raise GoalRuleError(f"Database integrity error: {err}", status_code=400)
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def unlink_habit_from_goal(
    goal_id: int,
    habit_id: int,
    user_id: int,
    actor_type: str = "User",
) -> Dict[str, Any]:
    if actor_type not in VALID_ACTOR_TYPES:
        raise GoalRuleError(f"Invalid actor_type '{actor_type}'.", status_code=400)

    unlinked_by = user_id if actor_type == "User" else None

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT hg.*, h.habit_name
            FROM habit_goals hg
            JOIN habits h ON hg.habit_id = h.habit_id
            WHERE hg.goal_id = %s AND hg.habit_id = %s AND hg.user_id = %s
              AND hg.unlinked_at IS NULL AND hg.deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, habit_id, user_id),
        )
        active_link = cursor.fetchone()
        if not active_link:
            raise GoalRuleError(
                "Active relationship between this habit and goal was not found.",
                status_code=404,
            )

        cursor.execute(
            """
            UPDATE habit_goals
            SET unlinked_at = CURRENT_TIMESTAMP,
                unlinked_by = %s,
                unlinked_by_type = %s
            WHERE habit_goal_id = %s AND user_id = %s
            """,
            (unlinked_by, actor_type, active_link["habit_goal_id"], user_id),
        )

        cursor.execute(
            """
            UPDATE goal_criteria_habits gch
            JOIN goal_criteria gc ON gch.criterion_id = gc.criterion_id
            SET gch.unlinked_at = CURRENT_TIMESTAMP,
                gch.unlinked_by = %s,
                gch.unlinked_by_type = %s
            WHERE gc.goal_id = %s
              AND gch.habit_id = %s
              AND gch.user_id = %s
              AND gch.unlinked_at IS NULL
              AND gch.deleted_at IS NULL
            """,
            (unlinked_by, actor_type, goal_id, habit_id, user_id),
        )

        cursor.execute(
            """
            SELECT hg.*, h.habit_name
            FROM habit_goals hg
            JOIN habits h ON hg.habit_id = h.habit_id
            WHERE hg.habit_goal_id = %s
            """,
            (active_link["habit_goal_id"],),
        )
        updated_link = cursor.fetchone()
        connection.commit()
        return _serialize_habit_goal_link(updated_link)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def list_goal_habits(goal_id: int, user_id: int, include_history: bool = False) -> List[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT goal_id FROM goals WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL",
            (goal_id, user_id),
        )
        if not cursor.fetchone():
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        active_filter = "" if include_history else "AND hg.unlinked_at IS NULL"
        cursor.execute(
            f"""
            SELECT hg.*, h.habit_name
            FROM habit_goals hg
            JOIN habits h ON hg.habit_id = h.habit_id
            WHERE hg.goal_id = %s
              AND hg.user_id = %s
              AND hg.deleted_at IS NULL
              {active_filter}
            ORDER BY hg.linked_at DESC, hg.habit_goal_id DESC
            """,
            (goal_id, user_id),
        )
        rows = cursor.fetchall()
        return [_serialize_habit_goal_link(r) for r in rows]

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def link_habit_to_criterion(
    goal_id: int,
    criterion_id: int,
    habit_id: int,
    user_id: int,
    actor_type: str = "User",
) -> Dict[str, Any]:
    if actor_type not in VALID_ACTOR_TYPES:
        raise GoalRuleError(f"Invalid actor_type '{actor_type}'.", status_code=400)

    linked_by = user_id if actor_type == "User" else None

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)

        cursor.execute(
            """
            SELECT g.goal_id, g.status AS goal_status, gc.criterion_id, gc.status AS criterion_status
            FROM goals g
            JOIN goal_criteria gc ON g.goal_id = gc.goal_id AND g.user_id = gc.user_id
            WHERE g.goal_id = %s
              AND gc.criterion_id = %s
              AND g.user_id = %s
              AND g.deleted_at IS NULL
              AND gc.deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, criterion_id, user_id),
        )
        target_row = cursor.fetchone()
        if not target_row:
            raise GoalRuleError("Goal or criterion not found or unauthorized.", status_code=404)

        if target_row["goal_status"] in {"Completed", "Abandoned", "Archived", "Expired"}:
            raise GoalRuleError(
                f"Cannot link habits to criteria of a goal with status '{target_row['goal_status']}'.",
                status_code=400,
            )

        if target_row["criterion_status"] == "Inactive":
            raise GoalRuleError("Cannot link a habit to an Inactive criterion.", status_code=400)

        cursor.execute(
            """
            SELECT habit_id, habit_name, status
            FROM habits
            WHERE habit_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (habit_id, user_id),
        )
        habit = cursor.fetchone()
        if not habit:
            raise GoalRuleError("Habit not found or unauthorized.", status_code=404)

        if habit["status"] == "Deleted":
            raise GoalRuleError("Cannot link a deleted habit to a criterion.", status_code=400)

        cursor.execute(
            """
            SELECT habit_goal_id
            FROM habit_goals
            WHERE habit_id = %s AND goal_id = %s AND user_id = %s
              AND unlinked_at IS NULL AND deleted_at IS NULL
            """,
            (habit_id, goal_id, user_id),
        )
        if not cursor.fetchone():
            raise GoalRuleError(
                "Habit must be actively linked to the parent goal before it can be linked to a criterion.",
                status_code=400,
            )

        cursor.execute(
            """
            SELECT goal_criterion_habits_id
            FROM goal_criteria_habits
            WHERE habit_id = %s AND criterion_id = %s AND user_id = %s
              AND unlinked_at IS NULL AND deleted_at IS NULL
            """,
            (habit_id, criterion_id, user_id),
        )
        if cursor.fetchone():
            raise GoalRuleError(
                "This habit is already actively linked to this criterion.",
                status_code=409,
            )

        cursor.execute(
            """
            INSERT INTO goal_criteria_habits
                (criterion_id, habit_id, user_id, linked_by, linked_by_type)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (criterion_id, habit_id, user_id, linked_by, actor_type),
        )
        new_link_id = cursor.lastrowid

        cursor.execute(
            """
            SELECT gch.*, h.habit_name
            FROM goal_criteria_habits gch
            JOIN habits h ON gch.habit_id = h.habit_id
            WHERE gch.goal_criterion_habits_id = %s
            """,
            (new_link_id,),
        )
        created_link = cursor.fetchone()
        connection.commit()
        return _serialize_criterion_habit_link(created_link)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.IntegrityError as err:
        if connection:
            connection.rollback()
        if getattr(err, "errno", None) == 1062:
            raise GoalRuleError("This habit is already actively linked to this criterion.", status_code=409)
        raise GoalRuleError(f"Database integrity error: {err}", status_code=400)
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def unlink_habit_from_criterion(
    goal_id: int,
    criterion_id: int,
    habit_id: int,
    user_id: int,
    actor_type: str = "User",
) -> Dict[str, Any]:
    if actor_type not in VALID_ACTOR_TYPES:
        raise GoalRuleError(f"Invalid actor_type '{actor_type}'.", status_code=400)

    unlinked_by = user_id if actor_type == "User" else None

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT gch.*, h.habit_name
            FROM goal_criteria_habits gch
            JOIN goal_criteria gc ON gch.criterion_id = gc.criterion_id AND gch.user_id = gc.user_id
            JOIN habits h ON gch.habit_id = h.habit_id
            WHERE gc.goal_id = %s
              AND gch.criterion_id = %s
              AND gch.habit_id = %s
              AND gch.user_id = %s
              AND gch.unlinked_at IS NULL
              AND gch.deleted_at IS NULL
            FOR UPDATE
            """,
            (goal_id, criterion_id, habit_id, user_id),
        )
        active_link = cursor.fetchone()
        if not active_link:
            raise GoalRuleError(
                "Active relationship between this habit and criterion was not found.",
                status_code=404,
            )

        cursor.execute(
            """
            UPDATE goal_criteria_habits
            SET unlinked_at = CURRENT_TIMESTAMP,
                unlinked_by = %s,
                unlinked_by_type = %s
            WHERE goal_criterion_habits_id = %s AND user_id = %s
            """,
            (unlinked_by, actor_type, active_link["goal_criterion_habits_id"], user_id),
        )

        cursor.execute(
            """
            SELECT gch.*, h.habit_name
            FROM goal_criteria_habits gch
            JOIN habits h ON gch.habit_id = h.habit_id
            WHERE gch.goal_criterion_habits_id = %s
            """,
            (active_link["goal_criterion_habits_id"],),
        )
        updated_link = cursor.fetchone()
        connection.commit()
        return _serialize_criterion_habit_link(updated_link)

    except GoalRuleError:
        if connection:
            connection.rollback()
        raise
    except mysql.connector.Error as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Database error: {err}", status_code=400)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def list_criterion_habits(
    goal_id: int,
    criterion_id: int,
    user_id: int,
    include_history: bool = False,
) -> List[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT criterion_id
            FROM goal_criteria
            WHERE criterion_id = %s AND goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (criterion_id, goal_id, user_id),
        )
        if not cursor.fetchone():
            raise GoalRuleError("Goal or criterion not found or unauthorized.", status_code=404)

        active_filter = "" if include_history else "AND gch.unlinked_at IS NULL"
        cursor.execute(
            f"""
            SELECT gch.*, h.habit_name
            FROM goal_criteria_habits gch
            JOIN habits h ON gch.habit_id = h.habit_id
            WHERE gch.criterion_id = %s
              AND gch.user_id = %s
              AND gch.deleted_at IS NULL
              {active_filter}
            ORDER BY gch.linked_at DESC, gch.goal_criterion_habits_id DESC
            """,
            (criterion_id, user_id),
        )
        rows = cursor.fetchall()
        return [_serialize_criterion_habit_link(r) for r in rows]

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def _calculate_contribution_amount(measurement_type: str, occurrence_row: Dict[str, Any]) -> float:
    if measurement_type == "Count":
        return 1.00

    if measurement_type == "Duration":
        if occurrence_row.get("duration_minutes") is not None and float(occurrence_row["duration_minutes"]) > 0:
            return round(float(occurrence_row["duration_minutes"]), 2)
        if occurrence_row.get("start_time") is not None and occurrence_row.get("end_time") is not None:
            base_day = date.today()
            start_dt = (
                datetime.combine(base_day, datetime.min.time()) + occurrence_row["start_time"]
                if isinstance(occurrence_row["start_time"], timedelta)
                else datetime.combine(base_day, occurrence_row["start_time"])
            )
            end_dt = (
                datetime.combine(base_day, datetime.min.time()) + occurrence_row["end_time"]
                if isinstance(occurrence_row["end_time"], timedelta)
                else datetime.combine(base_day, occurrence_row["end_time"])
            )
            diff_minutes = (end_dt - start_dt).total_seconds() / 60.0
            if diff_minutes > 0:
                return round(diff_minutes, 2)
        return 1.00

    if measurement_type == "Quantity":
        if occurrence_row.get("metric_target_snapshot") is not None and float(occurrence_row["metric_target_snapshot"]) > 0:
            return round(float(occurrence_row["metric_target_snapshot"]), 2)
        if occurrence_row.get("habit_target_value") is not None and float(occurrence_row["habit_target_value"]) > 0:
            return round(float(occurrence_row["habit_target_value"]), 2)
        return 1.00

    return 1.00


def record_occurrence_goal_progress(cursor, occurrence_id: int, user_id: int) -> List[Dict[str, Any]]:
    _sync_goal_lifecycle_states(cursor, user_id=user_id)

    cursor.execute(
        """
        SELECT
            o.occurrence_id,
            o.habit_id,
            o.occurrence_date,
            o.start_time,
            o.end_time,
            o.duration_minutes,
            o.metric_target_snapshot,
            o.status,
            o.completed_at,
            h.target_value AS habit_target_value
        FROM habit_occurrences o
        JOIN habits h ON o.habit_id = h.habit_id
        WHERE o.occurrence_id = %s
          AND h.user_id = %s
          AND o.status = 'Done'
        """,
        (occurrence_id, user_id),
    )
    occ = cursor.fetchone()
    if not occ:
        return []

    occ_date = occ["occurrence_date"]
    if isinstance(occ_date, str):
        occ_date = datetime.strptime(occ_date, "%Y-%m-%d").date()

    cursor.execute(
        """
        SELECT
            g.goal_id,
            g.goal_name,
            g.start_date,
            g.end_date,
            gc.criterion_id,
            gc.criterion_name,
            gc.measurement_type,
            gc.target_value,
            gc.measurement_unit
        FROM goal_criteria_habits gch
        JOIN goal_criteria gc
            ON gch.criterion_id = gc.criterion_id AND gch.user_id = gc.user_id
        JOIN goals g
            ON gc.goal_id = g.goal_id AND gc.user_id = g.user_id
        JOIN habit_goals hg
            ON hg.habit_id = gch.habit_id AND hg.goal_id = g.goal_id AND hg.user_id = g.user_id
        WHERE gch.habit_id = %s
          AND gch.user_id = %s
          AND gch.unlinked_at IS NULL
          AND gch.deleted_at IS NULL
          AND hg.unlinked_at IS NULL
          AND hg.deleted_at IS NULL
          AND gc.status = 'Active'
          AND gc.deleted_at IS NULL
          AND g.status = 'Active'
          AND g.deleted_at IS NULL
        """,
        (occ["habit_id"], user_id),
    )
    eligible_criteria = cursor.fetchall()
    if not eligible_criteria:
        return []

    recorded_items: List[Dict[str, Any]] = []
    affected_goal_ids = set()
    recorded_timestamp = occ["completed_at"] or datetime.now()

    for item in eligible_criteria:
        if item["start_date"] and occ_date < item["start_date"]:
            continue
        if item["end_date"] and occ_date > item["end_date"]:
            continue

        criterion_id = item["criterion_id"]
        cursor.execute(
            """
            SELECT *
            FROM goal_progress_records
            WHERE habit_occurrence_id = %s AND criterion_id = %s
            LIMIT 1
            """,
            (occurrence_id, criterion_id),
        )
        if cursor.fetchone():
            continue

        contribution = _calculate_contribution_amount(item["measurement_type"], occ)
        if contribution <= 0:
            continue

        cursor.execute(
            """
            INSERT INTO goal_progress_records (
                criterion_id, habit_occurrence_id, user_id,
                contribution_amount, recorded_at
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                criterion_id,
                occurrence_id,
                user_id,
                contribution,
                recorded_timestamp,
            ),
        )
        progress_id = cursor.lastrowid
        affected_goal_ids.add(item["goal_id"])

        recorded_items.append(
            {
                "progress_id": progress_id,
                "goal_id": item["goal_id"],
                "goal_name": item["goal_name"],
                "criterion_id": criterion_id,
                "criterion_name": item["criterion_name"],
                "habit_occurrence_id": occurrence_id,
                "contribution_amount": contribution,
                "measurement_unit": item["measurement_unit"],
            }
        )

    for gid in affected_goal_ids:
        _evaluate_goal_and_criteria_completion(cursor, gid, user_id)

    return recorded_items


def get_goal_progress_summary(goal_id: int, user_id: int) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        _sync_goal_lifecycle_states(cursor, user_id=user_id, goal_id=goal_id)
        connection.commit()

        cursor.execute(
            """
            SELECT goal_id, user_id, goal_name, description, start_date, end_date,
                   status, completed_at, notes, created_at, updated_at
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )
        goal_row = cursor.fetchone()
        if not goal_row:
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        overall_pct = _compute_goal_progress_percentage(cursor, goal_id, user_id)

        cursor.execute(
            """
            SELECT
                gc.criterion_id,
                gc.goal_id,
                gc.user_id,
                gc.criterion_name,
                gc.description,
                gc.measurement_type,
                gc.target_value,
                gc.measurement_unit,
                gc.is_mandatory,
                gc.status,
                gc.created_at,
                gc.updated_at,
                COALESCE(SUM(gpr.contribution_amount), 0) AS earned_amount
            FROM goal_criteria gc
            LEFT JOIN goal_progress_records gpr
                ON gc.criterion_id = gpr.criterion_id AND gpr.user_id = gc.user_id
            WHERE gc.goal_id = %s
              AND gc.user_id = %s
              AND gc.deleted_at IS NULL
            GROUP BY
                gc.criterion_id, gc.goal_id, gc.user_id, gc.criterion_name,
                gc.description, gc.measurement_type, gc.target_value,
                gc.measurement_unit, gc.is_mandatory, gc.status,
                gc.created_at, gc.updated_at
            ORDER BY gc.created_at ASC, gc.criterion_id ASC
            """,
            (goal_id, user_id),
        )
        criteria_list = [_serialize_criterion(r) for r in cursor.fetchall()]

        cursor.execute(
            """
            SELECT
                gpr.*,
                gc.goal_id,
                gc.criterion_name
            FROM goal_progress_records gpr
            JOIN goal_criteria gc ON gpr.criterion_id = gc.criterion_id
            WHERE gc.goal_id = %s AND gpr.user_id = %s
            ORDER BY gpr.recorded_at DESC
            """,
            (goal_id, user_id),
        )
        record_rows = cursor.fetchall()
        progress_records = []
        for r in record_rows:
            pk_val = next(
                (
                    v
                    for k, v in r.items()
                    if k.endswith("_id")
                    and k not in {"goal_id", "criterion_id", "user_id", "habit_id", "habit_occurrence_id", "occurrence_id"}
                ),
                None,
            )
            occ_id = r.get("habit_occurrence_id") or r.get("occurrence_id")
            progress_records.append(
                {
                    "progress_id": pk_val,
                    "goal_id": r["goal_id"],
                    "criterion_id": r["criterion_id"],
                    "criterion_name": r["criterion_name"],
                    "user_id": r["user_id"],
                    "habit_occurrence_id": occ_id,
                    "contribution_amount": float(r["contribution_amount"]),
                    "recorded_at": str(r["recorded_at"]) if r.get("recorded_at") else None,
                }
            )

        return {
            "goal": _serialize_goal(goal_row, progress_percentage=overall_pct),
            "criteria_progress": criteria_list,
            "records_count": len(progress_records),
            "progress_records": progress_records,
        }

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_goal_status_history(goal_id: int, user_id: int) -> List[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT goal_id
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )
        if not cursor.fetchone():
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        cursor.execute(
            """
            SELECT
                gsh.*
            FROM goal_status_history gsh
            WHERE gsh.goal_id = %s AND gsh.user_id = %s
            ORDER BY gsh.changed_at DESC
            """,
            (goal_id, user_id),
        )
        rows = cursor.fetchall()
        results = []
        for r in rows:
            pk_val = next((v for k, v in r.items() if k.endswith("_id") and k not in {"goal_id", "user_id"}), None)
            results.append(
                {
                    "history_id": pk_val,
                    "goal_id": r["goal_id"],
                    "user_id": r["user_id"],
                    "old_status": r["old_status"],
                    "new_status": r["new_status"],
                    "changed_by": r["changed_by"],
                    "changed_by_type": r["changed_by_type"],
                    "reason": r["reason"],
                    "changed_at": str(r["changed_at"]) if r.get("changed_at") else None,
                }
            )
        return results
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_criterion_modification_history(
    goal_id: int,
    criterion_id: int,
    user_id: int,
) -> List[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT gc.criterion_id, gc.criterion_name, gc.user_id
            FROM goal_criteria gc
            JOIN goals g ON gc.goal_id = g.goal_id AND gc.user_id = g.user_id
            WHERE gc.criterion_id = %s
              AND gc.goal_id = %s
              AND gc.user_id = %s
              AND g.deleted_at IS NULL
              AND gc.deleted_at IS NULL
            """,
            (criterion_id, goal_id, user_id),
        )
        criterion = cursor.fetchone()
        if not criterion:
            raise GoalRuleError("Goal or criterion not found or unauthorized.", status_code=404)

        cursor.execute(
            """
            SELECT
                gch.*,
                gc.user_id
            FROM goal_criteria_history gch
            JOIN goal_criteria gc ON gch.criterion_id = gc.criterion_id
            WHERE gch.criterion_id = %s AND gc.user_id = %s
            ORDER BY gch.changed_at DESC
            """,
            (criterion_id, user_id),
        )
        rows = cursor.fetchall()
        results = []
        for r in rows:
            pk_val = next((v for k, v in r.items() if k.endswith("_id") and k not in {"criterion_id", "user_id"}), None)
            results.append(
                {
                    "history_id": pk_val,
                    "criterion_id": r["criterion_id"],
                    "criterion_name": criterion["criterion_name"],
                    "user_id": r["user_id"],
                    "field_name": r["field_name"],
                    "old_value": r["old_value"],
                    "new_value": r["new_value"],
                    "changed_by": r["changed_by"],
                    "changed_by_type": r["changed_by_type"],
                    "reason": r["reason"],
                    "changed_at": str(r["changed_at"]) if r.get("changed_at") else None,
                }
            )
        return results

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def get_all_goal_criteria_history(goal_id: int, user_id: int) -> List[Dict[str, Any]]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT goal_id
            FROM goals
            WHERE goal_id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (goal_id, user_id),
        )
        if not cursor.fetchone():
            raise GoalRuleError("Goal not found or unauthorized.", status_code=404)

        cursor.execute(
            """
            SELECT
                gch.*,
                gc.criterion_name,
                gc.user_id
            FROM goal_criteria_history gch
            JOIN goal_criteria gc ON gch.criterion_id = gc.criterion_id
            WHERE gc.goal_id = %s
              AND gc.user_id = %s
              AND gc.deleted_at IS NULL
            ORDER BY gch.changed_at DESC
            """,
            (goal_id, user_id),
        )
        rows = cursor.fetchall()
        results = []
        for r in rows:
            pk_val = next((v for k, v in r.items() if k.endswith("_id") and k not in {"criterion_id", "user_id"}), None)
            results.append(
                {
                    "history_id": pk_val,
                    "criterion_id": r["criterion_id"],
                    "criterion_name": r["criterion_name"],
                    "user_id": r["user_id"],
                    "field_name": r["field_name"],
                    "old_value": r["old_value"],
                    "new_value": r["new_value"],
                    "changed_by": r["changed_by"],
                    "changed_by_type": r["changed_by_type"],
                    "reason": r["reason"],
                    "changed_at": str(r["changed_at"]) if r.get("changed_at") else None,
                }
            )
        return results

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def run_user_goal_maintenance(user_id: int) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        summary = _sync_goal_lifecycle_states(cursor, user_id=user_id)
        connection.commit()
        return {
            "user_id": user_id,
            "run_date": str(date.today()),
            "activated_count": summary["activated_count"],
            "expired_count": summary["expired_count"],
        }

    except Exception as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"Goal maintenance error: {err}", status_code=500)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def run_system_goal_maintenance() -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        summary = _sync_goal_lifecycle_states(cursor, user_id=None)
        connection.commit()
        return {
            "scope": "System",
            "run_date": str(date.today()),
            "activated_count": summary["activated_count"],
            "expired_count": summary["expired_count"],
        }

    except Exception as err:
        if connection:
            connection.rollback()
        raise GoalRuleError(f"System goal maintenance error: {err}", status_code=500)
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()