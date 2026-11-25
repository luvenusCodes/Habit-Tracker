from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
import mysql.connector

from storage.connection import get_db_connection
from storage.goals_storage import (
    record_occurrence_goal_progress,
    remove_occurrence_goal_progress,
)


class OccurrenceRuleError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _to_time(val: Any):
    if isinstance(val, timedelta):
        return (datetime.min + val).time()
    return val


def generate_occurrences_for_date(user_id: int, target_date_str: Optional[str] = None) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        gen_date = (
            datetime.strptime(target_date_str, "%Y-%m-%d").date()
            if target_date_str
            else date.today()
        )
        day_of_week_str = gen_date.strftime("%A")

        query = """
            SELECT 
                s.schedule_id,
                s.habit_id,
                s.start_time,
                s.end_time,
                s.duration_minutes,
                h.habit_name,
                h.priority,
                h.measurement_type,
                h.target_value,
                c.category_name
            FROM habit_schedule s
            JOIN habits h ON s.habit_id = h.habit_id
            JOIN categories c ON h.category_id = c.category_id
            WHERE h.user_id = %s
                AND s.status = 'Active'
                AND h.status = 'Active'
                AND s.day_of_week = %s
        """
        cursor.execute(query, (user_id, day_of_week_str))
        schedules = cursor.fetchall()

        generated_count = 0

        for sch in schedules:
            cursor.execute(
                "SELECT occurrence_id FROM habit_occurrences WHERE schedule_id = %s AND occurrence_date = %s",
                (sch["schedule_id"], gen_date),
            )
            if cursor.fetchone():
                continue

            start_t = _to_time(sch["start_time"])
            end_t = _to_time(sch["end_time"]) if sch["end_time"] is not None else None

            start_dt = datetime.combine(gen_date, start_t)
            if end_t:
                scheduled_end_at = datetime.combine(gen_date, end_t)
            elif sch["duration_minutes"]:
                scheduled_end_at = start_dt + timedelta(minutes=sch["duration_minutes"])
            else:
                scheduled_end_at = start_dt + timedelta(minutes=30)

            insert_query = """
                INSERT INTO habit_occurrences (
                    habit_id, user_id, schedule_id, habit_name_snapshot, priority_snapshot,
                    category_snapshot, metric_name_snapshot, metric_target_snapshot,
                    occurrence_date, start_time, end_time, duration_minutes,
                    scheduled_end_at, status, base_score, carry_forward_attempt
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pending', 10.00, 0)
            """
            cursor.execute(
                insert_query,
                (
                    sch["habit_id"],
                    user_id,
                    sch["schedule_id"],
                    sch["habit_name"],
                    sch["priority"],
                    sch["category_name"],
                    sch["measurement_type"],
                    sch["target_value"],
                    gen_date,
                    start_t,
                    end_t,
                    sch["duration_minutes"],
                    scheduled_end_at,
                ),
            )
            generated_count += 1

        connection.commit()

        return {
            "message": f"Successfully generated {generated_count} occurrence(s) for {gen_date} ({day_of_week_str}).",
            "date": str(gen_date),
            "generated_count": generated_count,
        }

    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def fetch_user_occurrences_for_date(user_id: int, date_str: Optional[str] = None) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        target_date = date_str or str(date.today())

        safe_query = """
            SELECT o.occurrence_id, o.habit_id, o.schedule_id, o.habit_name_snapshot,
                   o.priority_snapshot, o.category_snapshot, o.occurrence_date,
                   o.start_time, o.end_time, o.status, o.base_score, o.final_score
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE h.user_id = %s AND o.occurrence_date = %s
        """
        cursor.execute(safe_query, (user_id, target_date))
        occurrences = cursor.fetchall()

        for occ in occurrences:
            if occ.get("start_time") is not None:
                occ["start_time"] = str(occ["start_time"])
            if occ.get("end_time") is not None:
                occ["end_time"] = str(occ["end_time"])
            if occ.get("occurrence_date") is not None:
                occ["occurrence_date"] = str(occ["occurrence_date"])

        return {"date": target_date, "occurrences": occurrences}

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def update_occurrence_status_in_db(
    occurrence_id: int,
    new_status: str,
    user_id: int,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        auth_query = """
            SELECT o.occurrence_id, o.status AS current_status, o.base_score, h.user_id
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE o.occurrence_id = %s AND h.user_id = %s
            FOR UPDATE
        """
        cursor.execute(auth_query, (occurrence_id, user_id))
        occurrence = cursor.fetchone()

        if not occurrence:
            raise OccurrenceRuleError("Occurrence not found or unauthorized.", status_code=404)

        old_status = occurrence["current_status"]

        valid_statuses = ["Pending", "Done", "Not Done", "Carried Over", "Incomplete", "Skipped", "Cancelled"]
        if new_status not in valid_statuses:
            raise OccurrenceRuleError(f"Invalid status. Must be one of {valid_statuses}.", status_code=400)

        completed_at = None
        final_score = occurrence["base_score"]

        if new_status == "Done":
            completed_at = datetime.now()
        elif new_status in ["Not Done", "Skipped", "Cancelled"]:
            final_score = 0.00

        update_query = """
            UPDATE habit_occurrences
            SET status = %s,
                completed_at = %s,
                reason = %s,
                final_score = %s,
                status_recorded_at = CURRENT_TIMESTAMP
            WHERE occurrence_id = %s
        """
        cursor.execute(update_query, (new_status, completed_at, reason, final_score, occurrence_id))

        history_query = """
            INSERT INTO occurrence_status_history
                (occurrence_id, old_status, new_status, changed_by, changed_by_type, reason)
            VALUES (%s, %s, %s, %s, 'User', %s)
        """
        cursor.execute(history_query, (occurrence_id, old_status, new_status, user_id, reason))

        goal_progress_recorded: List[Dict[str, Any]] = []
        if new_status == "Done":
            goal_progress_recorded = record_occurrence_goal_progress(
                cursor=cursor,
                occurrence_id=occurrence_id,
                user_id=user_id,
            )
        elif old_status == "Done" and new_status != "Done":
            remove_occurrence_goal_progress(
                cursor=cursor,
                occurrence_id=occurrence_id,
                user_id=user_id,
            )

        connection.commit()

        return {
            "message": f"Occurrence status updated to '{new_status}' successfully.",
            "occurrence_id": occurrence_id,
            "old_status": old_status,
            "new_status": new_status,
            "final_score": float(final_score),
            "completed_at": str(completed_at) if completed_at else None,
            "goal_progress_recorded": goal_progress_recorded,
        }

    except OccurrenceRuleError:
        if connection:
            connection.rollback()
        raise
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def carry_forward_occurrence_in_db(
    occurrence_id: int,
    user_id: int,
    target_date_str: Optional[str] = None,
) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        fetch_query = """
            SELECT o.*, h.user_id AS owner_user_id
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE o.occurrence_id = %s AND h.user_id = %s
            FOR UPDATE
        """
        cursor.execute(fetch_query, (occurrence_id, user_id))
        old_occ = cursor.fetchone()

        if not old_occ:
            raise OccurrenceRuleError("Occurrence not found or unauthorized.", status_code=404)

        if old_occ["status"] not in ["Pending", "Not Done", "Incomplete"]:
            raise OccurrenceRuleError(
                f"Cannot carry forward an occurrence with status '{old_occ['status']}'.",
                status_code=400,
            )

        current_attempts = old_occ["carry_forward_attempt"]
        if current_attempts >= 3:
            raise OccurrenceRuleError(
                "Maximum carry_forward limit (3 attempts) reached for this occurrence.",
                status_code=400,
            )

        new_attempts = current_attempts + 1

        old_date = old_occ["occurrence_date"]
        if isinstance(old_date, str):
            old_date = datetime.strptime(old_date, "%Y-%m-%d").date()

        if target_date_str:
            new_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        else:
            new_date = old_date + timedelta(days=1)

        original_id = (
            old_occ["original_occurrence_id"]
            if old_occ.get("original_occurrence_id") is not None
            else old_occ["occurrence_id"]
        )

        cursor.execute(
            """
            UPDATE habit_occurrences
            SET status = 'Carried Over', status_recorded_at = CURRENT_TIMESTAMP
            WHERE occurrence_id = %s
            """,
            (occurrence_id,),
        )

        cursor.execute(
            """
            INSERT INTO occurrence_status_history
                (occurrence_id, old_status, new_status, changed_by, changed_by_type, reason)
            VALUES (%s, %s, 'Carried Over', %s, 'User', 'Carried forward to next date')
            """,
            (occurrence_id, old_occ["status"], user_id),
        )

        insert_new_query = """
            INSERT INTO habit_occurrences (
                habit_id, user_id, schedule_id, habit_name_snapshot, priority_snapshot,
                category_snapshot, metric_name_snapshot, metric_target_snapshot,
                occurrence_date, start_time, end_time, duration_minutes,
                scheduled_end_at, status, base_score, carry_forward_attempt,
                original_occurrence_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pending', 10.00, %s, %s)
        """

        start_t = _to_time(old_occ["start_time"])
        end_t = _to_time(old_occ["end_time"]) if old_occ["end_time"] is not None else None

        start_dt = datetime.combine(new_date, start_t)
        if end_t:
            time_diff = datetime.combine(old_date, end_t) - datetime.combine(old_date, start_t)
            scheduled_end_at = start_dt + time_diff
        elif old_occ["duration_minutes"]:
            scheduled_end_at = start_dt + timedelta(minutes=old_occ["duration_minutes"])
        else:
            scheduled_end_at = start_dt + timedelta(minutes=30)

        cursor.execute(
            insert_new_query,
            (
                old_occ["habit_id"],
                user_id,
                old_occ["schedule_id"],
                old_occ["habit_name_snapshot"],
                old_occ["priority_snapshot"],
                old_occ["category_snapshot"],
                old_occ["metric_name_snapshot"],
                old_occ["metric_target_snapshot"],
                new_date,
                start_t,
                end_t,
                old_occ["duration_minutes"],
                scheduled_end_at,
                new_attempts,
                original_id,
            ),
        )
        new_occurrence_id = cursor.lastrowid

        connection.commit()

        return {
            "message": f"Occurrence successfully carried forward to {new_date} (Attempt {new_attempts}/3.)",
            "old_occurrence_id": occurrence_id,
            "new_occurrence_id": new_occurrence_id,
            "new_date": str(new_date),
            "carry_forward_attempt": new_attempts,
        }

    except OccurrenceRuleError:
        if connection:
            connection.rollback()
        raise
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def fetch_occurrence_history(occurrence_id: int, user_id: int) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT o.occurrence_id
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE o.occurrence_id = %s AND h.user_id = %s
            """,
            (occurrence_id, user_id),
        )
        if not cursor.fetchone():
            raise OccurrenceRuleError("Occurrence not found or unauthorized.", status_code=404)

        cursor.execute(
            """
            SELECT history_id, old_status, new_status, changed_by_type, reason, changed_at
            FROM occurrence_status_history
            WHERE occurrence_id = %s
            ORDER BY changed_at DESC, history_id DESC
            """,
            (occurrence_id,),
        )
        history = cursor.fetchall()

        for item in history:
            if item.get("changed_at"):
                item["changed_at"] = str(item["changed_at"])

        return {"occurrence_id": occurrence_id, "history": history}

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def fetch_score_summary(user_id: int, date_str: Optional[str] = None) -> Dict[str, Any]:
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        target_date = date_str or str(date.today())

        summary_query = """
            SELECT
                COUNT(o.occurrence_id) AS total_occurrences,
                SUM(o.base_score) AS total_potential_score,
                SUM(o.final_score) AS total_earned_score
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE h.user_id = %s AND o.occurrence_date = %s
        """
        cursor.execute(summary_query, (user_id, target_date))
        result = cursor.fetchone()

        total_occurrences = result["total_occurrences"] or 0
        potential_score = float(result["total_potential_score"] or 0.00)
        earned_score = float(result["total_earned_score"] or 0.00)

        efficiency_percentage = round((earned_score / potential_score * 100), 2) if potential_score > 0 else 0.00

        return {
            "date": target_date,
            "total_occurrences": total_occurrences,
            "total_potential_score": potential_score,
            "total_earned_percentage": efficiency_percentage,
        }

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def fetch_habit_analytics(user_id: int, days: int = 30) -> Dict[str, Any]:
    if days not in [7, 14, 30, 90]:
        days = 30

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        today = date.today()
        start_date = today - timedelta(days=days - 1)

        range_query = """
            SELECT
                o.occurrence_id,
                o.habit_id,
                o.habit_name_snapshot,
                o.category_snapshot,
                o.priority_snapshot,
                o.occurrence_date,
                o.status,
                o.base_score,
                o.final_score
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE h.user_id = %s
                AND o.occurrence_date BETWEEN %s AND %s
            ORDER BY o.occurrence_date ASC
        """
        cursor.execute(range_query, (user_id, start_date, today))
        range_rows = cursor.fetchall()

        total_scheduled = len(range_rows)
        total_done = sum(1 for r in range_rows if r["status"] == "Done")
        total_missed = sum(1 for r in range_rows if r["status"] == "Not Done")
        total_skipped = sum(1 for r in range_rows if r["status"] == "Skipped")
        total_earned_points = round(sum(float(r["final_score"] or 0.0) for r in range_rows), 2)
        total_potential_points = round(sum(float(r["base_score"] or 0.0) for r in range_rows), 2)

        completion_rate = round((total_done / total_scheduled * 100), 1) if total_scheduled > 0 else 0.0
        score_efficiency = round((total_earned_points / total_potential_points * 100), 1) if total_potential_points > 0 else 0.0

        daily_map = {}
        for i in range(days):
            d_str = str(start_date + timedelta(days=i))
            daily_map[d_str] = {"date": d_str, "total": 0, "done": 0, "missed": 0, "efficiency": 0.0}

        category_map = {}

        for r in range_rows:
            d_str = str(r["occurrence_date"])
            if d_str in daily_map:
                daily_map[d_str]["total"] += 1
                if r["status"] == "Done":
                    daily_map[d_str]["done"] += 1
                elif r["status"] == "Not Done":
                    daily_map[d_str]["missed"] += 1

            cat_name = r.get("category_snapshot") or "General"
            if cat_name not in category_map:
                category_map[cat_name] = {"category": cat_name, "total": 0, "done": 0, "rate": 0.0}
            category_map[cat_name]["total"] += 1
            if r["status"] == "Done":
                category_map[cat_name]["done"] += 1

        daily_trend = []
        for d_str in sorted(daily_map.keys()):
            entry = daily_map[d_str]
            entry["efficiency"] = round((entry["done"] / entry["total"] * 100), 1) if entry["total"] > 0 else 0.0
            daily_trend.append(entry)

        category_breakdown = []
        for cat_entry in category_map.values():
            cat_entry["rate"] = round((cat_entry["done"] / cat_entry["total"] * 100), 1) if cat_entry["total"] > 0 else 0.0
            category_breakdown.append(cat_entry)
        category_breakdown.sort(key=lambda x: (-x["rate"], -x["done"]))

        cursor.execute(
            """
            SELECT h.habit_id, h.habit_name, h.priority, c.category_name
            FROM habits h
            LEFT JOIN categories c ON h.category_id = c.category_id
            WHERE h.user_id = %s AND h.status = 'Active'
            ORDER BY h.habit_name ASC
            """,
            (user_id,),
        )
        active_habits = cursor.fetchall()

        cursor.execute(
            """
            SELECT o.habit_id, o.occurrence_date, o.status
            FROM habit_occurrences o
            JOIN habits h ON o.habit_id = h.habit_id
            WHERE h.user_id = %s
                AND o.occurrence_date <= %s
                AND o.status IN ('Done', 'Not Done', 'Pending', 'Incomplete')
            ORDER BY o.habit_id ASC, o.occurrence_date ASC
            """,
            (user_id, today),
        )
        all_occ_rows = cursor.fetchall()

        occ_by_habit = {}
        for row in all_occ_rows:
            hid = row["habit_id"]
            occ_date = row["occurrence_date"]
            if isinstance(occ_date, str):
                occ_date = datetime.strptime(occ_date, "%Y-%m-%d").date()

            if hid not in occ_by_habit:
                occ_by_habit[hid] = {}

            prev_status = occ_by_habit[hid].get(occ_date)
            if prev_status != "Done":
                occ_by_habit[hid][occ_date] = row["status"]

        habit_streaks = []
        best_overall_streak = 0

        for h in active_habits:
            hid = h["habit_id"]
            date_status_map = occ_by_habit.get(hid, {})
            sorted_dates = sorted(date_status_map.keys())

            longest_streak = 0
            running_streak = 0
            total_habit_done = 0
            total_habit_logged = len(sorted_dates)

            for d in sorted_dates:
                st = date_status_map[d]
                if st == "Done":
                    total_habit_done += 1
                    running_streak += 1
                    if running_streak > longest_streak:
                        longest_streak = running_streak
                else:
                    if d < today:
                        running_streak = 0

            current_streak = 0
            for d in reversed(sorted_dates):
                st = date_status_map[d]
                if d == today and st == "Pending":
                    continue
                if st == "Done":
                    current_streak += 1
                else:
                    break

            if current_streak > best_overall_streak:
                best_overall_streak = current_streak

            habit_rate = round((total_habit_done / total_habit_logged * 100), 1) if total_habit_logged > 0 else 0.0

            habit_streaks.append(
                {
                    "habit_id": hid,
                    "habit_name": h["habit_name"],
                    "category_name": h.get("category_name") or "General",
                    "priority": h.get("priority") or "Medium",
                    "current_streak": current_streak,
                    "longest_streak": longest_streak,
                    "total_done": total_habit_done,
                    "completion_rate": habit_rate,
                }
            )

        habit_streaks.sort(key=lambda x: (-x["current_streak"], -x["longest_streak"], x["habit_name"]))

        return {
            "days": days,
            "start_date": str(start_date),
            "end_date": str(today),
            "summary": {
                "total_scheduled": total_scheduled,
                "total_done": total_done,
                "total_missed": total_missed,
                "total_skipped": total_skipped,
                "completion_rate": completion_rate,
                "score_efficiency": score_efficiency,
                "total_earned_points": total_earned_points,
                "total_current_streak": best_overall_streak,
            },
            "daily_trend": daily_trend,
            "habit_streaks": habit_streaks,
            "category_breakdown": category_breakdown,
        }

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()