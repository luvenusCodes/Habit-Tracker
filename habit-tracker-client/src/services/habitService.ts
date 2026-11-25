import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token');
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const fetchHabits = async () => {
    const response = await axios.get(`${API_BASE_URL}/habits/`, getAuthHeaders());
    return response.data;
};

export const createHabit = async (habitData: {
    title: string;
    description?: string;
    category_id: number;
    frequency_type: string;
    target_days?: string[];
}) => {
    const response = await axios.post(`${API_BASE_URL}/habits/`, habitData, getAuthHeaders());
    return response.data;
};

export const fetchCategories = async () => {
    const response = await axios.get(`${API_BASE_URL}/categories/`, getAuthHeaders());
    return response.data;
};

export const createCategory = async (categoryData: {
    category_name: string;
    description?: string;
    color_code: string;
}) => {
    const response = await axios.post(`${API_BASE_URL}/categories/`, categoryData, getAuthHeaders());
    return response.data;
};