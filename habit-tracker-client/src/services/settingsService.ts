import axios from 'axios'; // Js/TypeScript library used to make HTTP requests to your backend API

import type { UserSettings, UserProfileUpdate } from '../types/settings';

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

export const fetchUserSettings = async (): Promise<UserSettings> => {
    const response = await axios.get(`${API_BASE_URL}/users/settings`, getAuthConfig());
    return response.data;
};

export const updateUserSettings = async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await axios.patch(`${API_BASE_URL}/users/settings`, settings, getAuthConfig());
    return response.data;
};

export const updateUserProfile = async (profile: UserProfileUpdate) => {
    const response = await axios.patch(`${API_BASE_URL}/users/profile`, profile, getAuthConfig());
    return response.data;
};