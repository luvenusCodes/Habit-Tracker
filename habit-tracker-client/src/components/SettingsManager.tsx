import React, { useEffect, useState } from 'react';
import { fetchUserSettings, updateUserSettings, updateUserProfile } from '../services/settingsService';
import type { UserSettings } from '../types/settings';
import { applyTheme, type ThemePreference } from '../utils/theme';

export const SettingsManager: React.FC = () => {
    const [settings, setSettings] = useState<UserSettings>({
        email_notifications: true,
        push_notifications: false,
        reminder_time: '08:00',
        timezone: 'UTC',
        theme: 'system',
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [message, setMessage] = useState<string | null>(null);

    // Profile form states
    const [username, setUsername] = useState<string>(() => localStorage.getItem('username') || '');
    const [email, setEmail] = useState<string>('');
    const [savingProfile, setSavingProfile] = useState<boolean>(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const data = await fetchUserSettings();
            setSettings(data);
            if (data.theme) {
                applyTheme(data.theme as ThemePreference);
            }
        } catch (err) {
            console.error('Failed to load user settings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (key: keyof UserSettings) => {
        if (typeof settings[key] === 'boolean') {
            setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSettings((prev) => ({ ...prev, [name]: value }));

        if (name === 'theme') {
            applyTheme(value as ThemePreference);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage(null);
            await updateUserSettings(settings);
            setMessage('Settings updated successfully!');
        } catch (err) {
            setMessage('Failed to save settings. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload: { username?: string; email?: string } = {};
        if (username.trim()) payload.username = username.trim();
        if (email.trim()) payload.email = email.trim();
        if (Object.keys(payload).length === 0) return;

        try {
            setSavingProfile(true);
            setProfileMessage(null);
            const updated = await updateUserProfile(payload);
            if (updated.username) {
                localStorage.setItem('username', updated.username);
                setUsername(updated.username);
            }
            setProfileMessage('Profile updated successfully!');
        } catch (err) {
            setProfileMessage('Failed to update profile. Username or email may already be in use.');
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-center">
                Loading settings...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Account Profile Card */}
            <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900 dark:text-white tracking-tight">Account Profile</h2>

                {profileMessage && (
                    <div className={`p-3 mb-4 text-sm rounded-xl ${profileMessage.includes('success') ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                        {profileMessage}
                    </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Update username"
                                className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter new email (optional)"
                                className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={savingProfile}
                            className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {savingProfile ? 'Updating...' : 'Update Profile'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Notification & App Settings Card */}
            <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <h2 className="text-xl sm:text-2xl font-bold mb-6 text-gray-900 dark:text-white tracking-tight">Notification & App Settings</h2>

                {message && (
                    <div className={`p-3 mb-4 text-sm rounded-xl ${message.includes('success') ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleSave} className="space-y-6">
                    {/* Notifications Section */}
                    <div className="border-b border-gray-100 dark:border-gray-700 pb-5 space-y-3">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">Notification Preferences</h3>

                        <div className="flex items-center justify-between gap-4 py-2">
                            <div className="min-w-0 flex-1">
                                <span className="font-medium text-sm sm:text-base text-gray-800 dark:text-gray-200 block">Email Notifications</span>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">Receive daily reminders and milestone updates via email.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.email_notifications}
                                onChange={() => handleToggle('email_notifications')}
                                className="h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 shrink-0 cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4 py-2">
                            <div className="min-w-0 flex-1">
                                <span className="font-medium text-sm sm:text-base text-gray-800 dark:text-gray-200 block">Push Notifications</span>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">Receive browser alerts for scheduled habits.</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.push_notifications}
                                onChange={() => handleToggle('push_notifications')}
                                className="h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 shrink-0 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Reminder Time & Schedule */}
                    <div className="border-b border-gray-100 dark:border-gray-700 pb-5">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Schedule Settings</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Reminder Time</label>
                                <input
                                    type="time"
                                    name="reminder_time"
                                    value={settings.reminder_time}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Theme Preference</label>
                                <select
                                    name="theme"
                                    value={settings.theme}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white"
                                >
                                    <option value="light">Light Mode</option>
                                    <option value="dark">Dark Mode</option>
                                    <option value="system">System Default</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};