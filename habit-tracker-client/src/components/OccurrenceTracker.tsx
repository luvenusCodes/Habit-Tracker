import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type {
    Occurrence,
    OccurrenceHistoryItem,
    UnattendedOverdueItem,
} from '../types';
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

const INSPIRATIONAL_QUOTES = [
    'Small steps, repeated daily, become unstoppable.',
    'Discipline is choosing what you want most over what you want now.',
    'Win the hour in front of you.',
    'Consistency turns ordinary effort into extraordinary results.',
    'Show up today—especially when motivation is quiet.',
    'Progress compounds when you refuse to break the chain.',
    'Focus on the system; the outcomes will follow.',
];

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

// Play a subtle pleasant two-tone chime using Web Audio API when focus timer completes
function playFocusCompleteChime() {
    try {
        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const playNote = (freq: number, startOffset: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
            gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
            gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + startOffset + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + startOffset);
            osc.stop(ctx.currentTime + startOffset + duration);
        };

        playNote(587.33, 0, 0.45); // D5
        playNote(880.0, 0.22, 0.65); // A5
    } catch {
        // Ignore if browser blocks audio
    }
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

    // Strictly > 24h unattended overdue items from backend
    const [unattendedItems, setUnattendedItems] = useState<UnattendedOverdueItem[]>([]);
    const [unattendedBusyId, setUnattendedBusyId] = useState<number | null>(null);
    const [dismissingAllUnattended, setDismissingAllUnattended] = useState<boolean>(false);

    // Hero Greeting, Live Clock & Rotating Short Inspirational Quote
    const [nowTime, setNowTime] = useState<Date>(() => new Date());
    const [quoteIndex, setQuoteIndex] = useState<number>(() =>
        Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length)
    );

    // Interactive Editable Focus Timer Widget
    const [focusDurationMins, setFocusDurationMins] = useState<number>(25);
    const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
    const [timerRunning, setTimerRunning] = useState<boolean>(false);
    const [editingFocusTime, setEditingFocusTime] = useState<boolean>(false);
    const [customMinutesInput, setCustomMinutesInput] = useState<string>('25');
    const [focusCompleteModal, setFocusCompleteModal] = useState<{
        completedMinutes: number;
    } | null>(null);
    const focusCompletedRef = useRef<boolean>(false);

    // Filters
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

    // Custom Carry-Forward modal state
    const [carryForwardTarget, setCarryForwardTarget] = useState<{
        occurrence_id: number;
        habit_name: string;
        occurrence_date: string;
        start_time?: string | null;
        end_time?: string | null;
        duration_minutes?: number | null;
        carry_forward_attempt: number;
        isFromUnattended?: boolean;
    } | null>(null);
    const [cfDate, setCfDate] = useState<string>('');
    const [cfStartTime, setCfStartTime] = useState<string>('08:00');
    const [cfTimingMode, setCfTimingMode] = useState<'duration' | 'end_time'>('duration');
    const [cfDuration, setCfDuration] = useState<number>(30);
    const [cfEndTime, setCfEndTime] = useState<string>('08:30');
    const [cfSubmitting, setCfSubmitting] = useState<boolean>(false);

    // Keep live clock updated every 30s
    useEffect(() => {
        const id = setInterval(() => setNowTime(new Date()), 30000);
        return () => clearInterval(id);
    }, []);

    // Focus Timer countdown tick + pop-up notification on completion
    useEffect(() => {
        if (!timerRunning) return;
        focusCompletedRef.current = false;

        const interval = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    setTimerRunning(false);
                    if (!focusCompletedRef.current) {
                        focusCompletedRef.current = true;
                        playFocusCompleteChime();
                        setFocusCompleteModal({ completedMinutes: focusDurationMins });
                        if (
                            typeof Notification !== 'undefined' &&
                            Notification.permission === 'granted'
                        ) {
                            new Notification('Focus Session Complete!', {
                                body: `You completed your ${focusDurationMins}-minute Deep Work block.`,
                            });
                        }
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [timerRunning, focusDurationMins]);

    const handleSelectFocusDuration = (mins: number) => {
        const validMins = Math.max(1, Math.min(240, Math.round(mins)));
        setTimerRunning(false);
        setFocusDurationMins(validMins);
        setCustomMinutesInput(String(validMins));
        setSecondsLeft(validMins * 60);
        setEditingFocusTime(false);
    };

    const handleSaveCustomFocusTime = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = parseInt(customMinutesInput, 10);
        if (isNaN(parsed) || parsed < 1) return;
        handleSelectFocusDuration(parsed);
    };

    const handleToggleTimer = () => {
        // Request desktop notification permission subtly on first start
        if (
            !timerRunning &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'default'
        ) {
            Notification.requestPermission().catch(() => { });
        }
        if (secondsLeft === 0) {
            setSecondsLeft(focusDurationMins * 60);
        }
        setEditingFocusTime(false);
        setTimerRunning((prev) => !prev);
    };

    const handleCycleQuote = () => {
        setQuoteIndex((prev) => (prev + 1) % INSPIRATIONAL_QUOTES.length);
    };

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [occData, scoreData] = await Promise.all([
                getOccurrencesByDate(selectedDate),
                getScoreSummary(selectedDate),
            ]);

            setOccurrences(occData.occurrences || []);

            const overdueList = occData.unattended_overdue?.items ?? [];
            setUnattendedItems(overdueList);

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

    const handleStatusUpdate = async (
        occurrenceId: number,
        status: 'Done' | 'Not Done' | 'Skipped'
    ) => {
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

    const handleUnattendedResolve = async (
        item: UnattendedOverdueItem,
        action: 'Done' | 'Skipped'
    ) => {
        try {
            setUnattendedBusyId(item.occurrence_id);
            setError(null);
            const reason =
                action === 'Done'
                    ? 'Resolved late (>24h unattended) as Done'
                    : 'Skipped by user (>24h unattended)';
            await updateOccurrenceStatus(item.occurrence_id, action, reason);
            setInfoBanner(`"${item.habit_name_snapshot}" marked as ${action}.`);
            await loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setUnattendedBusyId(null);
        }
    };

    const handleDismissAndAutoSkipAll = async () => {
        if (unattendedItems.length === 0) return;
        try {
            setDismissingAllUnattended(true);
            setError(null);
            const count = unattendedItems.length;
            await Promise.all(
                unattendedItems.map((item) =>
                    updateOccurrenceStatus(
                        item.occurrence_id,
                        'Skipped',
                        'Auto-skipped (unattended > 24h)'
                    )
                )
            );
            setUnattendedItems([]);
            setInfoBanner(
                `${count} unattended ${count === 1 ? 'habit' : 'habits'} automatically marked as Skipped.`
            );
            await loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDismissingAllUnattended(false);
        }
    };

    const openCarryForwardModal = (target: {
        occurrence_id: number;
        habit_name: string;
        occurrence_date: string;
        start_time?: string | null;
        end_time?: string | null;
        duration_minutes?: number | null;
        carry_forward_attempt: number;
        isFromUnattended?: boolean;
    }) => {
        const minTargetDate = target.isFromUnattended
            ? todayStr
            : shiftDateStr(target.occurrence_date || selectedDate, 1);

        setCfDate(minTargetDate);
        const initialStart = toInputTime(target.start_time);
        setCfStartTime(initialStart);

        if (target.end_time) {
            setCfTimingMode('end_time');
            setCfEndTime(toInputTime(target.end_time));
            setCfDuration(target.duration_minutes || 30);
        } else {
            setCfTimingMode('duration');
            setCfDuration(target.duration_minutes || 30);
            setCfEndTime('08:30');
        }
        setCarryForwardTarget(target);
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

    const statusCounts = useMemo(() => {
        return {
            ALL: occurrences.length,
            Pending: occurrences.filter(
                (o) => o.status === 'Pending' || o.status === 'Carried Over'
            ).length,
            Done: occurrences.filter((o) => o.status === 'Done').length,
            'Not Done': occurrences.filter((o) => o.status === 'Not Done').length,
            Skipped: occurrences.filter((o) => o.status === 'Skipped').length,
        };
    }, [occurrences]);

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

    const greetingText = useMemo(() => {
        const hr = nowTime.getHours();
        if (hr < 12) return 'Good Morning';
        if (hr < 18) return 'Good Afternoon';
        return 'Good Evening';
    }, [nowTime]);

    const formattedClock = useMemo(() => {
        return nowTime.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        });
    }, [nowTime]);

    const [selYear, selMonth, selDay] = selectedDate.split('-').map(Number);
    const selectedDateObj = new Date(selYear, selMonth - 1, selDay);
    const fullDateHeader = selectedDateObj.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const weekdayHeader = selectedDateObj.toLocaleDateString(undefined, {
        weekday: 'long',
    });

    const isToday = selectedDate === todayStr;

    // Productivity Donut Calculations
    const doneCount = statusCounts.Done;
    const totalCount = occurrences.length;
    const efficiencyPct =
        scoreSummary && scoreSummary.total_occurrences > 0
            ? Math.round(scoreSummary.total_earned_percentage)
            : totalCount > 0
                ? Math.round((doneCount / totalCount) * 100)
                : 0;

    const donutRadius = 42;
    const donutCirc = 2 * Math.PI * donutRadius;
    const donutOffset = donutCirc - (Math.min(100, efficiencyPct) / 100) * donutCirc;

    // Focus Timer Ring Calculations
    const totalFocusSeconds = focusDurationMins * 60;
    const focusProgress =
        totalFocusSeconds > 0 ? (totalFocusSeconds - secondsLeft) / totalFocusSeconds : 0;
    const focusMinsDisplay = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const focusSecsDisplay = String(secondsLeft % 60).padStart(2, '0');
    const timerRadius = 42;
    const timerCirc = 2 * Math.PI * timerRadius;
    const timerOffset = timerCirc * (1 - focusProgress);

    return (
        <div className="relative space-y-6 pb-8">
            {/* Ambient Atmospheric Glow Orbs */}
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 overflow-hidden -z-10"
            >
                <div className="absolute top-12 left-1/4 w-96 h-96 rounded-full bg-blue-500/12 dark:bg-blue-500/14 blur-3xl" />
                <div className="absolute top-1/3 right-1/5 w-96 h-96 rounded-full bg-orange-500/10 dark:bg-orange-500/12 blur-3xl" />
                <div className="absolute bottom-16 left-1/3 w-80 h-80 rounded-full bg-indigo-500/10 dark:bg-indigo-500/14 blur-3xl" />
            </div>

            {/* FOCUS SESSION COMPLETE POP-UP NOTIFICATION MODAL */}
            {focusCompleteModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                >
                    <div className="relative w-full max-w-sm rounded-3xl backdrop-blur-xl bg-white/95 dark:bg-[#161a29]/95 border border-orange-300/60 dark:border-orange-400/30 shadow-2xl p-6 text-center space-y-4 overflow-hidden">
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-orange-500/20 blur-2xl"
                        />

                        <div className="relative z-10 w-14 h-14 mx-auto rounded-2xl bg-orange-500/15 border border-orange-400/40 text-orange-500 dark:text-orange-300 flex items-center justify-center shadow-inner">
                            <svg
                                className="w-7 h-7"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>

                        <div className="relative z-10 space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">
                                Deep Work Complete
                            </span>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white">
                                Focus Session Finished!
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300">
                                Great discipline—you just completed a{' '}
                                <span className="font-bold text-gray-900 dark:text-white">
                                    {focusCompleteModal.completedMinutes}-minute
                                </span>{' '}
                                focus block. Ready to check off your habit or take a quick breather?
                            </p>
                        </div>

                        <div className="relative z-10 flex items-center justify-center gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setFocusCompleteModal(null);
                                    setSecondsLeft(focusDurationMins * 60);
                                }}
                                className="flex-1 py-2.5 px-4 rounded-full text-xs font-bold border border-gray-200 dark:border-white/15 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            >
                                Dismiss
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setFocusCompleteModal(null);
                                    setSecondsLeft(focusDurationMins * 60);
                                    setTimerRunning(true);
                                }}
                                className="flex-1 py-2.5 px-4 rounded-full text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white shadow-md shadow-orange-500/25 transition-colors"
                            >
                                Start Another
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STRICT >24H UNATTENDED OVERDUE PROMPT (ONLY RENDERED WHEN unattendedItems.length > 0) */}
            {unattendedItems.length > 0 && (
                <div
                    role="alert"
                    className="relative overflow-hidden rounded-3xl backdrop-blur-xl bg-amber-50/90 dark:bg-[#231b15]/90 border border-amber-300/90 dark:border-amber-500/35 shadow-xl p-5 space-y-4"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/35 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-sm sm:text-base font-extrabold text-amber-950 dark:text-amber-100">
                                        {unattendedItems.length} Unattended{' '}
                                        {unattendedItems.length === 1 ? 'Habit' : 'Habits'} Overdue (&gt;24h)
                                    </h3>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300">
                                        Action Required
                                    </span>
                                </div>
                                <p className="text-xs text-amber-900/80 dark:text-amber-200/75 mt-0.5">
                                    Resolve these overdue occurrences below, or dismiss to automatically mark them as Skipped.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            disabled={dismissingAllUnattended}
                            onClick={handleDismissAndAutoSkipAll}
                            className="self-start sm:self-center px-3.5 py-2 rounded-full text-xs font-bold bg-amber-900/10 hover:bg-amber-900/20 dark:bg-white/10 dark:hover:bg-white/15 text-amber-950 dark:text-amber-200 transition-colors shrink-0 disabled:opacity-50"
                        >
                            {dismissingAllUnattended
                                ? 'Auto-Skipping...'
                                : 'Dismiss & Auto-Skip All'}
                        </button>
                    </div>

                    <ul className="space-y-2">
                        {unattendedItems.map((item) => {
                            const isBusy = unattendedBusyId === item.occurrence_id;
                            const canCarry = (item.carry_forward_attempt ?? 0) < 3;

                            return (
                                <li
                                    key={item.occurrence_id}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/80 dark:bg-black/30 border border-amber-200/80 dark:border-white/10"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                                {item.habit_name_snapshot}
                                            </span>
                                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                                {item.hours_overdue}h overdue
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                            Scheduled: {item.occurrence_date}
                                            {item.start_time ? ` at ${toInputTime(item.start_time)}` : ''} •{' '}
                                            {item.category_snapshot}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            disabled={isBusy || dismissingAllUnattended}
                                            onClick={() => handleUnattendedResolve(item, 'Done')}
                                            className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                                        >
                                            Done
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                !canCarry || isBusy || dismissingAllUnattended
                                            }
                                            onClick={() =>
                                                openCarryForwardModal({
                                                    occurrence_id: item.occurrence_id,
                                                    habit_name: item.habit_name_snapshot,
                                                    occurrence_date: item.occurrence_date,
                                                    start_time: item.start_time,
                                                    end_time: item.end_time,
                                                    duration_minutes: item.duration_minutes,
                                                    carry_forward_attempt:
                                                        item.carry_forward_attempt,
                                                    isFromUnattended: true,
                                                })
                                            }
                                            className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 border border-amber-400/30 transition-colors disabled:opacity-40"
                                        >
                                            {canCarry ? 'Carry Forward' : 'Max Rollovers'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isBusy || dismissingAllUnattended}
                                            onClick={() =>
                                                handleUnattendedResolve(item, 'Skipped')
                                            }
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-200/80 hover:bg-gray-300/80 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                                        >
                                            Skip
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* TOP BENTO ROW: HERO GREETING & ROTATING QUOTE + DATE & SCHEDULE CONTROLS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Hero Greeting Card (7 cols) */}
                <div className="lg:col-span-7 relative overflow-hidden rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-[#131724]/85 border border-gray-200/80 dark:border-white/10 p-6 flex flex-col justify-between min-h-48 shadow-sm">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-12 -left-12 w-56 h-56 rounded-full bg-blue-500/15 blur-2xl"
                    />

                    <div className="relative z-10 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                                {greetingText},
                            </p>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mt-0.5">
                                Let&apos;s Build Momentum
                            </h1>
                        </div>

                        <span className="px-3.5 py-1.5 rounded-full text-xs font-bold backdrop-blur-md bg-gray-900/5 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-gray-800 dark:text-slate-200 shrink-0">
                            {formattedClock}
                        </span>
                    </div>

                    {/* Short Rotating Inspirational Quote */}
                    <div className="relative z-10 mt-5 flex items-center justify-between gap-3 max-w-lg">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-slate-300 leading-relaxed">
                            &ldquo;{INSPIRATIONAL_QUOTES[quoteIndex]}&rdquo;
                        </p>
                        <button
                            type="button"
                            onClick={handleCycleQuote}
                            title="Show another quote"
                            aria-label="Show another inspirational quote"
                            className="p-2 rounded-full text-gray-400 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Luminous Constellation Wave SVG */}
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 400 70"
                        className="pointer-events-none w-full h-14 mt-2 overflow-visible"
                    >
                        <defs>
                            <linearGradient id="constellationGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
                                <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.9" />
                                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.2" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M 10 55 Q 85 45, 145 35 T 275 20 T 390 10"
                            fill="none"
                            stroke="url(#constellationGrad)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                        />
                        <circle cx="95" cy="43" r="3" className="fill-blue-400" />
                        <circle cx="195" cy="28" r="4" className="fill-sky-300" />
                        <circle cx="295" cy="18" r="3" className="fill-indigo-400" />
                    </svg>
                </div>

                {/* Date & Generation Control Card (5 cols) */}
                <div className="lg:col-span-5 relative overflow-hidden rounded-3xl backdrop-blur-xl bg-linear-to-br from-blue-500/10 via-white/75 to-indigo-500/10 dark:from-[#1b2845]/90 dark:via-[#141927]/90 dark:to-[#131724]/90 border border-gray-200/80 dark:border-white/10 p-6 flex flex-col justify-between shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                {fullDateHeader}
                            </h2>
                            <p className="text-xs font-medium text-blue-600 dark:text-blue-300 mt-0.5">
                                {weekdayHeader} • {formatFriendlyDate(selectedDate, todayStr)}
                            </p>
                        </div>

                        {!isToday && (
                            <button
                                type="button"
                                onClick={() => setSelectedDate(todayStr)}
                                className="px-3 py-1.5 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors"
                            >
                                Today
                            </button>
                        )}
                    </div>

                    {/* Date Stepper & Picker */}
                    <div className="my-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedDate((prev) => shiftDateStr(prev, -1))}
                            aria-label="Previous Day"
                            className="p-2.5 rounded-2xl bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/15 transition-colors"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 19l-7-7 7-7"
                                />
                            </svg>
                        </button>

                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => {
                                if (e.target.value) setSelectedDate(e.target.value);
                            }}
                            aria-label="Select Date"
                            className="flex-1 px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <button
                            type="button"
                            onClick={() => setSelectedDate((prev) => shiftDateStr(prev, 1))}
                            aria-label="Next Day"
                            className="p-2.5 rounded-2xl bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/15 transition-colors"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleGenerate}
                        className="w-full py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide shadow-md shadow-blue-600/20 transition-colors"
                    >
                        Generate {isToday ? "Today's" : "Date's"} Habits
                    </button>
                </div>
            </div>

            {/* SECOND BENTO ROW: PRODUCTIVITY DONUT + EDITABLE LIVE FOCUS TIMER */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Productivity Ring Card (7 cols) */}
                <div className="lg:col-span-7 overflow-hidden rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-[#131724]/85 border border-gray-200/80 dark:border-white/10 p-5 sm:p-6 flex items-center justify-between gap-3 sm:gap-4 shadow-sm">
                    <div className="min-w-0 space-y-3 sm:space-y-4">
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">
                                Productivity
                            </span>
                            <p className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight mt-1">
                                {efficiencyPct}%
                            </p>
                            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1">
                                {efficiencyPct >= 80
                                    ? 'Great Progress!'
                                    : efficiencyPct >= 40
                                        ? 'Steady Momentum'
                                        : 'Ready to Execute'}
                            </p>
                        </div>

                        <div className="flex items-center gap-3.5 sm:gap-6 pt-1">
                            <div>
                                <p className="text-[11px] leading-tight font-medium text-gray-400 dark:text-slate-400">
                                    Habits Completed
                                </p>
                                <p className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">
                                    {doneCount}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] leading-tight font-medium text-gray-400 dark:text-slate-400">
                                    Total Scheduled
                                </p>
                                <p className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">
                                    {totalCount}
                                </p>
                            </div>
                            {scoreSummary && (
                                <div>
                                    <p className="text-[11px] leading-tight font-medium text-gray-400 dark:text-slate-400">
                                        Potential
                                    </p>
                                    <p className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white mt-0.5">
                                        {scoreSummary.total_potential_score}p
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Gradient Donut Ring */}
                    <div className="relative w-22 h-22 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <defs>
                                <linearGradient id="prodRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#38bdf8" />
                                    <stop offset="100%" stopColor="#818cf8" />
                                </linearGradient>
                            </defs>
                            <circle
                                cx="50"
                                cy="50"
                                r={donutRadius}
                                strokeWidth="10"
                                fill="transparent"
                                className="stroke-gray-200/80 dark:stroke-white/8"
                            />
                            <circle
                                cx="50"
                                cy="50"
                                r={donutRadius}
                                strokeWidth="10"
                                fill="transparent"
                                stroke="url(#prodRingGrad)"
                                strokeDasharray={donutCirc}
                                strokeDashoffset={donutOffset}
                                strokeLinecap="round"
                                className="transition-all duration-500"
                            />
                        </svg>
                    </div>
                </div>

                {/* Editable Live Focus Timer Card (5 cols) */}
                <div className="lg:col-span-5 relative overflow-hidden rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-[#131724]/85 border border-gray-200/80 dark:border-white/10 p-6 flex flex-col items-center justify-between shadow-sm">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -bottom-10 -right-10 w-44 h-44 rounded-full bg-orange-500/15 blur-2xl"
                    />

                    {/* Header with Preset Chips + Custom Edit Trigger */}
                    <div className="w-full flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">
                            Focus Timer
                        </span>
                        <div className="flex items-center gap-1">
                            {[15, 25, 45].map((mins) => (
                                <button
                                    key={mins}
                                    type="button"
                                    onClick={() => handleSelectFocusDuration(mins)}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${!editingFocusTime && focusDurationMins === mins
                                        ? 'bg-orange-500/20 text-orange-600 dark:text-orange-300'
                                        : 'text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300'
                                        }`}
                                >
                                    {mins}m
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => {
                                    setTimerRunning(false);
                                    setCustomMinutesInput(String(focusDurationMins));
                                    setEditingFocusTime((prev) => !prev);
                                }}
                                title="Set custom focus duration"
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${editingFocusTime ||
                                    ![15, 25, 45].includes(focusDurationMins)
                                    ? 'bg-orange-500/20 text-orange-600 dark:text-orange-300'
                                    : 'text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300'
                                    }`}
                            >
                                {![15, 25, 45].includes(focusDurationMins) && !editingFocusTime
                                    ? `${focusDurationMins}m`
                                    : 'Custom'}
                            </button>
                        </div>
                    </div>

                    {/* Custom Duration Inline Editor or Circular Clock Dial */}
                    {editingFocusTime ? (
                        <form
                            onSubmit={handleSaveCustomFocusTime}
                            className="my-3 w-full max-w-56 flex flex-col items-center gap-2.5"
                        >
                            <label
                                htmlFor="custom-focus-minutes"
                                className="text-[11px] font-semibold text-gray-500 dark:text-slate-300"
                            >
                                Set Focus Duration (1–240 mins)
                            </label>
                            <div className="flex items-center gap-2 w-full">
                                <input
                                    id="custom-focus-minutes"
                                    type="number"
                                    min={1}
                                    max={240}
                                    required
                                    autoFocus
                                    value={customMinutesInput}
                                    onChange={(e) => setCustomMinutesInput(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-xl bg-gray-100/90 dark:bg-black/40 border border-orange-400/40 text-center text-base font-black text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                                />
                                <button
                                    type="submit"
                                    className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold shrink-0"
                                >
                                    Set
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingFocusTime(false)}
                                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                            >
                                Cancel
                            </button>
                        </form>
                    ) : (
                        <div
                            onClick={() => {
                                if (!timerRunning) {
                                    setCustomMinutesInput(String(focusDurationMins));
                                    setEditingFocusTime(true);
                                }
                            }}
                            title={
                                timerRunning
                                    ? 'Pause timer to edit duration'
                                    : 'Click to edit focus duration'
                            }
                            className={`relative w-28 h-28 my-2 flex items-center justify-center ${!timerRunning ? 'cursor-pointer group' : ''
                                }`}
                        >
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <defs>
                                    <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#fb923c" />
                                        <stop offset="100%" stopColor="#f97316" />
                                    </linearGradient>
                                </defs>
                                <circle
                                    cx="50"
                                    cy="50"
                                    r={timerRadius}
                                    strokeWidth="6"
                                    fill="transparent"
                                    className="stroke-gray-200/80 dark:stroke-white/10"
                                />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r={timerRadius}
                                    strokeWidth="6"
                                    fill="transparent"
                                    stroke="url(#focusGrad)"
                                    strokeDasharray={timerCirc}
                                    strokeDashoffset={timerOffset}
                                    strokeLinecap="round"
                                    className="transition-all duration-300"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-xl font-black text-gray-900 dark:text-white tabular-nums group-hover:text-orange-500 dark:group-hover:text-orange-300 transition-colors">
                                    {focusMinsDisplay}:{focusSecsDisplay}
                                </span>
                                <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-400 flex items-center gap-0.5">
                                    <span>Deep Work</span>
                                    {!timerRunning && (
                                        <svg
                                            className="w-2.5 h-2.5 opacity-70"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                            />
                                        </svg>
                                    )}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Start / Pause & Reset Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleToggleTimer}
                            className="px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-200 border border-indigo-400/25 transition-colors flex items-center gap-1.5"
                        >
                            <span>{timerRunning ? '❚❚ Pause' : '▶ Start'}</span>
                        </button>
                        {secondsLeft !== focusDurationMins * 60 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setTimerRunning(false);
                                    setSecondsLeft(focusDurationMins * 60);
                                }}
                                className="px-3 py-1.5 rounded-full text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-white"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* FEEDBACK BANNERS */}
            {infoBanner && (
                <div className="p-3.5 text-xs font-medium text-indigo-800 dark:text-indigo-200 backdrop-blur-xl bg-indigo-500/12 border border-indigo-400/30 rounded-2xl flex items-center justify-between gap-2">
                    <span>{infoBanner}</span>
                    <button
                        type="button"
                        onClick={() => setInfoBanner(null)}
                        className="font-bold underline shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="p-3.5 text-xs font-medium text-red-700 dark:text-red-300 backdrop-blur-xl bg-red-500/12 border border-red-400/30 rounded-2xl w-full flex items-center justify-between gap-2">
                    <span>
                        <strong>Error:</strong> {error}
                    </span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="font-bold underline shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* DAILY OCCURRENCES LIST PANEL */}
            <div className="rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-[#131724]/85 border border-gray-200/80 dark:border-white/10 p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            Daily Occurrences ({filteredOccurrences.length})
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            Check off completed sessions, carry forward rollovers, or inspect audit logs.
                        </p>
                    </div>

                    {onNavigateToHabits && (
                        <button
                            type="button"
                            onClick={onNavigateToHabits}
                            className="self-start sm:self-auto px-3.5 py-1.5 rounded-full text-xs font-bold bg-gray-900/5 hover:bg-gray-900/10 dark:bg-white/8 dark:hover:bg-white/14 text-gray-800 dark:text-slate-200 border border-gray-200/80 dark:border-white/12 transition-colors"
                        >
                            + Manage Habits
                        </button>
                    )}
                </div>

                {/* Status & Priority Filter Controls */}
                {occurrences.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-200/70 dark:border-white/10">
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
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${active
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'bg-gray-100/80 dark:bg-white/6 text-gray-600 dark:text-slate-300 hover:bg-gray-200/80 dark:hover:bg-white/12'
                                            }`}
                                    >
                                        {label} ({statusCounts[key]})
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <label
                                htmlFor="priority-filter"
                                className="text-xs font-semibold text-gray-500 dark:text-slate-400"
                            >
                                Priority:
                            </label>
                            <select
                                id="priority-filter"
                                value={priorityFilter}
                                onChange={(e) =>
                                    setPriorityFilter(e.target.value as PriorityFilter)
                                }
                                className="px-3 py-1.5 bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 rounded-full text-xs font-semibold text-gray-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <p className="text-gray-500 dark:text-slate-400 text-center py-8 text-sm">
                        Loading occurrences for {selectedDate}...
                    </p>
                ) : occurrences.length === 0 ? (
                    <div className="text-center py-10 px-4 bg-gray-50/60 dark:bg-white/4 rounded-2xl border border-dashed border-gray-200 dark:border-white/12">
                        <p className="text-sm text-gray-600 dark:text-slate-300 mb-2">
                            No habits scheduled for{' '}
                            <span className="font-bold text-gray-900 dark:text-white">
                                {formatFriendlyDate(selectedDate, todayStr)}
                            </span>{' '}
                            yet.
                        </p>
                        <button
                            type="button"
                            onClick={() => onNavigateToHabits?.()}
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 transition-colors"
                        >
                            <span>Let&apos;s get started</span>
                            <span aria-hidden="true">&rarr;</span>
                        </button>
                    </div>
                ) : filteredOccurrences.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                            No occurrences match the current filters.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setStatusFilter('ALL');
                                setPriorityFilter('ALL');
                            }}
                            className="px-4 py-2 text-xs font-bold rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-950 transition-colors"
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {filteredOccurrences.map((occ) => {
                            const isDone = occ.status === 'Done';
                            const isSkipped = occ.status === 'Skipped';
                            const isNotDone = occ.status === 'Not Done';
                            const isCarriedOver = occ.status === 'Carried Over';
                            const attempts = occ.carry_forward_attempt ?? 0;
                            const isLocked = Boolean(occ.is_locked);
                            const canCarryForward =
                                !isLocked &&
                                ['Pending', 'Not Done', 'Incomplete'].includes(occ.status) &&
                                attempts < 3;
                            const isHistoryOpen = openHistoryId === occ.occurrence_id;
                            const historyItems = historyMap[occ.occurrence_id] || [];

                            return (
                                <li
                                    key={occ.occurrence_id}
                                    className={`p-4 border rounded-2xl transition-all ${isDone
                                        ? 'bg-emerald-500/8 dark:bg-emerald-500/10 border-emerald-300/60 dark:border-emerald-500/25'
                                        : isSkipped || isCarriedOver
                                            ? 'bg-gray-100/70 dark:bg-white/4 border-gray-200/70 dark:border-white/8 opacity-80'
                                            : isNotDone
                                                ? 'bg-red-500/8 dark:bg-red-500/10 border-red-300/60 dark:border-red-500/25'
                                                : 'bg-white/60 dark:bg-white/5 border-gray-200/80 dark:border-white/10 hover:bg-white/90 dark:hover:bg-white/8'
                                        }`}
                                >
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5">
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            {/* Circular Status Check Toggle */}
                                            <button
                                                type="button"
                                                disabled={
                                                    isLocked || actionLoading === occ.occurrence_id
                                                }
                                                onClick={() =>
                                                    handleStatusUpdate(
                                                        occ.occurrence_id,
                                                        isDone ? 'Not Done' : 'Done'
                                                    )
                                                }
                                                aria-label={`Toggle ${occ.habit_name_snapshot}`}
                                                className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center border transition-all shrink-0 disabled:opacity-45 ${isDone
                                                    ? 'bg-blue-500 border-blue-500 text-white shadow-xs'
                                                    : 'border-gray-300 dark:border-white/25 hover:border-blue-400'
                                                    }`}
                                            >
                                                {isDone && (
                                                    <svg
                                                        className="w-3.5 h-3.5"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2.5}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                )}
                                            </button>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3
                                                        className={`font-bold text-sm sm:text-base wrap-break-word ${isDone
                                                            ? 'text-gray-700 dark:text-slate-200'
                                                            : 'text-gray-900 dark:text-white'
                                                            }`}
                                                    >
                                                        {occ.habit_name_snapshot || occ.habit_name}
                                                    </h3>
                                                    <span
                                                        className={`px-2 py-0.5 text-[11px] rounded-full font-semibold shrink-0 ${(occ.priority_snapshot ||
                                                            occ.priority) === 'High'
                                                            ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                                                            : (occ.priority_snapshot ||
                                                                occ.priority) === 'Medium'
                                                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                            }`}
                                                    >
                                                        {occ.priority_snapshot || occ.priority}
                                                    </span>
                                                    {attempts > 0 && (
                                                        <span className="px-2 py-0.5 text-[11px] rounded-full font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                                                            Carried Forward ({attempts}/3)
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                                    {occ.category_snapshot || 'General'}
                                                    {occ.start_time
                                                        ? ` • ${toInputTime(occ.start_time)}`
                                                        : ''}
                                                </p>

                                                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                                    <span
                                                        className={`text-[11px] font-bold uppercase tracking-wider ${isDone
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : isNotDone
                                                                ? 'text-red-600 dark:text-red-400'
                                                                : isSkipped || isCarriedOver
                                                                    ? 'text-gray-500 dark:text-slate-400'
                                                                    : 'text-amber-600 dark:text-amber-400'
                                                            }`}
                                                    >
                                                        {occ.status}
                                                    </span>

                                                    {isLocked && (
                                                        <span
                                                            title="Locked 6 hours after status was recorded"
                                                            className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-200/80 dark:bg-white/10 text-gray-600 dark:text-slate-300"
                                                        >
                                                            Locked (6h+)
                                                        </span>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleToggleHistory(occ.occurrence_id)
                                                        }
                                                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        {isHistoryOpen
                                                            ? 'Hide History'
                                                            : 'Audit History'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Pills */}
                                        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto shrink-0">
                                            <button
                                                type="button"
                                                disabled={
                                                    isLocked || actionLoading === occ.occurrence_id
                                                }
                                                onClick={() =>
                                                    handleStatusUpdate(occ.occurrence_id, 'Done')
                                                }
                                                className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-full transition-colors text-center disabled:opacity-45 disabled:cursor-not-allowed ${isDone
                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                    : 'bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-300'
                                                    }`}
                                            >
                                                Done
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    isLocked || actionLoading === occ.occurrence_id
                                                }
                                                onClick={() =>
                                                    handleStatusUpdate(
                                                        occ.occurrence_id,
                                                        'Not Done'
                                                    )
                                                }
                                                className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-full transition-colors text-center disabled:opacity-45 disabled:cursor-not-allowed ${isNotDone
                                                    ? 'bg-red-600 text-white shadow-xs'
                                                    : 'bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300'
                                                    }`}
                                            >
                                                Missed
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    isLocked || actionLoading === occ.occurrence_id
                                                }
                                                onClick={() =>
                                                    handleStatusUpdate(occ.occurrence_id, 'Skipped')
                                                }
                                                className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-full transition-colors text-center disabled:opacity-45 disabled:cursor-not-allowed ${isSkipped
                                                    ? 'bg-gray-600 text-white shadow-xs'
                                                    : 'bg-white/80 dark:bg-white/8 border border-gray-200/80 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-gray-200/70 dark:hover:bg-white/14'
                                                    }`}
                                            >
                                                Skip
                                            </button>
                                            {['Pending', 'Not Done', 'Incomplete'].includes(
                                                occ.status
                                            ) && (
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            !canCarryForward ||
                                                            actionLoading === occ.occurrence_id
                                                        }
                                                        onClick={() =>
                                                            openCarryForwardModal({
                                                                occurrence_id: occ.occurrence_id,
                                                                habit_name:
                                                                    occ.habit_name_snapshot ||
                                                                    occ.habit_name ||
                                                                    'Habit',
                                                                occurrence_date:
                                                                    occ.occurrence_date || selectedDate,
                                                                start_time: occ.start_time,
                                                                end_time: occ.end_time,
                                                                duration_minutes: occ.duration_minutes,
                                                                carry_forward_attempt: attempts,
                                                            })
                                                        }
                                                        className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        {attempts >= 3
                                                            ? 'Max Rollovers'
                                                            : 'Carry Forward'}
                                                    </button>
                                                )}
                                        </div>
                                    </div>

                                    {/* Audit History Drawer */}
                                    {isHistoryOpen && (
                                        <div className="mt-3.5 pt-3 border-t border-gray-200/70 dark:border-white/10">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                                                Status Audit Trail
                                            </p>
                                            {historyLoadingId === occ.occurrence_id ? (
                                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                                    Loading history...
                                                </p>
                                            ) : historyItems.length === 0 ? (
                                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                                    No status transitions recorded yet.
                                                </p>
                                            ) : (
                                                <ul className="space-y-1.5">
                                                    {historyItems.map((item) => (
                                                        <li
                                                            key={item.history_id}
                                                            className="flex flex-wrap items-center justify-between gap-2 text-xs px-3 py-2 rounded-xl bg-white/80 dark:bg-black/25 border border-gray-200/70 dark:border-white/8"
                                                        >
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="font-medium text-gray-500 dark:text-slate-400">
                                                                    {item.old_status || 'Created'}
                                                                </span>
                                                                <span className="text-gray-400">
                                                                    &rarr;
                                                                </span>
                                                                <span className="font-bold text-gray-800 dark:text-white">
                                                                    {item.new_status}
                                                                </span>
                                                                {item.reason && (
                                                                    <span className="text-gray-500 dark:text-slate-400">
                                                                        ({item.reason})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[11px] text-gray-400 dark:text-slate-500">
                                                                {item.changed_at} •{' '}
                                                                {item.changed_by_type}
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

            {/* Custom Carry-Forward Modal */}
            {carryForwardTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#181c2a] border border-gray-200 dark:border-white/12 shadow-2xl p-6 space-y-4">
                        <div>
                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                                Carry Forward Habit
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                Reschedule{' '}
                                <span className="font-bold text-gray-800 dark:text-slate-200">
                                    {carryForwardTarget.habit_name}
                                </span>{' '}
                                (Attempt {carryForwardTarget.carry_forward_attempt + 1}/3)
                            </p>
                        </div>

                        <form onSubmit={handleConfirmCarryForward} className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                    Target Date
                                </label>
                                <input
                                    type="date"
                                    required
                                    min={
                                        carryForwardTarget.isFromUnattended
                                            ? todayStr
                                            : shiftDateStr(
                                                carryForwardTarget.occurrence_date ||
                                                selectedDate,
                                                1
                                            )
                                    }
                                    value={cfDate}
                                    onChange={(e) => setCfDate(e.target.value)}
                                    className="w-full px-3.5 py-2 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/12 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                        Start Time
                                    </label>
                                    <input
                                        type="time"
                                        required
                                        value={cfStartTime}
                                        onChange={(e) => setCfStartTime(e.target.value)}
                                        className="w-full px-2.5 py-2 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/12 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                        Timing Type
                                    </label>
                                    <select
                                        value={cfTimingMode}
                                        onChange={(e) =>
                                            setCfTimingMode(
                                                e.target.value as 'duration' | 'end_time'
                                            )
                                        }
                                        className="w-full px-2.5 py-2 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/12 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="duration">Duration (mins)</option>
                                        <option value="end_time">End Time</option>
                                    </select>
                                </div>

                                {cfTimingMode === 'duration' ? (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                            Minutes
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={1439}
                                            required
                                            value={cfDuration}
                                            onChange={(e) => setCfDuration(Number(e.target.value))}
                                            className="w-full px-2.5 py-2 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/12 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                            End Time
                                        </label>
                                        <input
                                            type="time"
                                            required
                                            value={cfEndTime}
                                            onChange={(e) => setCfEndTime(e.target.value)}
                                            className="w-full px-2.5 py-2 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/12 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200/70 dark:border-white/10">
                                <button
                                    type="button"
                                    disabled={cfSubmitting}
                                    onClick={() => setCarryForwardTarget(null)}
                                    className="px-4 py-2 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/15 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={cfSubmitting}
                                    className="px-5 py-2 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xs disabled:opacity-50"
                                >
                                    {cfSubmitting
                                        ? 'Carrying Forward...'
                                        : 'Confirm Carry Forward'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};