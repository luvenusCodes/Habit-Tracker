import { useState } from 'react';
import { LoginUserJson } from '../services/api';

interface LoginProps {
    onLoginSuccess: () => void;
    onSwitchToRegister: () => void;
    onSwitchToForgotPassword: () => void;
    onSwitchToVerifyEmail: () => void;
}

export const Login = ({
    onLoginSuccess,
    onSwitchToRegister,
    onSwitchToForgotPassword,
    onSwitchToVerifyEmail,
}: LoginProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [googleNotice, setGoogleNotice] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setGoogleNotice(false);

        try {
            const response = await LoginUserJson({ username, password });
            localStorage.setItem('access_token', response.access_token);
            localStorage.setItem('username', response.username);
            onLoginSuccess();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Welcome Back
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Sign in to stay on top of your daily habits and streaks
                </p>
            </div>

            {error && (
                <div className="p-3 mb-4 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 rounded-2xl text-center">
                    {error}
                </div>
            )}

            {googleNotice && (
                <div className="p-3 mb-4 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-center">
                    Google Sign-In will connect once OAuth credentials are configured. Use your username & password below.
                </div>
            )}

            {/* Continue with Google */}
            <button
                type="button"
                onClick={() => setGoogleNotice(true)}
                className="w-full py-2.5 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-white/6 dark:hover:bg-white/10 border border-gray-200 dark:border-white/12 text-sm font-semibold text-gray-800 dark:text-white flex items-center justify-center gap-2.5 transition-colors"
            >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                        fill="#34A853"
                        d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.02v3.14C3.05 21.2 7.24 24 12 24Z"
                    />
                    <path
                        fill="#FBBC05"
                        d="M5.03 14.04c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.18H1.02C.37 7.47 0 8.91 0 10.44s.37 2.97 1.02 4.26l4.01-3.14v2.48Z"
                    />
                    <path
                        fill="#EA4335"
                        d="M12 4.75c1.79 0 3.41.62 4.68 1.82l3.51-3.51C18.07 1.19 15.3 0 12 0 7.24 0 3.05 2.8 1.02 6.82l4.01 3.14c.98-2.94 3.73-5.21 6.97-5.21Z"
                    />
                </svg>
                <span>Continue with Google</span>
            </button>

            <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">
                    or with credentials
                </span>
                <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                        Username
                    </label>
                    <input
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        required
                        className="w-full px-4 py-2.5 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500"
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                            Password
                        </label>
                        <button
                            type="button"
                            onClick={onSwitchToForgotPassword}
                            className="text-xs text-indigo-600 dark:text-amber-400 font-semibold hover:underline focus:outline-none"
                        >
                            Forgot password?
                        </button>
                    </div>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="w-full pl-4 pr-11 py-2.5 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-white"
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-gray-950 font-bold text-sm transition-colors shadow-sm disabled:opacity-50 mt-1"
                >
                    {loading ? 'Signing in...' : 'Sign In'}
                </button>
            </form>

            <div className="text-center mt-6 space-y-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                    Don&apos;t have an account?{' '}
                    <button
                        type="button"
                        onClick={onSwitchToRegister}
                        className="text-indigo-600 dark:text-amber-400 font-semibold hover:underline focus:outline-none"
                    >
                        Create account
                    </button>
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                    Need to verify your email?{' '}
                    <button
                        type="button"
                        onClick={onSwitchToVerifyEmail}
                        className="text-indigo-600 dark:text-amber-400 hover:underline focus:outline-none"
                    >
                        Enter verification code
                    </button>
                </p>
            </div>
        </div>
    );
};