export type GoalStatus =
    | 'Planned'
    | 'Active'
    | 'Paused'
    | 'Completed'
    | 'Abandoned'
    | 'Archived'
    | 'Expired';

export type MeasurementType = 'Count' | 'Duration' | 'Quantity';
export type CriterionStatus = 'Active' | 'Completed' | 'Inactive';
export type ActorType = 'User' | 'System';

export interface Goal {
    goal_id: number;
    user_id: number;
    goal_name: string;
    description: string;
    start_date: string | null;
    end_date: string | null;
    status: GoalStatus;
    completed_at: string | null;
    notes: string | null;
    progress_percentage: number;
    created_at: string | null;
    updated_at: string | null;
}

export interface GoalCreatePayload {
    goal_name?: string;
    description?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
}

export interface GoalUpdatePayload {
    goal_name?: string;
    description?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
}

export interface GoalCriterion {
    criterion_id: number;
    goal_id: number;
    user_id: number;
    criterion_name: string;
    description: string | null;
    measurement_type: MeasurementType;
    target_value: number;
    measurement_unit: string;
    is_mandatory: boolean;
    status: CriterionStatus;
    earned_amount: number;
    completion_percentage: number;
    created_at: string | null;
    updated_at: string | null;
}

export interface CriterionCreatePayload {
    criterion_name: string;
    description?: string | null;
    measurement_type: MeasurementType;
    target_value: number;
    measurement_unit: string;
    is_mandatory: boolean;
}

export interface CriterionUpdatePayload {
    criterion_name?: string;
    description?: string | null;
    measurement_type?: MeasurementType;
    target_value?: number;
    measurement_unit?: string;
    is_mandatory?: boolean;
    status?: 'Active' | 'Inactive';
    reason?: string;
}

export interface HabitGoalLink {
    habit_goal_id: number;
    habit_id: number;
    habit_name: string | null;
    goal_id: number;
    user_id: number;
    is_active: boolean;
    linked_at: string | null;
    unlinked_at: string | null;
    linked_by: number | null;
    linked_by_type: ActorType;
    unlinked_by: number | null;
    unlinked_by_type: ActorType | null;
}

export interface CriterionHabitLink {
    goal_criterion_habits_id: number;
    criterion_id: number;
    habit_id: number;
    habit_name: string | null;
    user_id: number;
    is_active: boolean;
    linked_at: string | null;
    unlinked_at: string | null;
    linked_by: number | null;
    linked_by_type: ActorType;
    unlinked_by: number | null;
    unlinked_by_type: ActorType | null;
}

export interface GoalProgressRecord {
    progress_id: number;
    goal_id: number;
    criterion_id: number;
    criterion_name: string;
    user_id: number;
    habit_occurrence_id: number;
    contribution_amount: number;
    recorded_at: string | null;
}

export interface GoalProgressSummary {
    goal: Goal;
    criteria_progress: GoalCriterion[];
    records_count: number;
    progress_records: GoalProgressRecord[];
}

export interface GoalStatusHistoryItem {
    history_id: number;
    goal_id: number;
    user_id: number;
    old_status: GoalStatus | null;
    new_status: GoalStatus;
    changed_by: number | null;
    changed_by_type: ActorType;
    reason: string | null;
    changed_at: string | null;
}

export interface CriterionHistoryItem {
    history_id: number;
    criterion_id: number;
    criterion_name: string;
    user_id: number;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: number | null;
    changed_by_type: ActorType;
    reason: string | null;
    changed_at: string | null;
}