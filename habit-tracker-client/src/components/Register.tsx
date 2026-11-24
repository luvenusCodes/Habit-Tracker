import { useState } from 'react';
import { registerUser, sendVerificationOtp } from '../services/api';
import { evaluatePassword, getPasswordErrorMessage } from '../utils/passwordValidation';

interface RegisterProps {
    onRegisterSuccess: (registeredEmail: string) => void;
    onSwitchToLogin: () => void;
}

export const Register = ({ onRegisterSuccess, onSwitchToLogin }: RegisterProps) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const passwordRules = evaluatePassword(password);
    const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        const passwordErr = getPasswordErrorMessage(password);
        if (passwordErr) {
            setError(passwordErr);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const cleanEmail = email.trim();
            await registerUser({ username: username.trim(), email: cleanEmail, password });
            await sendVerificationOtp({ email: cleanEmail }).catch(() => {
                // VerifyEmail screen allows resending if background dispatch is delayed
            });
            setSuccessMsg('Account created! Sending verification code...');
            setTimeout(() => {
                onRegisterSuccess(cleanEmail);
            }, 900);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-5 sm:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Create Account</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Start tracking your habits and building discipline</p>
            </div>

            {error && (
                <div className="p-3 mb-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-center">
                    {error}
                </div>
            )}

            {successMsg && (
                <div className="p-3 mb-4 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
                    {successMsg}
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
                        placeholder="Choose a username"
                        required
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                    <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        required
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />

                    {password.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs">
                            <li className={passwordRules.minLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}>
                                {passwordRules.minLength ? '✓' : '•'} At least 8 characters
                            </li>
                            <li className={passwordRules.hasUppercase ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}>
                                {passwordRules.hasUppercase ? '✓' : '•'} At least one uppercase letter (A–Z)
                            </li>
                            <li className={passwordRules.hasLowercase ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}>
                                {passwordRules.hasLowercase ? '✓' : '•'} At least one lowercase letter (a–z)
                            </li>
                            <li className={passwordRules.hasSpecial ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}>
                                {passwordRules.hasSpecial ? '✓' : '•'} At least one special symbol (!@#$%^&*)
                            </li>
                        </ul>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        required
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />
                    {confirmPassword.length > 0 && (
                        <p className={`mt-1 text-xs ${passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match'}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading || !passwordRules.isValid || !passwordsMatch}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm mt-2"
                >
                    {loading ? 'Creating Account...' : 'Sign Up'}
                </button>
            </form>

            <div className="text-center mt-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Already have an account?{' '}
                    <button
                        type="button"
                        onClick={onSwitchToLogin}
                        className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline focus:outline-none py-1"
                    >
                        Log in
                    </button>
                </p>
            </div>
        </div>
    );
};