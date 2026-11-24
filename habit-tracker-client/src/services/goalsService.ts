import axios from 'axios';
import type {
    Goal,
    GoalStatus,
    GoalCreatePayload,
    GoalUpdatePayload,
    GoalCriterion,
    CriterionCreatePayload,
    CriterionUpdatePayload,
    HabitGoalLink,
    CriterionHabitLink,
    GoalProgressSummary,
    GoalStatusHistoryItem,
    CriterionHistoryItem,
} from '../types/goals';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const getAuthConfig = () => {
    const token = localStorage.getItem('access_token');
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
};

export const extractApiError = (err: unknown, fallback = 'An unexpected error occurred.'): string => {
    if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail) && detail.length > 0) {
            return detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
        }
    }
    return fallback;
};

// GOALS CRUD & LIFECYCLE
export const fetchGoals = async (statusFilter?: GoalStatus): Promise<Goal[]> => {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const response = await axios.get(`${API_BASE_URL}/goals/${query}`, getAuthConfig());
    return response.data.goals ?? response.data;
};

export const fetchGoalById = async (goalId: number): Promise<Goal> => {
    const response = await axios.get(`${API_BASE_URL}/goals/${goalId}`, getAuthConfig());
    return response.data.goal ?? response.data;
};

export const createGoal = async (payload: GoalCreatePayload): Promise<Goal> => {
    const response = await axios.post(`${API_BASE_URL}/goals/`, payload, getAuthConfig());
    return response.data.goal ?? response.data;
};

export const updateGoal = async (goalId: number, payload: GoalUpdatePayload): Promise<Goal> => {
    const response = await axios.patch(`${API_BASE_URL}/goals/${goalId}`, payload, getAuthConfig());
    return response.data.goal ?? response.data;
};

export const changeGoalStatus = async (
    goalId: number,
    status: GoalStatus,
    reason?: string
): Promise<Goal> => {
    const response = await axios.patch(
        `${API_BASE_URL}/goals/${goalId}/status`,
        { status, reason: reason || null },
        getAuthConfig()
    );
    return response.data.goal ?? response.data;
};

export const runGoalMaintenance = async () => {
    const response = await axios.post(`${API_BASE_URL}/goals/maintenance/run`, {}, getAuthConfig());
    return response.data.result ?? response.data;
};

// CRITERIA CRUD
export const fetchGoalCriteria = async (
    goalId: number,
    includeInactive = true
): Promise<GoalCriterion[]> => {
    const response = await axios.get(
        `${API_BASE_URL}/goals/${goalId}/criteria?include_inactive=${includeInactive}`,
        getAuthConfig()
    );
    return response.data.criteria ?? response.data;
};

export const createGoalCriterion = async (
    goalId: number,
    payload: CriterionCreatePayload
): Promise<GoalCriterion> => {
    const response = await axios.post(
        `${API_BASE_URL}/goals/${goalId}/criteria`,
        payload,
        getAuthConfig()
    );
    return response.data.criterion ?? response.data;
};

export const updateGoalCriterion = async (
    goalId: number,
    criterionId: number,
    payload: CriterionUpdatePayload
): Promise<GoalCriterion> => {
    const response = await axios.patch(
        `${API_BASE_URL}/goals/${goalId}/criteria/${criterionId}`,
        payload,
        getAuthConfig()
    );
    return response.data.criterion ?? response.data;
};

export const deactivateGoalCriterion = async (
    goalId: number,
    criterionId: number,
    reason?: string
): Promise<GoalCriterion> => {
    const response = await axios.delete(`${API_BASE_URL}/goals/${goalId}/criteria/${criterionId}`, {
        ...getAuthConfig(),
        data: { reason: reason || 'Deactivated by user' },
    });
    return response.data.criterion ?? response.data;
};

// HABIT RELATIONSHIPS
export const fetchGoalHabits = async (
    goalId: number,
    includeHistory = false
): Promise<HabitGoalLink[]> => {
    const response = await axios.get(
        `${API_BASE_URL}/goals/${goalId}/habits?include_history=${includeHistory}`,
        getAuthConfig()
    );
    return response.data.relationships ?? response.data;
};

export const linkHabitToGoal = async (goalId: number, habitId: number): Promise<HabitGoalLink> => {
    const response = await axios.post(
        `${API_BASE_URL}/goals/${goalId}/habits`,
        { habit_id: habitId },
        getAuthConfig()
    );
    return response.data.relationship ?? response.data;
};

export const unlinkHabitFromGoal = async (goalId: number, habitId: number): Promise<HabitGoalLink> => {
    const response = await axios.delete(
        `${API_BASE_URL}/goals/${goalId}/habits/${habitId}`,
        getAuthConfig()
    );
    return response.data.relationship ?? response.data;
};

export const fetchCriterionHabits = async (
    goalId: number,
    criterionId: number,
    includeHistory = false
): Promise<CriterionHabitLink[]> => {
    const response = await axios.get(
        `${API_BASE_URL}/goals/${goalId}/criteria/${criterionId}/habits?include_history=${includeHistory}`,
        getAuthConfig()
    );
    return response.data.relationships ?? response.data;
};

export const linkHabitToCriterion = async (
    goalId: number,
    criterionId: number,
    habitId: number
): Promise<CriterionHabitLink> => {
    const response = await axios.post(
        `${API_BASE_URL}/goals/${goalId}/criteria/${criterionId}/habits`,
        { habit_id: habitId },
        getAuthConfig()
    );
    return response.data.relationship ?? response.data;
};

export const unlinkHabitFromCriterion = async (
    goalId: number,
    criterionId: number,
    habitId: number
): Promise<CriterionHabitLink> => {
    const response = await axios.delete(
        `${API_BASE_URL}/goals/${goalId}/criteria/${criterionId}/habits/${habitId}`,
        getAuthConfig()
    );
    return response.data.relationship ?? response.data;
};

// PROGRESS & AUDIT HISTORY
export const fetchGoalProgressSummary = async (goalId: number): Promise<GoalProgressSummary> => {
    const response = await axios.get(`${API_BASE_URL}/goals/${goalId}/progress`, getAuthConfig());
    return response.data;
};

export const fetchGoalStatusHistory = async (goalId: number): Promise<GoalStatusHistoryItem[]> => {
    const response = await axios.get(`${API_BASE_URL}/goals/${goalId}/history`, getAuthConfig());
    return Array.isArray(response.data) ? response.data : response.data.history ?? [];
};

export const fetchGoalCriteriaHistory = async (goalId: number): Promise<CriterionHistoryItem[]> => {
    const response = await axios.get(
        `${API_BASE_URL}/goals/${goalId}/criteria-history`,
        getAuthConfig()
    );
    return Array.isArray(response.data) ? response.data : response.data.history ?? [];
};