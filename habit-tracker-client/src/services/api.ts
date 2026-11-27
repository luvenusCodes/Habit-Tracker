import type { Habit, Occurrence, Category, User, AuthResponse, UnattendedOverdueItem } from '../types';
import type { HabitAnalyticsResponse } from '../types';
import type { HabitSchedule, CreateSchedulePayload } from '../types';
import type { OccurrenceHistoryItem } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Helper function to get authorization Headers
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('access_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

export interface HabitCreatePayload {
    habit_name: string;
    description?: string;
    priority?: 'High' | 'Medium' | 'Low';
    category_id?: number;
}

export interface HabitUpdatePayload {
    habit_name?: string;
    description?: string;
    priority?: 'High' | 'Medium' | 'Low';
    status?: 'Active' | 'Paused' | 'Completed' | 'Archived' | 'Deleted';
    category_id?: number;
}

export interface CategoryCreatePayload {
    category_name: string;
    description?: string;
    color_code?: string;
}

export interface CategoryUpdatePayload {
    category_name?: string;
    description?: string;
    color_code?: string;
}

// Fetch all habits for the authenticated user
export const getHabits = async (): Promise<Habit[]> => {
    const response = await fetch(`${API_BASE_URL}/habits/`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to fetch habits');
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.habits ?? []);
};

export const createHabit = async (habitData: HabitCreatePayload): Promise<Habit> => {
    const response = await fetch(`${API_BASE_URL}/habits/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(habitData),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to create habit');
    }

    const data = await response.json();
    return data.habit ?? data;
};

export const updateHabit = async (habitId: number, habitData: HabitUpdatePayload): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/habits/${habitId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(habitData),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update habit');
    }
};

export const deleteHabit = async (habitId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/habits/${habitId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete habit');
    }
};

// Categories API
export const getCategories = async (): Promise<Category[]> => {
    const response = await fetch(`${API_BASE_URL}/categories/`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to fetch categories');
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.categories ?? []);
};

export const createCategory = async (categoryData: CategoryCreatePayload): Promise<Category> => {
    const response = await fetch(`${API_BASE_URL}/categories/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(categoryData),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to create category');
    }

    const data = await response.json();
    return data.category ?? data;
};

export const updateCategory = async (
    categoryId: number,
    categoryData: CategoryUpdatePayload
): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/categories/${categoryId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(categoryData),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update category');
    }
};

export const deleteCategory = async (categoryId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/categories/${categoryId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete category');
    }
};

export interface OccurrenceResponse {
    date: string;
    occurrences: Occurrence[];
    unattended_overdue?: {
        count: number;
        items: UnattendedOverdueItem[];
    };
}

export interface ScoreSummaryResponse {
    date: string;
    total_occurrences: number;
    total_potential_score: number;
    total_earned_percentage: number;
}

// Occurrence API
export const getOccurrencesByDate = async (dateStr?: string): Promise<OccurrenceResponse> => {
    const query = dateStr ? `?date_str=${dateStr}` : '';
    const response = await fetch(`${API_BASE_URL}/occurrences/${query}`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to fetch occurrences');
    }

    return response.json();
};

export const generateOccurrencesForDate = async (targetDate?: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/occurrences/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ target_date: targetDate || null }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate occurrences');
    }

    return response.json();
};

export const updateOccurrenceStatus = async (
    occurrenceId: number,
    status: 'Done' | 'Not Done' | 'Skipped' | 'Cancelled',
    reason?: string
): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/occurrences/${occurrenceId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, reason: reason || null }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update occurrence status');
    }

    return response.json();
};

export const getScoreSummary = async (dateStr?: string): Promise<ScoreSummaryResponse> => {
    const query = dateStr ? `?date_str=${dateStr}` : '';
    const response = await fetch(`${API_BASE_URL}/occurrences/score-summary${query}`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to fetch score summary');
    }

    return response.json();
};

