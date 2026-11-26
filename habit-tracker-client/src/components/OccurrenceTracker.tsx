import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Occurrence, OccurrenceHistoryItem } from '../types';
import {
    getOccurrencesByDate,
    generateOccurrencesForDate,
    updateOccurrenceStatus,
    getScoreSummary,
    carryForwardOccurrence,
    getOccurrenceHistory,
    type CarryForwardPayload,
} from '../services/api';

type StatusFilter = 'ALL' | 'Pending' | 'Done' | 'Not Done' | 'Skipped';
type PriorityFilter = 'ALL' | 'High' | 'Medium' | 'Low';

interface OccurrenceTrackerProps {
    onNavigateToHabits?: () => void;
}

// Helper to get local YYYY-MM-DD without UTC timezone drift
function getLocalDateStr(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper to shift a YYYY-MM-DD string by N days
function shiftDateStr(dateStr: string, deltaDays: number): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + deltaDays);
    return getLocalDateStr(date);
}

// Helper to format a friendly subtitle (e.g., "Today • Thu, Nov 19")
function formatFriendlyDate(dateStr: string, todayStr: string): string {
    const yesterdayStr = shiftDateStr(todayStr, -1);
    const tomorrowStr = shiftDateStr(todayStr, 1);

    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const formatted = dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    if (dateStr === todayStr) return `Today • ${formatted}`;
    if (dateStr === yesterdayStr) return `Yesterday • ${formatted}`;
    if (dateStr === tomorrowStr) return `Tomorrow • ${formatted}`;
    return formatted;
}

// Normalize "HH:MM:SS" into "HH:MM" for <input type="time">
function toInputTime(timeStr?: string | null): string {
    if (!timeStr) return '08:00';
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    return timeStr;
}

