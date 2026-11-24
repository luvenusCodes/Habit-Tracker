import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Occurrence, OccurrenceHistoryItem } from '../types';
import {
    getOccurrencesByDate,
    generateOccurrencesForDate,
    updateOccurrenceStatus,
    getScoreSummary,
    carryForwardOccurrence,
    getOccurrenceHistory,
} from '../services/api';

type StatusFilter = 'ALL' | 'Pending' | 'Done' | 'Not Done' | 'Skipped';
type PriorityFilter = 'ALL' | 'High' | 'Medium' | 'Low';

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

export const OccurrenceTracker = () => {
    const todayStr = useMemo(() => getLocalDateStr(), []);
    const [selectedDate, setSelectedDate] = useState<string>(todayStr);

    const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
    const [scoreSummary, setScoreSummary] = useState<{ total_occurrences: number; total_potential_score: number; total_earned_percentage: number } | null>(null);

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

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const occData = await getOccurrencesByDate(selectedDate);
            setOccurrences(occData.occurrences || []);

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

    const handleCarryForward = async (occurrenceId: number) => {
        try {
            setActionLoading(occurrenceId);
            setError(null);
            const res = await carryForwardOccurrence(occurrenceId);
            setInfoBanner(res.message || 'Occurrence carried forward to tomorrow.');
            await loadData();
            await refreshHistoryIfOpen(occurrenceId);
        } catch (err) {
            setError((err as Error).message);
        } finally {
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
                <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400 mb-3">
                        No occurrences generated for <span className="font-medium text-gray-700 dark:text-gray-200">{selectedDate}</span> yet.
                    </p>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                    >
                        Generate Occurrences Now
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
                        const canCarryForward =
                            ['Pending', 'Not Done', 'Incomplete'].includes(occ.status) && attempts < 3;
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
                                                <span className="px-2 py-0.5 text-[11px] rounded-full font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                    Carry-Forward {attempts}/3
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
                                            disabled={actionLoading === occ.occurrence_id}
                                            onClick={() => handleStatusUpdate(occ.occurrence_id, 'Done')}
                                            className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors text-center ${isDone
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400'
                                                }`}
                                        >
                                            Done
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionLoading === occ.occurrence_id}
                                            onClick={() => handleStatusUpdate(occ.occurrence_id, 'Not Done')}
                                            className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors text-center ${isNotDone
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                                                }`}
                                        >
                                            Missed
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionLoading === occ.occurrence_id}
                                            onClick={() => handleStatusUpdate(occ.occurrence_id, 'Skipped')}
                                            className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors text-center ${isSkipped
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
                                                onClick={() => handleCarryForward(occ.occurrence_id)}
                                                title={
                                                    canCarryForward
                                                        ? 'Roll this occurrence forward to tomorrow'
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
                                                            <span className="text-gray-400">→</span>
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
        </div>
    );
};