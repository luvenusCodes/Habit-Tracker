import { useState, useEffect } from 'react';
import { forgotPassword, resetPassword } from '../services/api';
import { evaluatePassword, getPasswordErrorMessage } from '../utils/passwordValidation';

interface ForgotPasswordProps {
    onResetSuccess: () => void;
    onBackToLogin: () => void;
}

export const ForgotPassword = ({ onResetSuccess, onBackToLogin }: ForgotPasswordProps) => {
    const [step, setStep] = useState<'request' | 'reset'>('request');
    const [email, setEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [infoMsg, setInfoMsg] = useState<string | null>(null);

    const passwordRules = evaluatePassword(newPassword);
    const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const handleSendResetCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setInfoMsg(null);

        try {
            const res = await forgotPassword({ email: email.trim() });
            setInfoMsg(res.message);
            setCooldown(60);
            setStep('reset');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setInfoMsg(null);

        const passwordErr = getPasswordErrorMessage(newPassword);
        if (passwordErr) {
            setError(passwordErr);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const res = await resetPassword({
                email: email.trim(),
                otp_code: otpCode.trim(),
                new_password: newPassword,
            });
            setInfoMsg(res.message || 'Password reset successful! Redirecting to login...');
            setTimeout(() => onResetSuccess(), 1500);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-5 sm:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {step === 'request' ? 'Reset Password' : 'Enter Reset Code'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {step === 'request'
                        ? 'Enter your registered email to receive a 6-digit reset OTP'
                        : 'Check your inbox and set a new password'}
                </p>
            </div>

            {error && (
                <div className="p-3 mb-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-center">
                    {error}
                </div>
            )}

            {infoMsg && (
                <div className="p-3 mb-4 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
                    {infoMsg}
                </div>
            )}

            {step === 'request' ? (
                <form onSubmit={handleSendResetCode} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Email Address
                        </label>
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

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm mt-2"
                    >
                        {loading ? 'Sending OTP...' : 'Send Reset Code'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            6-Digit Reset Code
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            required
                            className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center tracking-[0.35em] font-mono text-lg text-gray-900 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            New Password
                        </label>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base sm:text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                        />

                        {newPassword.length > 0 && (
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Confirm New Password
                        </label>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
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
                        disabled={loading || otpCode.length !== 6 || !passwordRules.isValid || !passwordsMatch}
                        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm mt-2"
                    >
                        {loading ? 'Updating Password...' : 'Reset Password'}
                    </button>

                    <div className="text-center pt-1">
                        <button
                            type="button"
                            disabled={loading || cooldown > 0}
                            onClick={handleSendResetCode}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP code'}
                        </button>
                    </div>
                </form>
            )}

            <div className="text-center mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                    Back to Log in
                </button>
            </div>
        </div>
    );
};