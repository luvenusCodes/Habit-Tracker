import { useState, useEffect } from 'react';
import { sendVerificationOtp, verifyEmailOtp } from '../services/api';

interface VerifyEmailProps {
    initialEmail?: string;
    onVerified: () => void;
    onBackToLogin: () => void;
}

export const VerifyEmail = ({ initialEmail = '', onVerified, onBackToLogin }: VerifyEmailProps) => {
    const [email, setEmail] = useState(initialEmail);
    const [otpCode, setOtpCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [cooldown, setCooldown] = useState(initialEmail ? 60 : 0);
    const [error, setError] = useState<string | null>(null);
    const [infoMsg, setInfoMsg] = useState<string | null>(
        initialEmail ? `We sent a 6-digit verification code to ${initialEmail}.` : null
    );

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setInfoMsg(null);

        try {
            const res = await verifyEmailOtp({ email: email.trim(), otp_code: otpCode.trim() });
            setInfoMsg(res.message || 'Email verified successfully! Redirecting to login...');
            setTimeout(() => onVerified(), 1500);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!email.trim()) {
            setError('Please enter your email address first.');
            return;
        }
        setResending(true);
        setError(null);
        setInfoMsg(null);

        try {
            const res = await sendVerificationOtp({ email: email.trim() });
            setInfoMsg(res.message);
            setCooldown(60);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-5 sm:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Verify Your Email
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Enter the 6-digit code sent to your inbox (expires in 10 minutes)
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

            <form onSubmit={handleVerify} className="space-y-4">
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        6-Digit Verification Code
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

                <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm mt-2"
                >
                    {loading ? 'Verifying...' : 'Verify Email'}
                </button>
            </form>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm">
                <button
                    type="button"
                    disabled={resending || cooldown > 0}
                    onClick={handleResend}
                    className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                >
                    {resending
                        ? 'Sending...'
                        : cooldown > 0
                            ? `Resend code (${cooldown}s)`
                            : 'Resend code'}
                </button>

                <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                    Back to Log in
                </button>
            </div>
        </div>
    );
};