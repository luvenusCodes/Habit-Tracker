import { useEffect, useState, useCallback, useMemo } from 'react';
import type { HabitAnalyticsResponse } from '../types';
import { getHabitAnalytics } from '../services/api';

const SHORT_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const ACCENT_PALETTE = [
    {
        iconBg: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
        bar: 'bg-sky-500 dark:bg-sky-400',
        rateText: 'text-sky-600 dark:text-sky-400',
    },
    {
        iconBg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
        bar: 'bg-orange-500 dark:bg-orange-400',
        rateText: 'text-orange-600 dark:text-orange-400',
    },
    {
        iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        bar: 'bg-amber-500 dark:bg-amber-400',
        rateText: 'text-amber-600 dark:text-amber-400',
    },
    {
        iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        bar: 'bg-rose-500 dark:bg-rose-400',
        rateText: 'text-rose-600 dark:text-rose-400',
    },
    {
        iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        bar: 'bg-emerald-500 dark:bg-emerald-400',
        rateText: 'text-emerald-600 dark:text-emerald-400',
    },
    {
        iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
        bar: 'bg-indigo-500 dark:bg-indigo-400',
        rateText: 'text-indigo-600 dark:text-indigo-400',
    },
];

const parseLocalDate = (isoDate: string) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

export const AnalyticsDashboard = () => {
    const [days, setDays] = useState<number>(30);
    const [analytics, setAnalytics] = useState<HabitAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

    const loadAnalytics = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getHabitAnalytics(days);
            setAnalytics(data);
            setError(null);
            if (data.daily_trend.length > 0) {
                setSelectedDate(data.daily_trend[data.daily_trend.length - 1].date);
            } else {
                setSelectedDate(null);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    // Last 9 days for the horizontal day strip
    const stripDays = useMemo(() => {
        if (!analytics?.daily_trend) return [];
        return analytics.daily_trend.slice(-9);
    }, [analytics]);

    const activeDaySnapshot = useMemo(() => {
        if (!analytics?.daily_trend || analytics.daily_trend.length === 0) return null;
        return (
            analytics.daily_trend.find((d) => d.date === selectedDate) ||
            analytics.daily_trend[analytics.daily_trend.length - 1]
        );
    }, [analytics, selectedDate]);

    const categoryTabs = useMemo(() => {
        if (!analytics?.habit_streaks) return ['ALL'];
        const unique = Array.from(
            new Set(analytics.habit_streaks.map((h) => h.category_name).filter(Boolean))
        );
        return ['ALL', ...unique];
    }, [analytics]);

    const filteredHabits = useMemo(() => {
        if (!analytics?.habit_streaks) return [];
        if (selectedCategory === 'ALL') return analytics.habit_streaks;
        return analytics.habit_streaks.filter((h) => h.category_name === selectedCategory);
    }, [analytics, selectedCategory]);

    return (
        <div className="space-y-6 pb-8">
            {/* HERO CARD: HORIZON HEADER, DAY STRIP & KPI SUMMARY */}
            <div className="rounded-3xl bg-white dark:bg-[#16171d] border border-gray-200/80 dark:border-white/10 shadow-sm overflow-hidden transition-colors">
                {/* Top Bar & Timeframe Pills */}
                <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Streaks & Analytics
                        </h2>
                        {analytics && (
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                {analytics.start_date} — {analytics.end_date}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/6 p-1 rounded-full self-start sm:self-auto">
                        {[7, 14, 30, 90].map((windowDays) => (
                            <button
                                key={windowDays}
                                type="button"
                                onClick={() => setDays(windowDays)}
                                className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${days === windowDays
                                    ? 'bg-indigo-600 dark:bg-white text-white dark:text-gray-950 shadow-xs'
                                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                {windowDays}D
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="mx-5 mb-4 p-3.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 rounded-2xl">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {loading && !analytics ? (
                    <div className="py-16 text-center text-sm text-gray-500 dark:text-slate-400">
                        Loading streaks & performance metrics...
                    </div>
                ) : analytics ? (
                    <>
                        {/* Horizontal 9-Day Strip Selector */}
                        {stripDays.length > 0 && (
                            <div className="px-4 sm:px-6 pt-2 pb-1">
                                <div className="grid grid-cols-9 gap-1 sm:gap-2 text-center">
                                    {stripDays.map((day) => {
                                        const dt = parseLocalDate(day.date);
                                        const weekday = SHORT_WEEKDAYS[dt.getDay()];
                                        const dayNum = dt.getDate();
                                        const isSelected = activeDaySnapshot?.date === day.date;
                                        const hasCompletions = day.done > 0;

                                        return (
                                            <button
                                                key={day.date}
                                                type="button"
                                                onClick={() => setSelectedDate(day.date)}
                                                className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center transition-all ${isSelected
                                                    ? 'bg-indigo-600 dark:bg-white/14 text-white shadow-xs ring-1 ring-indigo-500/40 dark:ring-white/20'
                                                    : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-slate-400'
                                                    }`}
                                            >
                                                <span
                                                    className={`text-[10px] font-semibold tracking-wider ${isSelected
                                                        ? 'text-indigo-100 dark:text-slate-300'
                                                        : 'text-gray-400 dark:text-slate-500'
                                                        }`}
                                                >
                                                    {weekday}
                                                </span>
                                                <span
                                                    className={`text-sm font-bold mt-1 ${isSelected
                                                        ? 'text-white'
                                                        : 'text-gray-800 dark:text-slate-200'
                                                        }`}
                                                >
                                                    {dayNum}
                                                </span>
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full mt-1 ${hasCompletions
                                                        ? isSelected
                                                            ? 'bg-amber-300 dark:bg-emerald-400'
                                                            : 'bg-emerald-500 dark:bg-emerald-400'
                                                        : 'bg-transparent'
                                                        }`}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Atmospheric Illustrated Horizon Banner */}
                        <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-linear-to-b from-indigo-50/60 via-emerald-50/40 to-white dark:from-[#16171d] dark:via-[#1b1f24] dark:to-[#16171d]">
                            <svg
                                viewBox="0 0 800 180"
                                preserveAspectRatio="none"
                                className="w-full h-full"
                                aria-hidden="true"
                            >
                                {/* Soft Rolling Hills */}
                                <path
                                    d="M0,130 Q180,85 380,125 T800,110 L800,180 L0,180 Z"
                                    className="fill-emerald-200/45 dark:fill-white/3"
                                />
                                <path
                                    d="M0,148 Q260,115 520,145 T800,132 L800,180 L0,180 Z"
                                    className="fill-emerald-300/40 dark:fill-white/4"
                                />

                                {/* Stylized V-Shaped Birds */}
                                <path
                                    d="M325,52 Q333,62 343,54 Q334,67 325,52 Z"
                                    className="fill-amber-500/80 dark:fill-amber-300/80"
                                />
                                <path
                                    d="M380,84 Q392,98 408,82 Q395,104 380,84 Z"
                                    className="fill-amber-400 dark:fill-amber-200"
                                />

                                {/* Minimalist Trees */}
                                <g transform="translate(135, 92)">
                                    <rect x="13" y="24" width="4" height="18" rx="2" className="fill-emerald-900/50 dark:fill-slate-600" />
                                    <circle cx="15" cy="18" r="14" className="fill-emerald-500/80 dark:fill-emerald-500/70" />
                                    <circle cx="22" cy="21" r="9" className="fill-teal-400/80 dark:fill-teal-400/70" />
                                </g>
                                <g transform="translate(520, 108)">
                                    <rect x="9" y="18" width="3" height="14" rx="1.5" className="fill-emerald-900/50 dark:fill-slate-600" />
                                    <circle cx="10.5" cy="14" r="10" className="fill-emerald-500/75 dark:fill-emerald-500/60" />
                                </g>
                                <g transform="translate(640, 86)">
                                    <rect x="16" y="28" width="4" height="22" rx="2" className="fill-emerald-900/50 dark:fill-slate-600" />
                                    <circle cx="18" cy="20" r="17" className="fill-emerald-500/85 dark:fill-emerald-400/75" />
                                    <circle cx="27" cy="24" r="11" className="fill-teal-400/85 dark:fill-teal-300/75" />
                                </g>
                            </svg>

                            {/* Selected Day Floating Pill */}
                            {activeDaySnapshot && (
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white/90 dark:bg-[#23252f]/90 backdrop-blur-md border border-gray-200/80 dark:border-white/10 shadow-xs flex items-center gap-2.5 text-xs whitespace-nowrap">
                                    <span className="font-semibold text-gray-800 dark:text-white">
                                        {activeDaySnapshot.date}
                                    </span>
                                    <span className="text-gray-300 dark:text-white/20">•</span>
                                    <span className="font-bold text-indigo-600 dark:text-emerald-400">
                                        {activeDaySnapshot.done}/{activeDaySnapshot.total} done
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-white/10 text-indigo-700 dark:text-slate-200">
                                        {activeDaySnapshot.efficiency}%
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* KPI Metric Cards */}
                        <div className="px-5 pb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="p-4 rounded-2xl bg-gray-50/90 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07]">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                    Best Streak
                                </p>
                                <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                                    {analytics.summary.best_current_streak}{' '}
                                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                                        {analytics.summary.best_current_streak === 1 ? 'day' : 'days'}
                                    </span>
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-gray-50/90 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07]">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                    Completion Rate
                                </p>
                                <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                                    {analytics.summary.completion_rate}%
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                                    {analytics.summary.total_done} / {analytics.summary.total_scheduled} tasks
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-gray-50/90 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07]">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                                    Score Efficiency
                                </p>
                                <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                                    {analytics.summary.score_efficiency}%
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                                    {analytics.summary.total_earned_points} pts earned
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-gray-50/90 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07]">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                    Missed / Skipped
                                </p>
                                <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                                    {analytics.summary.total_missed}{' '}
                                    <span className="text-sm font-normal text-gray-400 dark:text-slate-500">
                                        / {analytics.summary.total_skipped}
                                    </span>
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                                    Last {analytics.days} days
                                </p>
                            </div>
                        </div>

                        {/* Interactive Daily Completion Trend Bars */}
                        <div className="px-5 pb-6">
                            <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07]">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                                        Daily Completion Trend
                                    </h3>
                                    <span className="text-[11px] text-gray-500 dark:text-slate-400">
                                        Click any bar to inspect
                                    </span>
                                </div>

                                <div className="flex items-end gap-1 h-32 sm:h-40">
                                    {analytics.daily_trend.map((day) => {
                                        const hasTasks = day.total > 0;
                                        const barHeight = hasTasks ? Math.max(day.efficiency, 10) : 5;
                                        const isSelected = activeDaySnapshot?.date === day.date;

                                        return (
                                            <button
                                                key={day.date}
                                                type="button"
                                                onClick={() => setSelectedDate(day.date)}
                                                title={`${day.date}: ${day.done}/${day.total} done (${day.efficiency}%)`}
                                                className="flex-1 h-full flex flex-col justify-end items-center group focus:outline-none"
                                            >
                                                <div
                                                    style={{ height: `${barHeight}%` }}
                                                    className={`w-full rounded-t-md transition-all ${isSelected
                                                        ? 'ring-2 ring-indigo-500 dark:ring-white scale-x-105'
                                                        : ''
                                                        } ${!hasTasks
                                                            ? 'bg-gray-200 dark:bg-white/10'
                                                            : day.efficiency >= 80
                                                                ? 'bg-emerald-500 dark:bg-emerald-400'
                                                                : day.efficiency >= 50
                                                                    ? 'bg-sky-500 dark:bg-sky-400'
                                                                    : day.efficiency > 0
                                                                        ? 'bg-amber-500 dark:bg-amber-400'
                                                                        : 'bg-rose-400/80 dark:bg-rose-500/60'
                                                        } group-hover:opacity-85`}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex justify-between text-[11px] text-gray-400 dark:text-slate-500 mt-2">
                                    <span>{analytics.start_date}</span>
                                    <span>{analytics.end_date}</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {/* HABIT CARDS & CATEGORY BREAKDOWN */}
            {analytics && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Habit Streaks & Consistency Cards */}
                    <div className="lg:col-span-2 rounded-3xl bg-white dark:bg-[#16171d] border border-gray-200/80 dark:border-white/10 p-5 shadow-sm transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                                Habit Consistency
                            </h3>

                            {/* Pill Filter Strip */}
                            {categoryTabs.length > 1 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                    {categoryTabs.map((cat) => {
                                        const active = selectedCategory === cat;
                                        return (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => setSelectedCategory(cat)}
                                                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${active
                                                    ? 'bg-gray-900 dark:bg-white/15 text-white'
                                                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/6'
                                                    }`}
                                            >
                                                {cat === 'ALL' ? 'All Habits' : cat}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {filteredHabits.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">
                                No active habits in this view. Complete scheduled habits to build streaks!
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {filteredHabits.map((item, idx) => {
                                    const accent = ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
                                    return (
                                        <li
                                            key={item.habit_id}
                                            className="p-4 rounded-2xl bg-gray-50/90 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07] transition-colors"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                {/* Left Icon Tile + Habit Info */}
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div
                                                        className={`w-11 h-11 rounded-2xl ${accent.iconBg} flex items-center justify-center font-bold text-base shrink-0`}
                                                    >
                                                        {item.habit_name.charAt(0).toUpperCase()}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                                                            {item.habit_name}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px]">
                                                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                                                ★ {item.category_name}
                                                            </span>
                                                            <span className="text-gray-300 dark:text-white/20">•</span>
                                                            <span className="text-gray-500 dark:text-slate-400">
                                                                Current: <strong className="text-gray-800 dark:text-slate-200">{item.current_streak}d</strong>
                                                            </span>
                                                            <span className="text-gray-500 dark:text-slate-400">
                                                                Best: <strong className="text-gray-800 dark:text-slate-200">{item.longest_streak}d</strong>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Fraction / Adherence Pill */}
                                                <div className="text-right shrink-0">
                                                    <p className={`text-base font-extrabold ${accent.rateText}`}>
                                                        {item.completion_rate}%
                                                    </p>
                                                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                                        adherence
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                                                <div
                                                    style={{ width: `${item.completion_rate}%` }}
                                                    className={`h-full rounded-full transition-all ${accent.bar}`}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Category Performance Breakdown */}
                    <div className="rounded-3xl bg-white dark:bg-[#16171d] border border-gray-200/80 dark:border-white/10 p-5 shadow-sm transition-colors">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight mb-4">
                            By Category
                        </h3>

                        {analytics.category_breakdown.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">
                                No occurrences logged in this window yet.
                            </p>
                        ) : (
                            <ul className="space-y-4">
                                {analytics.category_breakdown.map((cat, idx) => {
                                    const accent = ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
                                    return (
                                        <li
                                            key={cat.category}
                                            className="p-3.5 rounded-2xl bg-gray-50/90 dark:bg-[#1e2028] border border-gray-200/70 dark:border-white/[0.07] space-y-2"
                                        >
                                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                                <span className="font-semibold text-gray-800 dark:text-slate-100">
                                                    {cat.category}
                                                </span>
                                                <span className={`text-xs font-bold ${accent.rateText}`}>
                                                    {cat.rate}%{' '}
                                                    <span className="font-normal text-gray-400 dark:text-slate-500">
                                                        ({cat.done}/{cat.total})
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                                                <div
                                                    style={{ width: `${cat.rate}%` }}
                                                    className={`h-full rounded-full transition-all ${accent.bar}`}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};