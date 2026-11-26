import React, { useEffect, useState } from 'react';

interface AuthLayoutProps {
    children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    const [now, setNow] = useState<Date>(() => new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const showColon = now.getSeconds() % 2 === 0;
    const formattedDate = now.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0d0e12] text-gray-900 dark:text-white flex items-center justify-center p-4 sm:p-6 lg:p-10 transition-colors">
            <div className="w-full max-w-5xl rounded-3xl overflow-hidden bg-white dark:bg-[#14151b] border border-gray-200/80 dark:border-white/10 shadow-xl grid grid-cols-1 lg:grid-cols-12">
                {/* LEFT PANEL: WARM DESK-LAMP DISCIPLINE HERO */}
                <div className="lg:col-span-6 relative bg-[#111216] text-white p-6 sm:p-8 lg:p-10 flex flex-col justify-between overflow-hidden min-h-75 lg:min-h-155">
                    {/* Warm Desk Lamp Radial Glow */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-20 -left-16 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl"
                    />
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-10 right-6 w-64 h-64 rounded-full bg-orange-500/10 blur-3xl"
                    />

                    {/* Top Brand & "1% better every day" Pill */}
                    <div className="relative z-10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-amber-400 to-orange-500 text-gray-950 font-black text-sm flex items-center justify-center shadow-sm">
                                H
                            </div>
                            <span className="font-bold text-sm tracking-tight text-white">
                                Habit Tracker
                            </span>
                        </div>

                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/25">
                            1% better every day
                        </span>
                    </div>

                    {/* Center Editorial Statement */}
                    <div className="relative z-10 my-6 lg:my-auto text-center">
                        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300/90 mb-2">
                            Stay
                        </p>
                        <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-black uppercase tracking-tight leading-none text-white">
                            Disciplined.
                        </h1>
                        <div className="mt-3 flex items-center justify-center gap-3">
                            <span className="h-px w-8 bg-amber-400/40" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                                Your future is
                            </p>
                            <span className="h-px w-8 bg-amber-400/40" />
                        </div>
                        <p className="mt-1 text-lg sm:text-xl font-extrabold uppercase tracking-[0.18em] text-amber-300">
                            Built Today.
                        </p>
                    </div>

                    {/* Illustrated Minimalist Desk & Live Ticking Laptop Clock */}
                    <div className="relative z-10 mt-2 pt-4 border-t border-white/10">
                        <div className="flex items-end justify-between gap-3">
                            {/* Stacked Focus Books */}
                            <div className="hidden sm:flex flex-col gap-1 w-28 shrink-0">
                                <div className="px-2 py-0.5 rounded bg-white/8 border border-white/10 text-[8px] font-bold tracking-wider text-slate-300 truncate">
                                    MINDSET
                                </div>
                                <div className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/20 text-[8px] font-bold tracking-wider text-amber-200 truncate">
                                    ATOMIC HABITS
                                </div>
                                <div className="px-2 py-0.5 rounded bg-white/8 border border-white/10 text-[8px] font-bold tracking-wider text-slate-400 truncate">
                                    DEEP WORK
                                </div>
                            </div>

                            {/* Live Laptop Clock Display */}
                            <div className="mx-auto flex flex-col items-center">
                                <div className="px-5 py-2.5 rounded-t-xl bg-[#1b1d24] border border-white/15 shadow-inner text-center">
                                    <div className="font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-amber-100 leading-none">
                                        <span>{hours}</span>
                                        <span className={showColon ? 'opacity-100' : 'opacity-25'}>:</span>
                                        <span>{minutes}</span>
                                    </div>
                                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 mt-1">
                                        {formattedDate}
                                    </p>
                                </div>
                                <div className="w-44 sm:w-48 h-2 rounded-b-lg bg-linear-to-r from-slate-700 via-slate-500 to-slate-700" />
                            </div>

                            {/* Focus Motto Card */}
                            <div className="hidden sm:block w-28 shrink-0 p-2 rounded-xl bg-amber-200/10 border border-amber-300/20 text-[9px] leading-relaxed text-amber-100/90">
                                <p className="font-bold uppercase tracking-wider text-amber-300">
                                    Daily Rule
                                </p>
                                <p className="mt-0.5">Focus • Plan • Execute • Repeat</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: AUTHENTICATION FORM CANVAS */}
                <div className="lg:col-span-6 p-6 sm:p-8 lg:p-10 flex flex-col justify-center bg-white dark:bg-[#14151b]">
                    <div className="w-full max-w-md mx-auto">{children}</div>
                </div>
            </div>
        </div>
    );
};