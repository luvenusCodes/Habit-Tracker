from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from routers.auth import get_current_user
from storage.goals_storage import (
    GoalRuleError,
    change_goal_status,
    create_goal,
    # [PHASE 4 IMPORTS]
    create_goal_criterion,
    deactivate_goal_criterion,
    # [PHASE 7 IMPORTS]
    get_all_goal_criteria_history,
    get_criterion_modification_history,
    get_goal_by_id,
    get_goal_criterion,
    # Phase 6 IMPORT
    get_goal_progress_summary,
    get_goal_status_history,
    # [PHASE 5 IMPORTS]
    link_habit_to_criterion,
    link_habit_to_goal,
    list_criterion_habits,
    list_goal_criteria,
    list_goal_habits,
    list_user_goals,
    # PHASE 8 IMPORTS
    run_user_goal_maintenance,
    unlink_habit_from_criterion,
    unlink_habit_from_goal,
    update_goal_criterion,
    update_goal_details,
)

router = APIRouter(prefix="/goals", tags=["Goals"])


# ==============================================================================
# [PHASE 3: GOAL MANAGEMENT REQUEST SCHEMAS]
# ==============================================================================
class GoalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal_name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None


class GoalUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal_name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None


class GoalStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(..., min_length=1, max_length=20)
    reason: Optional[str] = None


# ==============================================================================
# [PHASE 4: GOAL CRITERIA REQUEST SCHEMAS]
# ==============================================================================
class CriterionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criterion_name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    measurement_type: str = Field(..., min_length=1, max_length=20)
    target_value: float = Field(..., gt=0)
    measurement_unit: str = Field(..., min_length=1, max_length=30)
    is_mandatory: bool = True


class CriterionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criterion_name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    measurement_type: Optional[str] = Field(None, min_length=1, max_length=20)
    target_value: Optional[float] = Field(None, gt=0)
    measurement_unit: Optional[str] = Field(None, min_length=1, max_length=30)
    is_mandatory: Optional[bool] = None
    status: Optional[str] = Field(None, min_length=1, max_length=20)
    reason: Optional[str] = None


class CriterionDeactivateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Optional[str] = None


# ==============================================================================
# [PHASE 5: LINK HABIT REQUEST SCHEMA]
# ==============================================================================
class HabitLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    habit_id: int = Field(..., gt=0)

# PHASE 8: SCHEDULED / ON-DEMAND GOAL MAINTENANCE ENDPOINT
@router.post("/maintenance/run")
def run_goal_maintenance_endpoint(
    current_user: dict = Depends(get_current_user),
):
    try:
        result = run_user_goal_maintenance(user_id=current_user["user_id"])
        return {
            "message": "Goal lifecycle maintenance completed successfully.",
            "result": result,
        }
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")

# ==============================================================================
# [PHASE 3: GOAL MANAGEMENT ENDPOINTS]
# ==============================================================================
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_goal_endpoint(
    payload: GoalCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        goal = create_goal(
            user_id=current_user["user_id"],
            goal_name=payload.goal_name,
            description=payload.description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            notes=payload.notes,
        )
        return {"message": "Goal created successfully.", "goal": goal}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.get("/")
def list_goals_endpoint(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user),
):
    try:
        goals = list_user_goals(user_id=current_user["user_id"], status_filter=status_filter)
        return {"count": len(goals), "goals": goals}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.get("/{goal_id}")
