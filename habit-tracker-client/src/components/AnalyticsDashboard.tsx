import { useEffect, useState, useCallback } from 'react';
import type { HabitAnalyticsResponse } from '../types';
import { getHabitAnalytics } from '../services/api';

export const AnalyticsDashboard = () => {
    const [days, setDays] = useState<number>(30);
    const [analytics, setAnalytics] = useState<HabitAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const loadAnalytics = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getHabitAnalytics(days);
            setAnalytics(data);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    return (
        <div className="space-y-6">
            {/* Header & Timeframe Selector */}
            <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Streaks & Progress Analytics
                        </h2>
                        {analytics && (
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                Window: {analytics.start_date} to {analytics.end_date}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl self-start sm:self-auto">
                        {[7, 14, 30, 90].map((windowDays) => (
                            <button
                                key={windowDays}
                                type="button"
                                onClick={() => setDays(windowDays)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${days === windowDays
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-700'
                                    }`}
                            >
                                {windowDays}D
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="p-4 mt-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {loading && !analytics ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-10">Loading analytics & streaks...</p>
                ) : analytics ? (
                    <>
                        {/* KPI Summary Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
                            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-800/60">
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                                    Best Active Streak
                                </p>
                                <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200 mt-1">
                                    {analytics.summary.best_current_streak}{' '}
                                    <span className="text-xs font-medium">
                                        {analytics.summary.best_current_streak === 1 ? 'day' : 'days'}
                                    </span>
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-900/20 border border-emerald-200/80 dark:border-emerald-800/60">
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                                    Completion Rate
                                </p>
                                <p className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mt-1">
                                    {analytics.summary.completion_rate}%
                                </p>
                                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">
                                    {analytics.summary.total_done} / {analytics.summary.total_scheduled} tasks
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200/80 dark:border-indigo-800/60">
                                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                                    Score Efficiency
                                </p>
                                <p className="text-2xl font-extrabold text-indigo-900 dark:text-indigo-200 mt-1">
                                    {analytics.summary.score_efficiency}%
                                </p>
                                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400 mt-0.5">
                                    {analytics.summary.total_earned_points} pts earned
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200/80 dark:border-gray-700">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Missed / Skipped
                                </p>
                                <p className="text-2xl font-extrabold text-gray-800 dark:text-gray-100 mt-1">
                                    {analytics.summary.total_missed}{' '}
                                    <span className="text-sm font-normal text-gray-400">/ {analytics.summary.total_skipped}</span>
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    in last {analytics.days} days
                                </p>
                            </div>
                        </div>

                        {/* Daily Efficiency Trend Chart */}
                        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">
                                    Daily Completion Trend
                                </h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Hover or tap bars for details
                                </span>
                            </div>

                            <div className="p-4 rounded-xl bg-gray-50/70 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700">
                                <div className="flex items-end gap-1 h-36 sm:h-44">
                                    {analytics.daily_trend.map((day) => {
                                        const hasTasks = day.total > 0;
                                        const barHeight = hasTasks ? Math.max(day.efficiency, 8) : 4;
                                        return (
                                            <div
                                                key={day.date}
                                                title={`${day.date}: ${day.done}/${day.total} done (${day.efficiency}%)`}
                                                className="flex-1 h-full flex flex-col justify-end items-center group relative"
                                            >
                                                <div
                                                    style={{ height: `${barHeight}%` }}
                                                    className={`w-full rounded-t-sm transition-all ${!hasTasks
                                                            ? 'bg-gray-200 dark:bg-gray-700/60'
                                                            : day.efficiency >= 80
                                                                ? 'bg-emerald-500 dark:bg-emerald-400'
                                                                : day.efficiency >= 50
                                                                    ? 'bg-indigo-500 dark:bg-indigo-400'
                                                                    : day.efficiency > 0
                                                                        ? 'bg-amber-500 dark:bg-amber-400'
                                                                        : 'bg-red-400/70 dark:bg-red-500/50'
                                                        } group-hover:opacity-80`}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                                    <span>{analytics.start_date}</span>
                                    <span>{analytics.end_date}</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {/* Per-Habit Streaks & Category Breakdown */}
            {analytics && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Active Habit Streaks Leaderboard */}
                    <div className="lg:col-span-2 p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight mb-4">
                            Habit Streaks & Consistency
                        </h3>

                        {analytics.habit_streaks.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                                No active habits found. Create a habit and log completions to build streaks!
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {analytics.habit_streaks.map((item) => (
                                    <li
                                        key={item.habit_id}
                                        className="p-3.5 rounded-xl bg-gray-50/70 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 wrap-break-word">
                                                        {item.habit_name}
                                                    </span>
                                                    <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                                        {item.category_name}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span
                                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg ${item.current_streak > 0
                                                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                                            : 'bg-gray-200/70 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                        }`}
                                                >
                                                    Current: {item.current_streak}d
                                                </span>
                                                <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                                                    Best: {item.longest_streak}d
                                                </span>
                                            </div>
                                        </div>

                                        {/* Consistency Progress Bar */}
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                <div
                                                    style={{ width: `${item.completion_rate}%` }}
                                                    className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full transition-all"
                                                />
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">
                                                {item.completion_rate}%
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Category Performance Breakdown */}
                    <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight mb-4">
                            By Category
                        </h3>

                        {analytics.category_breakdown.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                                No occurrences logged in this window yet.
                            </p>
                        ) : (
                            <ul className="space-y-4">
                                {analytics.category_breakdown.map((cat) => (
                                    <li key={cat.category} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-medium text-gray-800 dark:text-gray-200 wrap-break-word">
                                                {cat.category}
                                            </span>
                                            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0 ml-2">
                                                {cat.rate}% ({cat.done}/{cat.total})
                                            </span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                            <div
                                                style={{ width: `${cat.rate}%` }}
                                                className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all"
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};