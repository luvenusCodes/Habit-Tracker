import React, { useEffect, useRef, useState } from 'react';
import {
    fetchUserSettings,
    updateUserSettings,
    updateUserProfile,
} from '../services/settingsService';
import type { UserSettings } from '../types/settings';
import { applyTheme, type ThemePreference } from '../utils/theme';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface LocalPrefs {
    language: string;
    clockFormat: '12h' | '24h';
    dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
    defaultDuration: number;
    weekStart: 'Monday' | 'Sunday';
}

const DEFAULT_LOCAL_PREFS: LocalPrefs = {
    language: 'en',
    clockFormat: '24h',
    dateFormat: 'YYYY-MM-DD',
    defaultDuration: 30,
    weekStart: 'Monday',
};

export interface SettingsManagerProps {
    avatarUrl?: string | null;
    onAvatarChange?: (url: string | null) => void;
    onUsernameChange?: (newUsername: string) => void;
    onLogout?: () => void;
}

const resizeImageToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Invalid image file.'));
            img.onload = () => {
                const size = 256;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(reader.result as string);
                    return;
                }
                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;
                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
                resolve(canvas.toDataURL('image/webp', 0.85));
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });

export const SettingsManager: React.FC<SettingsManagerProps> = ({
    avatarUrl: externalAvatarUrl,
    onAvatarChange,
    onUsernameChange,
    onLogout,
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [settings, setSettings] = useState<UserSettings>({
        email_notifications: true,
        push_notifications: false,
        reminder_time: '08:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        theme: 'system',
    });

    const [localPrefs, setLocalPrefs] = useState<LocalPrefs>(() => {
        try {
            const saved = localStorage.getItem('habit_tracker_local_prefs');
            return saved ? { ...DEFAULT_LOCAL_PREFS, ...JSON.parse(saved) } : DEFAULT_LOCAL_PREFS;
        } catch {
            return DEFAULT_LOCAL_PREFS;
        }
    });

    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Profile & Avatar states
    const [username, setUsername] = useState<string>(() => localStorage.getItem('username') || '');
    const [email, setEmail] = useState<string>('');
    const [savingProfile, setSavingProfile] = useState<boolean>(false);
    const [localAvatar, setLocalAvatar] = useState<string | null>(() => {
        const userKey = localStorage.getItem('username') || 'default';
        return localStorage.getItem(`habit_avatar_${userKey}`);
    });

    // Collapsible drawers
    const [openDrawer, setOpenDrawer] = useState<
        'profile' | 'general' | 'language' | 'data' | null
    >(null);

    const activeAvatar = externalAvatarUrl !== undefined ? externalAvatarUrl : localAvatar;

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const data = await fetchUserSettings();
            setSettings((prev) => ({ ...prev, ...data }));
            if (data.theme) {
                applyTheme(data.theme as ThemePreference);
            }
        } catch (err) {
            console.error('Failed to load user settings', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleDrawer = (drawer: 'profile' | 'general' | 'language' | 'data') => {
        setOpenDrawer((prev) => (prev === drawer ? null : drawer));
    };

    const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            setBanner({
                type: 'error',
                text: 'Unsupported format. Please upload a JPEG, PNG, or WebP image.',
            });
            return;
        }

        if (file.size > MAX_AVATAR_BYTES) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
            setBanner({
                type: 'error',
                text: `Photo is ${sizeMb} MB — maximum allowed size is 2 MB.`,
            });
            return;
        }

        try {
            const optimizedDataUrl = await resizeImageToDataUrl(file);
            const userKey = (username || localStorage.getItem('username') || 'default').trim();
            localStorage.setItem(`habit_avatar_${userKey}`, optimizedDataUrl);
            setLocalAvatar(optimizedDataUrl);
            onAvatarChange?.(optimizedDataUrl);
            setBanner({ type: 'success', text: 'Profile picture updated.' });
        } catch (err) {
            setBanner({ type: 'error', text: (err as Error).message });
        }
    };

    const handleRemoveAvatar = () => {
        const userKey = (username || localStorage.getItem('username') || 'default').trim();
        localStorage.removeItem(`habit_avatar_${userKey}`);
        setLocalAvatar(null);
        onAvatarChange?.(null);
        setBanner({ type: 'success', text: 'Profile picture removed.' });
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload: { username?: string; email?: string } = {};
        if (username.trim()) payload.username = username.trim();
        if (email.trim()) payload.email = email.trim();
        if (Object.keys(payload).length === 0) return;

        try {
            setSavingProfile(true);
            setBanner(null);
            const oldKey = localStorage.getItem('username') || 'default';
            const updated = await updateUserProfile(payload);
            if (updated.username) {
                localStorage.setItem('username', updated.username);
                setUsername(updated.username);
                onUsernameChange?.(updated.username);

                // Migrate stored avatar if username changed
                const existingPhoto = localStorage.getItem(`habit_avatar_${oldKey}`);
                if (existingPhoto && oldKey !== updated.username) {
                    localStorage.setItem(`habit_avatar_${updated.username}`, existingPhoto);
                    localStorage.removeItem(`habit_avatar_${oldKey}`);
                }
            }
            setEmail('');
            setBanner({ type: 'success', text: 'Account profile updated!' });
        } catch {
            setBanner({
                type: 'error',
                text: 'Failed to update profile. Username or email may already be in use.',
            });
        } finally {
            setSavingProfile(false);
        }
    };

    const persistSettings = async (nextSettings: UserSettings, nextPrefs?: LocalPrefs) => {
        try {
            setSaving(true);
            setBanner(null);
            if (nextPrefs) {
                localStorage.setItem('habit_tracker_local_prefs', JSON.stringify(nextPrefs));
            }
            await updateUserSettings(nextSettings);
            setBanner({ type: 'success', text: 'Preferences saved!' });
        } catch {
            setBanner({ type: 'error', text: 'Could not sync settings to server.' });
        } finally {
            setSaving(false);
        }
    };

    const handleThemeSelect = (nextTheme: ThemePreference) => {
        const updated = { ...settings, theme: nextTheme };
        setSettings(updated);
        applyTheme(nextTheme);
        persistSettings(updated);
    };

    const handleDarkSwitchToggle = () => {
        const isCurrentlyDark =
            settings.theme === 'dark' ||
            (settings.theme === 'system' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
        handleThemeSelect(isCurrentlyDark ? 'light' : 'dark');
    };

    const handleNotificationsToggle = () => {
        const nextVal = !(settings.email_notifications || settings.push_notifications);
        const updated: UserSettings = {
            ...settings,
            email_notifications: nextVal,
            push_notifications: nextVal,
        };
        setSettings(updated);
        persistSettings(updated);
    };

    const handleExportPreferences = () => {
        const exportPayload = {
            exported_at: new Date().toISOString(),
            username: username || 'user',
            settings,
            local_preferences: localPrefs,
            lifecycle_rules: {
                status_edit_lock_hours: 6,
                auto_miss_sweep: 'Midnight UTC/Local boundary',
                max_carry_forward_attempts: 3,
            },
        };
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `habit-tracker-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setBanner({ type: 'success', text: 'Settings backup downloaded.' });
    };

    const handleResetLocalPrefs = () => {
        localStorage.removeItem('habit_tracker_local_prefs');
        setLocalPrefs(DEFAULT_LOCAL_PREFS);
        setBanner({ type: 'success', text: 'Local display & schedule defaults reset.' });
    };

    const isDarkVisual =
        settings.theme === 'dark' ||
        (settings.theme === 'system' &&
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches);

    const notificationsEnabled = Boolean(
        settings.email_notifications || settings.push_notifications
    );

    if (loading) {
        return (
            <div className="max-w-xl mx-auto p-8 rounded-3xl bg-white dark:bg-[#1e1f26] border border-gray-200/80 dark:border-white/10 text-center text-sm text-gray-500 dark:text-slate-400">
                Loading settings...
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto space-y-4 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Settings
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                        Manage your account, appearance, and habit lifecycle defaults
                    </p>
                </div>
                {saving && (
                    <span className="text-xs font-medium text-indigo-600 dark:text-emerald-400">
                        Syncing...
                    </span>
                )}
            </div>

            {/* Feedback Banner */}
            {banner && (
                <div
                    className={`p-3 rounded-2xl text-xs font-medium flex items-center justify-between border ${banner.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
                        }`}
                >
                    <span>{banner.text}</span>
                    <button
                        type="button"
                        onClick={() => setBanner(null)}
                        className="ml-3 opacity-70 hover:opacity-100"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* GROUP 1: PROFILE & AVATAR CARD */}
            <div className="rounded-3xl bg-white dark:bg-[#1e1f26] border border-gray-200/80 dark:border-white/10 shadow-xs overflow-hidden transition-colors">
                <div className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                        {/* Avatar with Camera Trigger */}
                        <div className="relative shrink-0">
                            {activeAvatar ? (
                                <img
                                    src={activeAvatar}
                                    alt={username || 'Profile'}
                                    className="w-13 h-13 rounded-full object-cover ring-2 ring-indigo-500/30 dark:ring-emerald-400/40"
                                />
                            ) : (
                                <div className="w-13 h-13 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center ring-2 ring-indigo-500/20 dark:ring-white/15">
                                    {(username?.[0] || 'H').toUpperCase()}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                title="Upload photo (max 2 MB)"
                                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 dark:bg-emerald-500 text-white dark:text-gray-950 flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleAvatarSelect}
                                className="hidden"
                            />
                        </div>

                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {username || 'Habit Tracker User'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                                @{(username || 'user').toLowerCase().replace(/\s+/g, '')} • Photo max 2 MB
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => toggleDrawer('profile')}
                        className="p-2 rounded-xl text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors"
                        aria-label="Edit account details"
                    >
                        <svg
                            className={`w-4 h-4 transition-transform ${openDrawer === 'profile' ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Expandable Account & Photo Drawer */}
                {openDrawer === 'profile' && (
                    <form
                        onSubmit={handleSaveProfile}
                        className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-white/8 space-y-3 bg-gray-50/60 dark:bg-black/15"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200/70 dark:border-white/8">
                            <span className="text-[11px] text-gray-500 dark:text-slate-400">
                                JPEG, PNG or WebP up to <strong>2 MB</strong>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-white/10 text-indigo-600 dark:text-white hover:bg-indigo-100 dark:hover:bg-white/15"
                                >
                                    {activeAvatar ? 'Change Photo' : 'Upload Photo'}
                                </button>
                                {activeAvatar && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                    New Email (optional)
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={savingProfile}
                                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                                {savingProfile ? 'Updating...' : 'Save Account'}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* GROUP 2: NOTIFICATIONS & SCHEDULE DEFAULTS */}
            <div className="rounded-3xl bg-white dark:bg-[#1e1f26] border border-gray-200/80 dark:border-white/10 shadow-xs divide-y divide-gray-100 dark:divide-white/8 overflow-hidden transition-colors">
                {/* Reminders Pill Toggle Row */}
                <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/6 text-gray-700 dark:text-slate-200 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </span>
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Daily habit reminders
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                Check-in alert at {settings.reminder_time || '08:00'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={notificationsEnabled}
                        onClick={handleNotificationsToggle}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${notificationsEnabled
                                ? 'bg-indigo-600 dark:bg-lime-400'
                                : 'bg-gray-200 dark:bg-white/15'
                            }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition duration-200 ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                        />
                    </button>
                </div>

                {/* General & Lifecycle Defaults Row */}
                <div>
                    <button
                        type="button"
                        onClick={() => toggleDrawer('general')}
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50/70 dark:hover:bg-white/3 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/6 text-gray-700 dark:text-slate-200 flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                            </span>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    Schedule & lifecycle defaults
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                    {localPrefs.defaultDuration}m default • {localPrefs.weekStart} start • 6h lock active
                                </p>
                            </div>
                        </div>
                        <svg
                            className={`w-4 h-4 text-gray-400 dark:text-slate-400 transition-transform ${openDrawer === 'general' ? 'rotate-90' : ''
                                }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {openDrawer === 'general' && (
                        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-white/8 bg-gray-50/60 dark:bg-black/15 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                        Reminder Time
                                    </label>
                                    <input
                                        type="time"
                                        value={settings.reminder_time}
                                        onChange={(e) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                reminder_time: e.target.value,
                                            }))
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                        Default Duration
                                    </label>
                                    <select
                                        value={localPrefs.defaultDuration}
                                        onChange={(e) =>
                                            setLocalPrefs((prev) => ({
                                                ...prev,
                                                defaultDuration: Number(e.target.value),
                                            }))
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white"
                                    >
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={45}>45 minutes</option>
                                        <option value={60}>60 minutes</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                        Week Starts On
                                    </label>
                                    <select
                                        value={localPrefs.weekStart}
                                        onChange={(e) =>
                                            setLocalPrefs((prev) => ({
                                                ...prev,
                                                weekStart: e.target.value as 'Monday' | 'Sunday',
                                            }))
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white"
                                    >
                                        <option value="Monday">Monday</option>
                                        <option value="Sunday">Sunday</option>
                                    </select>
                                </div>
                            </div>

                            {/* Active Lifecycle Guardrails */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-white/8 text-indigo-700 dark:text-emerald-300 border border-indigo-100 dark:border-white/10">
                                    6h Status Lock
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-white/8 text-indigo-700 dark:text-emerald-300 border border-indigo-100 dark:border-white/10">
                                    Midnight Auto-Miss
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-white/8 text-indigo-700 dark:text-emerald-300 border border-indigo-100 dark:border-white/10">
                                    Max 3 Carry-Forwards
                                </span>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => persistSettings(settings, localPrefs)}
                                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                                >
                                    Save Defaults
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* GROUP 3: APPEARANCE, LANGUAGE & REGION, DATA */}
            <div className="rounded-3xl bg-white dark:bg-[#1e1f26] border border-gray-200/80 dark:border-white/10 shadow-xs divide-y divide-gray-100 dark:divide-white/8 overflow-hidden transition-colors">
                {/* Dark Mode Toggle Row */}
                <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/6 text-gray-700 dark:text-slate-200 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                        </span>
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Dark mode
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                {(['light', 'dark', 'system'] as ThemePreference[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => handleThemeSelect(mode)}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize transition-colors ${settings.theme === mode
                                                ? 'bg-indigo-600 dark:bg-lime-400 text-white dark:text-gray-950'
                                                : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/8'
                                            }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={isDarkVisual}
                        onClick={handleDarkSwitchToggle}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${isDarkVisual
                                ? 'bg-indigo-600 dark:bg-lime-400'
                                : 'bg-gray-200 dark:bg-white/15'
                            }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition duration-200 ${isDarkVisual ? 'translate-x-5' : 'translate-x-0'
                                }`}
                        />
                    </button>
                </div>

                {/* Language & Region Row */}
                <div>
                    <button
                        type="button"
                        onClick={() => toggleDrawer('language')}
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50/70 dark:hover:bg-white/3 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/6 text-gray-700 dark:text-slate-200 flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
                            </span>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    Language & region
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                    {localPrefs.language === 'sw' ? 'Kiswahili' : 'English'} •{' '}
                                    {settings.timezone || 'UTC'} • {localPrefs.clockFormat}
                                </p>
                            </div>
                        </div>
                        <svg
                            className={`w-4 h-4 text-gray-400 dark:text-slate-400 transition-transform ${openDrawer === 'language' ? 'rotate-90' : ''
                                }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {openDrawer === 'language' && (
                        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-white/8 bg-gray-50/60 dark:bg-black/15 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                        Language
                                    </label>
                                    <select
                                        value={localPrefs.language}
                                        onChange={(e) =>
                                            setLocalPrefs((prev) => ({
                                                ...prev,
                                                language: e.target.value,
                                            }))
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white"
                                    >
                                        <option value="en">English</option>
                                        <option value="sw">Kiswahili</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                        Timezone
                                    </label>
                                    <select
                                        value={settings.timezone}
                                        onChange={(e) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                timezone: e.target.value,
                                            }))
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white"
                                    >
                                        <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                                        <option value="UTC">UTC</option>
                                        <option value="Europe/London">Europe/London (GMT/BST)</option>
                                        <option value="America/New_York">America/New_York (EST)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                                        Time Format
                                    </label>
                                    <select
                                        value={localPrefs.clockFormat}
                                        onChange={(e) =>
                                            setLocalPrefs((prev) => ({
                                                ...prev,
                                                clockFormat: e.target.value as '12h' | '24h',
                                            }))
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#272932] border border-gray-200 dark:border-white/10 text-xs text-gray-900 dark:text-white"
                                    >
                                        <option value="24h">24-hour (14:30)</option>
                                        <option value="12h">12-hour (2:30 PM)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => persistSettings(settings, localPrefs)}
                                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                                >
                                    Save Region
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Data & Backup Row */}
                <div>
                    <button
                        type="button"
                        onClick={() => toggleDrawer('data')}
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50/70 dark:hover:bg-white/3 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/6 text-gray-700 dark:text-slate-200 flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </span>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    Data & backup
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                    Export preferences JSON or reset local defaults
                                </p>
                            </div>
                        </div>
                        <svg
                            className={`w-4 h-4 text-gray-400 dark:text-slate-400 transition-transform ${openDrawer === 'data' ? 'rotate-90' : ''
                                }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {openDrawer === 'data' && (
                        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-white/8 bg-gray-50/60 dark:bg-black/15 flex flex-wrap items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={handleExportPreferences}
                                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                            >
                                Export Settings JSON
                            </button>
                            <button
                                type="button"
                                onClick={handleResetLocalPrefs}
                                className="px-3.5 py-1.5 rounded-xl border border-gray-300 dark:border-white/15 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/8"
                            >
                                Reset Local Defaults
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* GROUP 4: HIGH-CONTRAST LOG OUT PILL */}
            {onLogout && (
                <button
                    type="button"
                    onClick={onLogout}
                    className="w-full py-3.5 px-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-red-600 font-semibold text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.99] transition-all"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Log Out</span>
                </button>
            )}
        </div>
    );
};