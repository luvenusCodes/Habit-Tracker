export interface Habit {
    habit_id: number;
    user_id: number;
    category_id?: number | null;
    habit_name: string;
    description?: string;
    priority: 'Low' | 'Medium' | 'High';
    status: 'Active' | 'Paused' | 'Completed' | 'Archived' | 'Deleted';
    measurement_type?: 'Boolean' | 'Numeric' | string;
    target_value?: number;
    target_unit?: string;
    start_date?: string;
    created_at?: string;
}

// user & authentication types
export interface User {
    user_id: number;
    email: string;
    creaeted_at?: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
}

// category types
export interface Category {
    category_id: number;
    user_id: number;
    category_name: string;
    description?: string;
    color_code?: string;
    created_at?: string;
}

// Occurrence &Tracking types
export interface Occurrence {
    occurrence_id: number;
    habit_id: number;
    schedule_id?: number;
    habit_name_snapshot: string;
    habit_name?: string;
    priority_snapshot?: 'Low' | 'Medium' | 'High';
    priority?: 'Low' | 'Medium' | 'High';
    category_snapshot: string;
    category_name?: string;
    occurrence_date: string;
    start_time?: string;
    end_time?: string;
    status: 'Pending' | 'Done' | 'Not Done' | 'Carried Over' | 'Incomplete' | 'Skipped' | 'Cancelled';
    base_score: number;
    final_score?: number;
    carry_forward_attempt?: number;
    created_at?: string;
    duration_minutes?: number | null;
    is_locked?: boolean;
    status_recorded_at?: string | null;
}

export interface UnattendedOverdueItem {
    occurrence_id: number;
    habit_id: number;
    habit_name_snapshot: string;
    category_snapshot: string;
    priority_snapshot: 'Low' | 'Medium' | 'High';
    occurrence_date: string;
    start_time?: string | null;
    end_time?: string | null;
    duration_minutes?: number | null;
    scheduled_end_at: string;
    carry_forward_attempt: number;
    hours_overdue: number;
}

export interface DailyTrendPoint {
    date: string;
    total: number;
    done: number;
    missed: number;
    efficiency: number;
}

export interface HabitStreakItem {
    habit_id: number;
    habit_name: string;
    category_name: string;
    priority: 'Low' | 'Medium' | 'High';
    current_streak: number;
    longest_streak: number;
    total_done: number;
    completion_rate: number;
}

export interface CategoryBreakdownItem {
    category: string;
    total: number;
    done: number;
    rate: number;
}

export interface HabitAnalyticsResponse {
    days: number;
    start_date: string;
    end_date: string;
    summary: {
        total_scheduled: number;
        total_done: number;
        total_missed: number;
        total_skipped: number;
        completion_rate: number;
        score_efficiency: number;
        total_earned_points: number;
        best_current_streak: number;
    };
    daily_trend: DailyTrendPoint[];
    habit_streaks: HabitStreakItem[];
    category_breakdown: CategoryBreakdownItem[];
}

export type DayOfWeek =
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday'
    | 'Sunday';

export interface HabitSchedule {
    schedule_id: number;
    habit_id?: number;
    day_of_week: DayOfWeek;
    start_time: string;
    end_time?: string | null;
    duration_minutes?: number | null;
    status: 'Active' | 'Inactive';
    created_at?: string;
}

export interface CreateSchedulePayload {
    habit_id: number;
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
    status?: 'Active' | 'Inactive';
}

export interface OccurrenceHistoryItem {
    history_id: number;
    old_status: string | null;
    new_status: string;
    changed_by_type: string;
    reason?: string | null;
    changed_at: string;
}