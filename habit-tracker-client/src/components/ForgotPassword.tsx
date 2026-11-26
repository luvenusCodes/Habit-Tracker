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
    const [showPassword, setShowPassword] = useState(false);
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
            setInfoMsg(res.message || 'Password reset successful! Redirecting to sign in...');
            setTimeout(() => onResetSuccess(), 1500);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <div className="mb-6">
                <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-amber-400/15 text-indigo-600 dark:text-amber-300 mb-3">
                    Account Recovery
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {step === 'request' ? 'Reset Password' : 'Enter Reset Code'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {step === 'request'
                        ? 'Enter your registered email to receive a 6-digit reset OTP'
                        : 'Check your inbox and set a strong new password'}
                </p>
            </div>

            {error && (
                <div className="p-3 mb-4 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 rounded-2xl text-center">
                    {error}
                </div>
            )}

            {infoMsg && (
                <div className="p-3 mb-4 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-center">
                    {infoMsg}
                </div>
            )}

            {step === 'request' ? (
                <form onSubmit={handleSendResetCode} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                            Email Address
                        </label>
                        <input
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            required
                            className="w-full px-4 py-2.5 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-gray-950 font-bold text-sm transition-colors shadow-sm disabled:opacity-50 mt-1"
                    >
                        {loading ? 'Sending OTP...' : 'Send Reset Code'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleResetSubmit} className="space-y-3.5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
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
                            className="w-full px-4 py-2.5 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-center tracking-[0.4em] font-mono text-xl font-bold text-gray-900 dark:text-white dark:placeholder-slate-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                            New Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full pl-4 pr-14 py-2.5 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-white"
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>

                        {newPassword.length > 0 && (
                            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                <li
                                    className={
                                        passwordRules.minLength
                                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                            : 'text-gray-500 dark:text-slate-400'
                                    }
                                >
                                    {passwordRules.minLength ? '✓' : '•'} 8+ characters
                                </li>
                                <li
                                    className={
                                        passwordRules.hasUppercase
                                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                            : 'text-gray-500 dark:text-slate-400'
                                    }
                                >
                                    {passwordRules.hasUppercase ? '✓' : '•'} Uppercase (A–Z)
                                </li>
                                <li
                                    className={
                                        passwordRules.hasLowercase
                                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                            : 'text-gray-500 dark:text-slate-400'
                                    }
                                >
                                    {passwordRules.hasLowercase ? '✓' : '•'} Lowercase (a–z)
                                </li>
                                <li
                                    className={
                                        passwordRules.hasSpecial
                                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                            : 'text-gray-500 dark:text-slate-400'
                                    }
                                >
                                    {passwordRules.hasSpecial ? '✓' : '•'} Special (!@#$%^&*)
                                </li>
                            </ul>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                            Confirm New Password
                        </label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            required
                            className="w-full px-4 py-2.5 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500"
                        />
                        {confirmPassword.length > 0 && (
                            <p
                                className={`mt-1 text-[11px] font-medium ${passwordsMatch
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-red-600 dark:text-red-400'
                                    }`}
                            >
                                {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match'}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={
                            loading ||
                            otpCode.length !== 6 ||
                            !passwordRules.isValid ||
                            !passwordsMatch
                        }
                        className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-gray-950 font-bold text-sm transition-colors shadow-sm disabled:opacity-50 mt-1"
                    >
                        {loading ? 'Updating Password...' : 'Reset Password'}
                    </button>

                    <div className="text-center pt-1">
                        <button
                            type="button"
                            disabled={loading || cooldown > 0}
                            onClick={handleSendResetCode}
                            className="text-xs text-indigo-600 dark:text-amber-400 font-semibold hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP code'}
                        </button>
                    </div>
                </form>
            )}

            <div className="text-center mt-6 pt-4 border-t border-gray-200/80 dark:border-white/10">
                <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white transition-colors"
                >
                    ← Back to Sign In
                </button>
            </div>
        </div>
    );
};