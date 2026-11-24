export interface UserSettings {
    email_notifications: boolean;
    push_notifications: boolean;
    reminder_time: string;
    timezone: string;
    theme: 'light' | 'dark' | 'system';
}

export interface UserProfileUpdate {
    username?: string;
    email?: string;
}