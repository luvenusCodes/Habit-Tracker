import { useState, useEffect } from 'react';
import { sendVerificationOtp, verifyEmailOtp } from '../services/api';

interface VerifyEmailProps {
    initialEmail?: string;
    onVerified: () => void;
    onBackToLogin: () => void;
}

export const VerifyEmail = ({
    initialEmail = '',
    onVerified,
    onBackToLogin,
}: VerifyEmailProps) => {
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
            setInfoMsg(res.message || 'Email verified successfully! Redirecting to sign in...');
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
        <div className="w-full">
            <div className="mb-6">
                <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-amber-400/15 text-indigo-600 dark:text-amber-300 mb-3">
                    Email Verification
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Verify Your Email
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Enter the 6-digit code sent to your inbox (expires in 10 minutes)
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

            <form onSubmit={handleVerify} className="space-y-4">
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

                <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
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
                        className="w-full px-4 py-3 bg-gray-50/70 dark:bg-[#1e2028] border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400 text-center tracking-[0.4em] font-mono text-xl font-bold text-gray-900 dark:text-white dark:placeholder-slate-500"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-gray-950 font-bold text-sm transition-colors shadow-sm disabled:opacity-50 mt-1"
                >
                    {loading ? 'Verifying...' : 'Verify Email'}
                </button>
            </form>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200/80 dark:border-white/10 text-xs">
                <button
                    type="button"
                    disabled={resending || cooldown > 0}
                    onClick={handleResend}
                    className="text-indigo-600 dark:text-amber-400 font-semibold hover:underline disabled:opacity-50 disabled:no-underline"
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
                    className="font-medium text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white transition-colors"
                >
                    ← Back to Sign In
                </button>
            </div>
        </div>
    );
};