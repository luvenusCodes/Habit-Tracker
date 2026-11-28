import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { LoginUserJson, loginWithGoogle } from '../services/api';

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

    const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
        if (!credentialResponse.credential) {
            setError('Google sign-in did not return a valid credential.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await loginWithGoogle(credentialResponse.credential);
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

            {/* Continue with Google */}
            <div className="w-full flex justify-center">
                <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError('Google Sign-In was cancelled or failed.')}
                    theme="outline"
                    size="large"
                    shape="pill"
                    text="continue_with"
                    width="340"
                />
            </div>

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