def get_goal_endpoint(
    goal_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        goal = get_goal_by_id(goal_id=goal_id, user_id=current_user["user_id"])
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found or unauthorized.")
        return {"goal": goal}
    except HTTPException:
        raise
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.patch("/{goal_id}")
def update_goal_endpoint(
    goal_id: int,
    payload: GoalUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    provided_fields = payload.model_fields_set
    if not provided_fields:
        raise HTTPException(status_code=400, detail="No valid fields provided for update.")

    try:
        goal = update_goal_details(
            goal_id=goal_id,
            user_id=current_user["user_id"],
            goal_name=payload.goal_name,
            description=payload.description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            notes=payload.notes,
            provided_fields=provided_fields,
        )
        return {"message": "Goal updated successfully.", "goal": goal}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.patch("/{goal_id}/status")
def update_goal_status_endpoint(
    goal_id: int,
    payload: GoalStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        goal = change_goal_status(
            goal_id=goal_id,
            user_id=current_user["user_id"],
            new_status=payload.status,
            reason=payload.reason,
        )
        return {"message": f"Goal status updated to '{payload.status}'.", "goal": goal}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


# ==============================================================================
# [PHASE 4: GOAL CRITERIA ENDPOINTS]
# ==============================================================================
@router.post("/{goal_id}/criteria", status_code=status.HTTP_201_CREATED)
def create_criterion_endpoint(
    goal_id: int,
    payload: CriterionCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        criterion = create_goal_criterion(
            goal_id=goal_id,
            user_id=current_user["user_id"],
            criterion_name=payload.criterion_name,
            description=payload.description,
            measurement_type=payload.measurement_type,
            target_value=payload.target_value,
            measurement_unit=payload.measurement_unit,
            is_mandatory=payload.is_mandatory,
        )
        return {"message": "Goal criterion created successfully.", "criterion": criterion}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.get("/{goal_id}/criteria")
def list_criteria_endpoint(
    goal_id: int,
    include_inactive: bool = Query(True),
    current_user: dict = Depends(get_current_user),
):
    try:
        criteria = list_goal_criteria(
            goal_id=goal_id,
            user_id=current_user["user_id"],
            include_inactive=include_inactive,
        )
        return {"goal_id": goal_id, "count": len(criteria), "criteria": criteria}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.get("/{goal_id}/criteria/{criterion_id}")
def get_criterion_endpoint(
    goal_id: int,
    criterion_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        criterion = get_goal_criterion(
            goal_id=goal_id,
            criterion_id=criterion_id,
            user_id=current_user["user_id"],
        )
        if not criterion:
            raise HTTPException(status_code=404, detail="Criterion not found or unauthorized.")
        return {"criterion": criterion}
    except HTTPException:
        raise
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.patch("/{goal_id}/criteria/{criterion_id}")
def update_criterion_endpoint(
    goal_id: int,
    criterion_id: int,
    payload: CriterionUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    provided = payload.model_fields_set - {"reason"}
    if not provided:
        raise HTTPException(status_code=400, detail="No valid criterion fields provided for update.")

    updates = {field: getattr(payload, field) for field in provided}

    try:
        criterion = update_goal_criterion(
            goal_id=goal_id,
            criterion_id=criterion_id,
            user_id=current_user["user_id"],
            updates=updates,
            reason=payload.reason,
        )
        return {"message": "Goal criterion updated successfully.", "criterion": criterion}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.delete("/{goal_id}/criteria/{criterion_id}")
def deactivate_criterion_endpoint(
    goal_id: int,
    criterion_id: int,
    payload: Optional[CriterionDeactivateRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        criterion = deactivate_goal_criterion(
            goal_id=goal_id,
            criterion_id=criterion_id,
            user_id=current_user["user_id"],
            reason=payload.reason if payload else None,
        )
        return {"message": "Goal criterion deactivated successfully.", "criterion": criterion}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


# ==============================================================================
# [PHASE 5: GOAL-HABIT RELATIONSHIP ENDPOINTS (habit_goals)]
# ==============================================================================
@router.post("/{goal_id}/habits", status_code=status.HTTP_201_CREATED)
def link_habit_to_goal_endpoint(
    goal_id: int,
    payload: HabitLinkRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        link = link_habit_to_goal(
            goal_id=goal_id,
            habit_id=payload.habit_id,
            user_id=current_user["user_id"],
            actor_type="User",
        )
        return {"message": "Habit linked to goal successfully.", "relationship": link}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.get("/{goal_id}/habits")
def list_goal_habits_endpoint(
    goal_id: int,
    include_history: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    try:
        links = list_goal_habits(
            goal_id=goal_id,
            user_id=current_user["user_id"],
            include_history=include_history,
        )
        return {"goal_id": goal_id, "count": len(links), "relationships": links}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.delete("/{goal_id}/habits/{habit_id}")
def unlink_habit_from_goal_endpoint(
    goal_id: int,
    habit_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        link = unlink_habit_from_goal(
            goal_id=goal_id,
            habit_id=habit_id,
            user_id=current_user["user_id"],
            actor_type="User",
        )
        return {"message": "Habit unlinked from goal successfully.", "relationship": link}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


# ==============================================================================
# [PHASE 5: CRITERION-HABIT RELATIONSHIP ENDPOINTS (goal_criteria_habits)]
# ==============================================================================
@router.post("/{goal_id}/criteria/{criterion_id}/habits", status_code=status.HTTP_201_CREATED)
def link_habit_to_criterion_endpoint(
    goal_id: int,
    criterion_id: int,
    payload: HabitLinkRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        link = link_habit_to_criterion(
            goal_id=goal_id,
            criterion_id=criterion_id,
            habit_id=payload.habit_id,
            user_id=current_user["user_id"],
            actor_type="User",
        )
        return {"message": "Habit linked to criterion successfully.", "relationship": link}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.get("/{goal_id}/criteria/{criterion_id}/habits")
def list_criterion_habits_endpoint(
    goal_id: int,
    criterion_id: int,
    include_history: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    try:
        links = list_criterion_habits(
            goal_id=goal_id,
            criterion_id=criterion_id,
            user_id=current_user["user_id"],
            include_history=include_history,
        )
        return {
            "goal_id": goal_id,
            "criterion_id": criterion_id,
            "count": len(links),
            "relationships": links,
        }
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")


@router.delete("/{goal_id}/criteria/{criterion_id}/habits/{habit_id}")
def unlink_habit_from_criterion_endpoint(
    goal_id: int,
    criterion_id: int,
    habit_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        link = unlink_habit_from_criterion(
            goal_id=goal_id,
            criterion_id=criterion_id,
            habit_id=habit_id,
            user_id=current_user["user_id"],
            actor_type="User",
        )
        return {"message": "Habit unlinked from criterion successfully.", "relationship": link}
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")

# // [PHASE 6: GOAL PROGRESS & CONTRIBUTION RECORDS ENDPOINT]
@router.get("/{goal_id}/progress")
def get_goal_progress_endpoint(
    goal_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        summary = get_goal_progress_summary(
            goal_id=goal_id,
            user_id=current_user["user_id"],
        )
        return summary
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")

# [PHASE 7: GOAL STATUS HISTORY & GOAL CRITERIA HISTORY AUDIT ENDPOINTS]
@router.get("/{goal_id}/history")
def get_goal_status_history_endpoint(
    goal_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        history = get_goal_status_history(
            goal_id=goal_id,
            user_id=current_user["user_id"],
        )
        return {
            "goal_id": goal_id,
            "count": len(history),
            "history": history,
        }
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")

@router.get("/{goal_id}/criteria-history")
def get_all_goal_criteria_history_endpoint(
    goal_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        user_id = current_user["user_id"]
        history = get_all_goal_criteria_history(goal_id=goal_id, user_id=user_id)
        return {
            "goal_id": goal_id,
            "count": len(history),
            "history": history,
        }
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")

@router.get("/{goal_id}/criteria/{criterion_id}/history")
def get_criterion_history_endpoint(
    goal_id: int,
    criterion_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        history = get_criterion_modification_history(
            goal_id=goal_id,
            criterion_id=criterion_id,
            user_id=current_user["user_id"],
        )
        return {
            "goal_id": goal_id,
            "criterion_id": criterion_id,
            "count": len(history),
            "history": history,
        }
    except GoalRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal server error: {err}")