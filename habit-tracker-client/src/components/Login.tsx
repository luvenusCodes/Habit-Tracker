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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

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
        <div className="w-full max-w-md mx-auto p-5 sm:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Welcome Back</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Log in to manage your habits and track your progress</p>
            </div>

            {error && (
                <div className="p-3 mb-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-center">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                    <input
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        required
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                        <button
                            type="button"
                            onClick={onSwitchToForgotPassword}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline focus:outline-none"
                        >
                            Forgot password?
                        </button>
                    </div>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm mt-2"
                >
                    {loading ? 'Logging in...' : 'Log In'}
                </button>
            </form>

            <div className="text-center mt-6 space-y-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Don't have an account?{' '}
                    <button
                        type="button"
                        onClick={onSwitchToRegister}
                        className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline focus:outline-none py-1"
                    >
                        Sign up
                    </button>
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Need to verify your email?{' '}
                    <button
                        type="button"
                        onClick={onSwitchToVerifyEmail}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
                    >
                        Enter verification code
                    </button>
                </p>
            </div>
        </div>
    );
};