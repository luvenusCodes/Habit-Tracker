export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'app_theme';

export function applyTheme(theme: ThemePreference) {
    const root = document.documentElement;
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = theme === 'dark' || (theme === 'system' && isSystemDark);

    if (shouldUseDark) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

export function getSavedTheme(): ThemePreference {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
    }
    return 'system';
}

export function initThemeListener() {
    // Apply cached theme immediately on startup
    applyTheme(getSavedTheme());

    // Listen for OS theme changes when set to 'system'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
        if (getSavedTheme() === 'system') {
            applyTheme('system');
        }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
}