// Auth API
export interface RegisterPayload {
    username: string;
    email: string;
    password: string;
}

export interface LoginPayload {
    username: string;
    password: string;
}

export const registerUser = async (data: RegisterPayload): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Registration failed');
    }

    return response.json();
};

export const LoginUserJson = async (
    data: LoginPayload
): Promise<AuthResponse & { message: string; user_id: number; username: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Invalid username or password');
    }

    return response.json();
};

export interface SendOtpPayload {
    email: string;
}

export interface VerifyOtpPayload {
    email: string;
    otp_code: string;
}

export interface ResetPasswordPayload {
    email: string;
    otp_code: string;
    new_password: string;
}

export const sendVerificationOtp = async (data: SendOtpPayload): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to send verification code');
    }

    return response.json();
};

export const verifyEmailOtp = async (data: VerifyOtpPayload): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Invalid or expired verification code');
    }

    return response.json();
};

export const forgotPassword = async (data: SendOtpPayload): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to send password reset code');
    }

    return response.json();
};

export const resetPassword = async (data: ResetPasswordPayload): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to reset password');
    }

    return response.json();
};

export const getCurrentUser = async (): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Failed to fetch current user');
    }

    return response.json();
};

export const getHabitAnalytics = async (days: number = 30): Promise<HabitAnalyticsResponse> => {
    const response = await fetch(`${API_BASE_URL}/occurrences/analytics?days=${days}`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to fetch habit analytics');
    }

    return response.json();
};

export class ScheduleCollisionError extends Error {
    conflicts: { habit_name: string; window: string }[];
    dayOfWeek: string;

    constructor(
        message: string,
        dayOfWeek: string,
        conflicts: { habit_name: string; window: string }[]
    ) {
        super(message);
        this.name = 'ScheduleCollisionError';
        this.dayOfWeek = dayOfWeek;
        this.conflicts = conflicts;
    }
}

export const getHabitSchedules = async (habitId: number): Promise<HabitSchedule[]> => {
    const response = await fetch(`${API_BASE_URL}/schedules/habit/${habitId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to fetch habit schedules');
    }
    const data = await response.json();
    return data.schedules || [];
};

export const createHabitSchedule = async (
    payload: CreateSchedulePayload & { allow_overlap?: boolean }
) => {
    const response = await fetch(`${API_BASE_URL}/schedules/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 409 && errData?.detail?.code === 'SCHEDULE_COLLISION') {
            throw new ScheduleCollisionError(
                errData.detail.message,
                errData.detail.day_of_week,
                errData.detail.conflicts || []
            );
        }
        const detailMsg =
            typeof errData.detail === 'string'
                ? errData.detail
                : 'Failed to create habit schedule';
        throw new Error(detailMsg);
    }
    return response.json();
};

export const updateHabitScheduleStatus = async (
    scheduleId: number,
    status: 'Active' | 'Inactive'
) => {
    const response = await fetch(`${API_BASE_URL}/schedules/${scheduleId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update schedule status');
    }
    return response.json();
};

export const deleteHabitSchedule = async (scheduleId: number) => {
    const response = await fetch(`${API_BASE_URL}/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete schedule');
    }
    return response.json();
};

export interface CarryForwardPayload {
    target_date?: string;
    start_time?: string;
    end_time?: string | null;
    duration_minutes?: number | null;
}

export const carryForwardOccurrence = async (
    occurrenceId: number,
    payload: CarryForwardPayload = {}
) => {
    const response = await fetch(`${API_BASE_URL}/occurrences/${occurrenceId}/carry-forward`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to carry forward occurrence');
    }
    return response.json();
};

export const getOccurrenceHistory = async (
    occurrenceId: number
): Promise<OccurrenceHistoryItem[]> => {
    const response = await fetch(`${API_BASE_URL}/occurrences/${occurrenceId}/history`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to load occurrence history');
    }
    const data = await response.json();
    return data.history || [];
};