export const OccurrenceTracker = ({ onNavigateToHabits }: OccurrenceTrackerProps) => {
    const todayStr = useMemo(() => getLocalDateStr(), []);
    const [selectedDate, setSelectedDate] = useState<string>(todayStr);

    const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
    const [scoreSummary, setScoreSummary] = useState<{
        total_occurrences: number;
        total_potential_score: number;
        total_earned_percentage: number;
    } | null>(null);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');

    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [infoBanner, setInfoBanner] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // Audit history drawer state
    const [openHistoryId, setOpenHistoryId] = useState<number | null>(null);
    const [historyMap, setHistoryMap] = useState<Record<number, OccurrenceHistoryItem[]>>({});
    const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);

    // Option A: Auto-missed warning toast state
    const [autoMissedToast, setAutoMissedToast] = useState<{
        count: number;
        names: string[];
    } | null>(null);

    // Custom Carry-Forward modal state
    const [carryForwardTarget, setCarryForwardTarget] = useState<Occurrence | null>(null);
    const [cfDate, setCfDate] = useState<string>('');
    const [cfStartTime, setCfStartTime] = useState<string>('08:00');
    const [cfTimingMode, setCfTimingMode] = useState<'duration' | 'end_time'>('duration');
    const [cfDuration, setCfDuration] = useState<number>(30);
    const [cfEndTime, setCfEndTime] = useState<string>('08:30');
    const [cfSubmitting, setCfSubmitting] = useState<boolean>(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const occData = await getOccurrencesByDate(selectedDate);
            setOccurrences(occData.occurrences || []);

            if (occData.auto_missed && occData.auto_missed.count > 0) {
                const uniqueNames = Array.from(
                    new Set(occData.auto_missed.items.map((item) => item.habit_name_snapshot))
                );
                setAutoMissedToast({
                    count: occData.auto_missed.count,
                    names: uniqueNames,
                });
            }

            const scoreData = await getScoreSummary(selectedDate);
            setScoreSummary(scoreData);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        setOpenHistoryId(null);
        setInfoBanner(null);
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!autoMissedToast) return;
        const timer = setTimeout(() => {
            setAutoMissedToast(null);
        }, 6000);
        return () => clearTimeout(timer);
    }, [autoMissedToast]);

    const handleGenerate = async () => {
        try {
            setLoading(true);
            setInfoBanner(null);
            await generateOccurrencesForDate(selectedDate);
            await loadData();
        } catch (err) {
            setError((err as Error).message);
            setLoading(false);
        }
    };

    const refreshHistoryIfOpen = async (occurrenceId: number) => {
        if (openHistoryId === occurrenceId) {
            const items = await getOccurrenceHistory(occurrenceId);
            setHistoryMap((prev) => ({ ...prev, [occurrenceId]: items }));
        }
    };

    const handleStatusUpdate = async (occurrenceId: number, status: 'Done' | 'Not Done' | 'Skipped') => {
        try {
            setActionLoading(occurrenceId);
            setInfoBanner(null);
            await updateOccurrenceStatus(occurrenceId, status);
            await loadData();
            await refreshHistoryIfOpen(occurrenceId);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const openCarryForwardModal = (occ: Occurrence) => {
        const baseDate = occ.occurrence_date || selectedDate;
        setCfDate(shiftDateStr(baseDate, 1));
        const initialStart = toInputTime(occ.start_time);
        setCfStartTime(initialStart);

        if (occ.end_time) {
            setCfTimingMode('end_time');
            setCfEndTime(toInputTime(occ.end_time));
            setCfDuration(occ.duration_minutes || 30);
        } else {
            setCfTimingMode('duration');
            setCfDuration(occ.duration_minutes || 30);
            setCfEndTime('08:30');
        }
        setCarryForwardTarget(occ);
    };

    const handleConfirmCarryForward = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!carryForwardTarget) return;

        try {
            setCfSubmitting(true);
            setActionLoading(carryForwardTarget.occurrence_id);
            setError(null);

            const payload: CarryForwardPayload = {
                target_date: cfDate,
                start_time: `${cfStartTime}:00`,
                end_time: cfTimingMode === 'end_time' ? `${cfEndTime}:00` : null,
                duration_minutes: cfTimingMode === 'duration' ? Number(cfDuration) : null,
            };

            const res = await carryForwardOccurrence(carryForwardTarget.occurrence_id, payload);
            setInfoBanner(res.message || `Occurrence carried forward to ${cfDate}.`);
            const closedId = carryForwardTarget.occurrence_id;
            setCarryForwardTarget(null);
            await loadData();
            await refreshHistoryIfOpen(closedId);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCfSubmitting(false);
            setActionLoading(null);
        }
    };

    const handleToggleHistory = async (occurrenceId: number) => {
        if (openHistoryId === occurrenceId) {
            setOpenHistoryId(null);
            return;
        }
        setOpenHistoryId(occurrenceId);
        try {
            setHistoryLoadingId(occurrenceId);
            const items = await getOccurrenceHistory(occurrenceId);
            setHistoryMap((prev) => ({ ...prev, [occurrenceId]: items }));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setHistoryLoadingId(null);
        }
    };

    // Live counts for status filter badges
    const statusCounts = useMemo(() => {
        return {
            ALL: occurrences.length,
            Pending: occurrences.filter((o) => o.status === 'Pending' || o.status === 'Carried Over').length,
            Done: occurrences.filter((o) => o.status === 'Done').length,
            'Not Done': occurrences.filter((o) => o.status === 'Not Done').length,
            Skipped: occurrences.filter((o) => o.status === 'Skipped').length,
        };
    }, [occurrences]);

    // Combined Status + Priority filtered list
    const filteredOccurrences = useMemo(() => {
        return occurrences.filter((occ) => {
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'Pending'
                        ? occ.status === 'Pending' || occ.status === 'Carried Over'
                        : occ.status === statusFilter;

            const occPriority = occ.priority_snapshot || occ.priority || 'Medium';
            const matchesPriority = priorityFilter === 'ALL' || occPriority === priorityFilter;

            return matchesStatus && matchesPriority;
        });
    }, [occurrences, statusFilter, priorityFilter]);

    const isToday = selectedDate === todayStr;

    return (
        <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            {/* Option A: Top-Anchored Amber Glass Toast */}
            {autoMissedToast && (
                <div
                    role="status"
                    className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg rounded-2xl bg-amber-50/95 dark:bg-amber-950/90 backdrop-blur-md border border-amber-300 dark:border-amber-700 shadow-xl overflow-hidden transition-all"
                >
                    <div className="p-3.5 sm:p-4 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-100">
                                {autoMissedToast.count} unattended past {autoMissedToast.count === 1 ? 'habit' : 'habits'} marked Missed
                            </p>
                            <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5 leading-relaxed">
                                {autoMissedToast.names.slice(0, 3).join(', ')}
                                {autoMissedToast.names.length > 3 ? ` +${autoMissedToast.names.length - 3} more` : ''} — excluded from goal progress.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setAutoMissedToast(null)}
                            className="text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline shrink-0"
                        >
                            Dismiss
                        </button>
                    </div>
                    <div className="h-1 w-full bg-amber-200/60 dark:bg-amber-900/60">
                        <div className="h-full bg-amber-500 dark:bg-amber-400 animate-[shrink_6s_linear_forwards]" />
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Daily Occurrences</h2>
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                        {formatFriendlyDate(selectedDate, todayStr)}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleGenerate}
                    className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-sm font-medium rounded-xl transition-colors text-center"
                >
                    Generate {isToday ? "Today's" : "Date's"} Habits
                </button>
            </div>

            {/* Date Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6 p-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setSelectedDate((prev) => shiftDateStr(prev, -1))}
                        aria-label="Previous Day"
                        className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                            if (e.target.value) setSelectedDate(e.target.value);
                        }}
                        aria-label="Select Date"
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />

                    <button
                        type="button"
                        onClick={() => setSelectedDate((prev) => shiftDateStr(prev, 1))}
                        aria-label="Next Day"
                        className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {!isToday && (
                    <button
                        type="button"
                        onClick={() => setSelectedDate(todayStr)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
                    >
                        Jump to Today
                    </button>
                )}
            </div>

            {infoBanner && (
                <div className="p-3.5 mb-5 text-sm text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center justify-between gap-2">
                    <span>{infoBanner}</span>
                    <button
                        type="button"
                        onClick={() => setInfoBanner(null)}
                        className="text-xs font-semibold underline shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 mb-5 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl w-full">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Score Summary Card */}
            {scoreSummary && (
                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 text-center">
                    <div>
                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Total</p>
                        <p className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">{String(scoreSummary.total_occurrences)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Potential</p>
                        <p className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">{scoreSummary.total_potential_score} pts</p>
                    </div>
                    <div>
                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Efficiency</p>
                        <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400">{scoreSummary.total_earned_percentage}%</p>
                    </div>
                </div>
            )}

            {/* Status & Priority Filter Controls */}
            {occurrences.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {(
                            [
                                { key: 'ALL', label: 'All' },
                                { key: 'Pending', label: 'Pending' },
                                { key: 'Done', label: 'Done' },
                                { key: 'Not Done', label: 'Missed' },
                                { key: 'Skipped', label: 'Skipped' },
                            ] as { key: StatusFilter; label: string }[]
                        ).map(({ key, label }) => {
                            const active = statusFilter === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setStatusFilter(key)}
                                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${active
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {label} ({statusCounts[key]})
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <label htmlFor="priority-filter" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Priority:
                        </label>
                        <select
                            id="priority-filter"
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                            className="px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="ALL">All Priorities</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                </div>
            )}

            {loading && occurrences.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading occurrences for {selectedDate}...</p>
            ) : occurrences.length === 0 ? (
                <div className="text-center py-10 px-4 bg-gray-50/70 dark:bg-gray-700/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                        No habits scheduled for{' '}
                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                            {formatFriendlyDate(selectedDate, todayStr)}
                        </span>{' '}
                        yet.
                    </p>
                    <button
                        type="button"
                        onClick={() => onNavigateToHabits?.()}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline underline-offset-4 transition-colors"
                    >
                        <span>Let&apos;s get started</span>
                        <span aria-hidden="true">&rarr;</span>
                    </button>
                </div>
            ) : filteredOccurrences.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400 mb-3">No occurrences match the current filters.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setStatusFilter('ALL');
                            setPriorityFilter('ALL');
                        }}
                        className="px-4 py-2 text-xs font-medium rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        Reset Filters
                    </button>
                </div>
            ) : (
                <ul className="space-y-3 sm:space-y-4">
                    {filteredOccurrences.map((occ) => {
                        const isDone = occ.status === 'Done';
                        const isSkipped = occ.status === 'Skipped';
                        const isNotDone = occ.status === 'Not Done';
                        const isCarriedOver = occ.status === 'Carried Over';
                        const attempts = occ.carry_forward_attempt ?? 0;
                        const isLocked = Boolean((occ as any).is_locked);
                        const canCarryForward =
                            !isLocked && ['Pending', 'Not Done', 'Incomplete'].includes(occ.status) && attempts < 3;
                        const isHistoryOpen = openHistoryId === occ.occurrence_id;
                        const historyItems = historyMap[occ.occurrence_id] || [];

                        return (
                            <li
                                key={occ.occurrence_id}
                                className={`p-3.5 sm:p-4 border rounded-xl transition-colors ${isDone ? 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' :
                                    isSkipped || isCarriedOver ? 'bg-gray-100 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 opacity-80' :
                                        isNotDone ? 'bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                                            'bg-gray-50/50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-700 hover:shadow-sm'
                                    }`}
                            >
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 sm:gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-semibold text-base text-gray-800 dark:text-gray-100 wrap-break-word">
                                                {occ.habit_name_snapshot || occ.habit_name}
                                            </h3>
                                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium shrink-0 ${(occ.priority_snapshot || occ.priority) === 'High' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                                                (occ.priority_snapshot || occ.priority) === 'Medium' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                                                    'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                                }`}>
                                                {occ.priority_snapshot || occ.priority}
                                            </span>
                                            {attempts > 0 && (
                                                <span className="px-2 py-0.5 text-[11px] rounded-full font-semibold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                                                    Carried Forward ({attempts}/3)
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Category: {occ.category_snapshot || 'General'} {occ.start_time ? `• Time: ${occ.start_time}` : ''}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-3 mt-1">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                                Status: <span className="uppercase">{occ.status}</span>
                                            </p>
                                            {isLocked && (
                                                <span
                                                    title="Locked 6 hours after status was recorded"
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-gray-200/80 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                >
                                                    Locked (6h+)
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleToggleHistory(occ.occurrence_id)}
                                                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                            >
                                                {isHistoryOpen ? 'Hide History' : 'Audit History'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                                        <button
                                            type="button"
                                            disabled={isLocked || actionLoading === occ.occurrence_id}
                                            title={isLocked ? 'Locked 6 hours after status was recorded' : undefined}
                                            onClick={() => handleStatusUpdate(occ.occurrence_id, 'Done')}
                                            className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors text-center disabled:opacity-45 disabled:cursor-not-allowed ${isDone
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400'
                                                }`}
                                        >
                                            Done
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isLocked || actionLoading === occ.occurrence_id}
                                            title={isLocked ? 'Locked 6 hours after status was recorded' : undefined}
                                            onClick={() => handleStatusUpdate(occ.occurrence_id, 'Not Done')}
                                            className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors text-center disabled:opacity-45 disabled:cursor-not-allowed ${isNotDone
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                                                }`}
                                        >
                                            Missed
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isLocked || actionLoading === occ.occurrence_id}
                                            title={isLocked ? 'Locked 6 hours after status was recorded' : undefined}
                                            onClick={() => handleStatusUpdate(occ.occurrence_id, 'Skipped')}
                                            className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors text-center disabled:opacity-45 disabled:cursor-not-allowed ${isSkipped
                                                ? 'bg-gray-600 text-white shadow-sm'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                }`}
                                        >
                                            Skip
                                        </button>
                                        {['Pending', 'Not Done', 'Incomplete'].includes(occ.status) && (
                                            <button
                                                type="button"
                                                disabled={!canCarryForward || actionLoading === occ.occurrence_id}
                                                onClick={() => openCarryForwardModal(occ)}
                                                title={
                                                    isLocked
                                                        ? 'Locked 6 hours after status was recorded'
                                                        : canCarryForward
                                                            ? 'Reschedule this occurrence to a future date'
                                                            : 'Maximum 3 carry-forward attempts reached'
                                                }
                                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {attempts >= 3 ? 'Max Rollovers' : 'Carry Forward'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Audit History Drawer */}
                                {isHistoryOpen && (
                                    <div className="mt-3 pt-3 border-t border-gray-200/80 dark:border-gray-600/80">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                            Status Audit Trail
                                        </p>
                                        {historyLoadingId === occ.occurrence_id ? (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Loading history...</p>
                                        ) : historyItems.length === 0 ? (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                No status transitions recorded yet.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1.5">
                                                {historyItems.map((item) => (
                                                    <li
                                                        key={item.history_id}
                                                        className="flex flex-wrap items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-600/60"
                                                    >
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="font-medium text-gray-500 dark:text-gray-400">
                                                                {item.old_status || 'Created'}
                                                            </span>
                                                            <span className="text-gray-400">&rarr;</span>
                                                            <span className="font-semibold text-gray-800 dark:text-gray-100">
                                                                {item.new_status}
                                                            </span>
                                                            {item.reason && (
                                                                <span className="text-gray-500 dark:text-gray-400">
                                                                    ({item.reason})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                                            {item.changed_at} • {item.changed_by_type}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Custom Carry-Forward Modal */}
            {carryForwardTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl p-5 space-y-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">
                                Carry Forward Habit
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Reschedule{' '}
                                <span className="font-semibold text-gray-800 dark:text-gray-200">
                                    {carryForwardTarget.habit_name_snapshot || carryForwardTarget.habit_name}
                                </span>{' '}
                                (Attempt {(carryForwardTarget.carry_forward_attempt ?? 0) + 1}/3)
                            </p>
                        </div>

                        <form onSubmit={handleConfirmCarryForward} className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Target Date
                                </label>
                                <input
                                    type="date"
                                    required
                                    min={shiftDateStr(carryForwardTarget.occurrence_date || selectedDate, 1)}
                                    value={cfDate}
                                    onChange={(e) => setCfDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Start Time
                                    </label>
                                    <input
                                        type="time"
                                        required
                                        value={cfStartTime}
                                        onChange={(e) => setCfStartTime(e.target.value)}
                                        className="w-full px-2.5 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Timing Type
                                    </label>
                                    <select
                                        value={cfTimingMode}
                                        onChange={(e) => setCfTimingMode(e.target.value as 'duration' | 'end_time')}
                                        className="w-full px-2.5 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="duration">Duration (mins)</option>
                                        <option value="end_time">End Time</option>
                                    </select>
                                </div>

                                {cfTimingMode === 'duration' ? (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Minutes
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={1439}
                                            required
                                            value={cfDuration}
                                            onChange={(e) => setCfDuration(Number(e.target.value))}
                                            className="w-full px-2.5 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            End Time
                                        </label>
                                        <input
                                            type="time"
                                            required
                                            value={cfEndTime}
                                            onChange={(e) => setCfEndTime(e.target.value)}
                                            className="w-full px-2.5 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <button
                                    type="button"
                                    disabled={cfSubmitting}
                                    onClick={() => setCarryForwardTarget(null)}
                                    className="px-3.5 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={cfSubmitting}
                                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-50"
                                >
                                    {cfSubmitting ? 'Carrying Forward...' : 'Confirm Carry Forward'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};