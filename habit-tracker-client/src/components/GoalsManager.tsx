import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type {
    Goal,
    GoalStatus,
    HabitGoalLink,
    GoalProgressSummary,
    GoalStatusHistoryItem,
} from '../types/goals';
import {
    fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    changeGoalStatus,
    runGoalMaintenance,
    fetchGoalHabits,
    linkHabitToGoal,
    unlinkHabitFromGoal,
    fetchGoalProgressSummary,
    fetchGoalStatusHistory,
    extractApiError,
} from '../services/goalsService';
import { fetchHabits } from '../services/habitService';

interface UserHabitOption {
    habit_id: number;
    habit_name: string;
    status?: string;
}

type GoalWithCount = Goal & { linked_habits_count?: number };

const STATUS_FILTERS: Array<'ALL' | GoalStatus> = [
    'ALL',
    'Active',
    'Planned',
    'Paused',
    'Completed',
    'Expired',
    'Abandoned',
    'Archived',
];

const MANUAL_NEXT_STATUSES: Record<GoalStatus, GoalStatus[]> = {
    Planned: ['Active', 'Abandoned', 'Archived'],
    Active: ['Paused', 'Abandoned', 'Expired'],
    Paused: ['Active', 'Abandoned', 'Archived'],
    Completed: ['Archived'],
    Abandoned: ['Archived'],
    Expired: ['Archived'],
    Archived: ['Paused'],
};

const statusBadgeStyle = (status: GoalStatus): string => {
    switch (status) {
        case 'Active':
            return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25';
        case 'Planned':
            return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25';
        case 'Paused':
            return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25';
        case 'Completed':
            return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25';
        case 'Expired':
            return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25';
        case 'Abandoned':
            return 'bg-gray-500/15 text-gray-700 dark:text-slate-300 border border-gray-500/25';
        case 'Archived':
            return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/25';
    }
};

const isGoalEditable = (status: GoalStatus): boolean =>
    status === 'Planned' || status === 'Active' || status === 'Paused';

const CircularRing: React.FC<{
    percent: number;
    valueLabel: string;
    title: string;
    subtitle: string;
    strokeClass: string;
}> = ({ percent, valueLabel, title, subtitle, strokeClass }) => {
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, percent));
    const offset = circumference - (clamped / 100) * circumference;

    return (
        <div className="flex flex-col items-center text-center">
            <div className="relative w-22 h-22 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
                    <circle
                        cx="42"
                        cy="42"
                        r={radius}
                        strokeWidth="7"
                        fill="transparent"
                        className="stroke-gray-200 dark:stroke-white/10"
                    />
                    <circle
                        cx="42"
                        cy="42"
                        r={radius}
                        strokeWidth="7"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className={`transition-all duration-500 ${strokeClass}`}
                    />
                </svg>
                <span className="absolute text-base sm:text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">
                    {valueLabel}
                </span>
            </div>
            <p className="text-xs font-bold text-gray-900 dark:text-white mt-2">{title}</p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">{subtitle}</p>
        </div>
    );
};

export function GoalsManager() {
    const [goals, setGoals] = useState<GoalWithCount[]>([]);
    const [linkedCounts, setLinkedCounts] = useState<Record<number, number>>({});
    const [statusFilter, setStatusFilter] = useState<'ALL' | GoalStatus>('ALL');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);

    // Selected goal workspace
    const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
    const [detailTab, setDetailTab] = useState<'habits' | 'progress' | 'history'>('habits');
    const [detailLoading, setDetailLoading] = useState<boolean>(false);

    const [progressSummary, setProgressSummary] = useState<GoalProgressSummary | null>(null);
    const [goalHabits, setGoalHabits] = useState<HabitGoalLink[]>([]);
    const [statusHistory, setStatusHistory] = useState<GoalStatusHistoryItem[]>([]);
    const [allUserHabits, setAllUserHabits] = useState<UserHabitOption[]>([]);

    // Create Goal Form State
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalDesc, setNewGoalDesc] = useState('');
    const [newGoalStart, setNewGoalStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [newGoalEnd, setNewGoalEnd] = useState('');
    const [newGoalNotes, setNewGoalNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Edit Goal Notes / End Date State
    const [editingGoal, setEditingGoal] = useState<boolean>(false);
    const [editGoalName, setEditGoalName] = useState('');
    const [editGoalDesc, setEditGoalDesc] = useState('');
    const [editGoalEnd, setEditGoalEnd] = useState('');
    const [editGoalNotes, setEditGoalNotes] = useState('');

    // Status Change Inline Controls
    const [targetStatus, setTargetStatus] = useState<GoalStatus | ''>('');
    const [statusReason, setStatusReason] = useState('');

    // Habit Linking State
    const [selectedParentHabitId, setSelectedParentHabitId] = useState<string>('');

    const loadGoals = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data: GoalWithCount[] = await fetchGoals(
                statusFilter === 'ALL' ? undefined : statusFilter
            );
            setGoals(data);

            const countsEntries = await Promise.all(
                data.map(async (g) => {
                    if (typeof g.linked_habits_count === 'number') {
                        return [g.goal_id, g.linked_habits_count] as const;
                    }
                    try {
                        const links = await fetchGoalHabits(g.goal_id, false);
                        return [g.goal_id, links.length] as const;
                    } catch {
                        return [g.goal_id, 0] as const;
                    }
                })
            );
            setLinkedCounts(Object.fromEntries(countsEntries));
        } catch (err) {
            setError(extractApiError(err, 'Failed to load goals.'));
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const loadUserHabits = useCallback(async () => {
        try {
            const res = await fetchHabits();
            const list = Array.isArray(res) ? res : res?.habits ?? [];
            setAllUserHabits(
                list
                    .filter((h: { status?: string }) => h.status !== 'Deleted')
                    .map(
                        (h: {
                            habit_id: number;
                            habit_name?: string;
                            title?: string;
                            status?: string;
                        }) => ({
                            habit_id: h.habit_id,
                            habit_name: h.habit_name || h.title || `Habit #${h.habit_id}`,
                            status: h.status,
                        })
                    )
            );
        } catch {
            // ignore if habits endpoint temporarily fails
        }
    }, []);

    const loadGoalWorkspace = useCallback(async (goalId: number) => {
        setDetailLoading(true);
        setError(null);
        try {
            const [summary, links, sHist] = await Promise.all([
                fetchGoalProgressSummary(goalId),
                fetchGoalHabits(goalId, true),
                fetchGoalStatusHistory(goalId),
            ]);
            setProgressSummary(summary);
            setGoalHabits(links);
            setStatusHistory(sHist);
            setLinkedCounts((prev) => ({
                ...prev,
                [goalId]: links.filter((l) => l.is_active).length,
            }));
        } catch (err) {
            setError(extractApiError(err, 'Failed to load goal details.'));
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGoals();
    }, [loadGoals]);

    useEffect(() => {
        loadUserHabits();
    }, [loadUserHabits]);

    useEffect(() => {
        if (selectedGoalId !== null) {
            loadGoalWorkspace(selectedGoalId);
        }
    }, [selectedGoalId, loadGoalWorkspace]);

    // Computed Hero Metrics
    const heroStats = useMemo(() => {
        const total = goals.length;
        const completed = goals.filter((g) => g.status === 'Completed').length;
        const activeCount = goals.filter((g) => g.status === 'Active').length;
        const avgAdherence =
            total > 0
                ? Math.round(
                    goals.reduce((acc, g) => acc + (g.progress_percentage || 0), 0) / total
                )
                : 0;
        const totalLinked = Object.values(linkedCounts).reduce((a, b) => a + b, 0);
        const milestoneRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const habitCoverage =
            allUserHabits.length > 0
                ? Math.min(100, Math.round((totalLinked / allUserHabits.length) * 100))
                : totalLinked > 0
                    ? 100
                    : 0;

        return {
            total,
            completed,
            activeCount,
            avgAdherence,
            totalLinked,
            milestoneRate,
            habitCoverage,
        };
    }, [goals, linkedCounts, allUserHabits.length]);

    const handleCreateGoal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGoalName.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const created = await createGoal({
                goal_name: newGoalName.trim(),
                description: newGoalDesc.trim() || null,
                start_date: newGoalStart || null,
                end_date: newGoalEnd || null,
                notes: newGoalNotes.trim() || null,
            });
            setShowCreateModal(false);
            setNewGoalName('');
            setNewGoalDesc('');
            setNewGoalEnd('');
            setNewGoalNotes('');
            setBanner(
                `Goal "${created.goal_name}" created (${created.status}). Link habits below to track progress.`
            );
            await loadGoals();
            setProgressSummary(null);
            setDetailTab('habits');
            setSelectedGoalId(created.goal_id);
        } catch (err) {
            setError(extractApiError(err, 'Could not create goal.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenEditGoal = (goal: Goal) => {
        setEditGoalName(goal.goal_name);
        setEditGoalDesc(goal.description || '');
        setEditGoalEnd(goal.end_date || '');
        setEditGoalNotes(goal.notes || '');
        setEditingGoal(true);
    };

    const handleSaveGoalEdits = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGoalId) return;
        setSubmitting(true);
        setError(null);
        try {
            await updateGoal(selectedGoalId, {
                goal_name: editGoalName.trim(),
                description: editGoalDesc.trim() || null,
                end_date: editGoalEnd || null,
                notes: editGoalNotes.trim() || null,
            });
            setEditingGoal(false);
            setBanner('Goal details updated.');
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Failed to update goal.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteGoal = async (goal: Goal) => {
        const confirmed = window.confirm(
            `Delete "${goal.goal_name}"? This will remove the goal and unlink its habits.`
        );
        if (!confirmed) return;

        setSubmitting(true);
        setError(null);
        try {
            await deleteGoal(goal.goal_id);
            if (selectedGoalId === goal.goal_id) {
                setSelectedGoalId(null);
                setProgressSummary(null);
                setEditingGoal(false);
            }
            setBanner(`Goal "${goal.goal_name}" deleted.`);
            await loadGoals();
        } catch (err) {
            setError(extractApiError(err, 'Failed to delete goal.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusTransition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGoalId || !targetStatus) return;
        setSubmitting(true);
        setError(null);
        try {
            await changeGoalStatus(selectedGoalId, targetStatus, statusReason.trim() || undefined);
            setTargetStatus('');
            setStatusReason('');
            setBanner(`Goal status updated to ${targetStatus}.`);
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Status transition failed.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleRunMaintenance = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await runGoalMaintenance();
            setBanner(
                `Lifecycle sync complete: ${res.activated_count} activated, ${res.expired_count} expired.`
            );
            await loadGoals();
            if (selectedGoalId !== null) {
                await loadGoalWorkspace(selectedGoalId);
            }
        } catch (err) {
            setError(extractApiError(err, 'Maintenance run failed.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleLinkHabitToGoal = async () => {
        if (!selectedGoalId || !selectedParentHabitId) return;
        setSubmitting(true);
        setError(null);
        try {
            await linkHabitToGoal(selectedGoalId, Number(selectedParentHabitId));
            setSelectedParentHabitId('');
            setLinkedCounts((prev) => ({
                ...prev,
                [selectedGoalId]: (prev[selectedGoalId] ?? 0) + 1,
            }));
            setBanner(
                'Habit linked to goal. Marking it Done on your Dashboard will automatically advance goal progress.'
            );
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Failed to link habit to goal.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnlinkHabitFromGoal = async (habitId: number) => {
        if (!selectedGoalId) return;
        setSubmitting(true);
        setError(null);
        try {
            await unlinkHabitFromGoal(selectedGoalId, habitId);
            setLinkedCounts((prev) => ({
                ...prev,
                [selectedGoalId]: Math.max(0, (prev[selectedGoalId] ?? 1) - 1),
            }));
            setBanner('Habit unlinked from goal.');
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Failed to unlink habit.'));
        } finally {
            setSubmitting(false);
        }
    };

    const activeGoal =
        selectedGoalId !== null
            ? progressSummary?.goal ?? goals.find((g) => g.goal_id === selectedGoalId) ?? null
            : null;
    const activeParentLinks = goalHabits.filter((l) => l.is_active);
    const historicalParentLinks = goalHabits.filter((l) => !l.is_active);

    return (
        <div className="space-y-6 pb-8">
            {/* HERO PERFORMANCE CARD (INSPIRED BY WHOOP YEAR-IN-REVIEW) */}
            <div className="relative rounded-3xl bg-white dark:bg-[#14151b] border border-gray-200/80 dark:border-white/10 p-5 sm:p-7 shadow-sm overflow-hidden transition-colors">
                {/* Ambient Emerald Particle Orb */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-14 -right-14 w-56 h-56 sm:w-64 sm:h-64 rounded-full bg-radial from-emerald-400/25 via-teal-500/10 to-transparent blur-xl"
                />
                <svg
                    aria-hidden="true"
                    viewBox="0 0 200 200"
                    className="pointer-events-none absolute -top-6 -right-6 w-48 h-48 sm:w-56 sm:h-56 opacity-70"
                >
                    <circle
                        cx="115"
                        cy="85"
                        r="68"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="2 6"
                        className="text-emerald-500/40 dark:text-emerald-400/45"
                    />
                    <circle
                        cx="115"
                        cy="85"
                        r="52"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="1 5"
                        className="text-teal-500/50 dark:text-emerald-300/55"
                    />
                    <circle
                        cx="115"
                        cy="85"
                        r="36"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="3 7"
                        className="text-emerald-400/35"
                    />
                </svg>

                {/* Top Header Row */}
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-teal-600 dark:text-emerald-400">
                            Goals & Milestones
                        </span>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mt-1">
                            Milestone Overview
                        </h1>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-md">
                            Link daily habits directly to long-term milestones and track live adherence automatically.
                        </p>
                    </div>

                    {/* Goal Score Readout + Action Buttons */}
                    <div className="flex flex-col sm:items-end gap-3">
                        <div className="sm:text-right">
                            <p className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white leading-none">
                                {heroStats.avgAdherence.toFixed(1)}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400 mt-1">
                                Goal Score
                            </p>
                            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {heroStats.activeCount} active milestone{heroStats.activeCount === 1 ? '' : 's'}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleRunMaintenance}
                                disabled={submitting}
                                className="px-3.5 py-2 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/12 text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-white/6 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                Sync Lifecycle
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setError(null);
                                    setShowCreateModal(true);
                                }}
                                className="px-4 py-2 text-xs font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-emerald-400 dark:hover:bg-emerald-300 text-white dark:text-gray-950 shadow-xs transition-colors"
                            >
                                + New Goal
                            </button>
                        </div>
                    </div>
                </div>

                {/* Triple Circular Rings Box */}
                <div className="relative z-10 mt-6 p-4 sm:p-5 rounded-2xl bg-gray-50/90 dark:bg-[#1b1d24] border border-gray-200/70 dark:border-white/8 grid grid-cols-3 gap-2 sm:gap-6">
                    <CircularRing
                        percent={heroStats.milestoneRate}
                        valueLabel={`${heroStats.completed}/${heroStats.total}`}
                        title="Milestones"
                        subtitle="Completed"
                        strokeClass="stroke-slate-500 dark:stroke-slate-300"
                    />
                    <CircularRing
                        percent={heroStats.avgAdherence}
                        valueLabel={`${heroStats.avgAdherence}%`}
                        title="Avg Adherence"
                        subtitle="Across goals"
                        strokeClass="stroke-emerald-500 dark:stroke-lime-400"
                    />
                    <CircularRing
                        percent={heroStats.habitCoverage}
                        valueLabel={`${heroStats.totalLinked}`}
                        title="Linked Habits"
                        subtitle="Driving progress"
                        strokeClass="stroke-sky-500 dark:stroke-sky-400"
                    />
                </div>
            </div>

            {/* FEEDBACK BANNERS */}
            {banner && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    <span>{banner}</span>
                    <button
                        type="button"
                        onClick={() => setBanner(null)}
                        className="font-bold underline ml-4 shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 text-xs font-medium text-red-700 dark:text-red-300">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="font-bold underline ml-4 shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* STATUS FILTER BAR */}
            <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((st) => (
                    <button
                        key={st}
                        type="button"
                        onClick={() => {
                            setStatusFilter(st);
                            setSelectedGoalId(null);
                            setProgressSummary(null);
                            setEditingGoal(false);
                        }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === st
                                ? 'bg-gray-900 dark:bg-emerald-400 text-white dark:text-gray-950'
                                : 'bg-white dark:bg-[#1b1d24] text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/8'
                            }`}
                    >
                        {st === 'ALL' ? 'All Goals' : st}
                    </button>
                ))}
            </div>

            {/* CREATE GOAL FORM */}
            {showCreateModal && (
                <form
                    onSubmit={handleCreateGoal}
                    className="bg-white dark:bg-[#1b1d24] border border-gray-200 dark:border-white/10 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Create New Goal
                        </h2>
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-white"
                        >
                            Cancel
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                Goal Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={newGoalName}
                                onChange={(e) => setNewGoalName(e.target.value)}
                                placeholder="e.g., Ship Full-Stack Habit Tracker v2"
                                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#14151b] text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={newGoalStart}
                                onChange={(e) => setNewGoalStart(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#14151b] text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                Target End Date (Optional)
                            </label>
                            <input
                                type="date"
                                value={newGoalEnd}
                                onChange={(e) => setNewGoalEnd(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#14151b] text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                Description
                            </label>
                            <input
                                type="text"
                                value={newGoalDesc}
                                onChange={(e) => setNewGoalDesc(e.target.value)}
                                placeholder="Outcome or milestone summary"
                                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#14151b] text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                Notes
                            </label>
                            <textarea
                                rows={2}
                                value={newGoalNotes}
                                onChange={(e) => setNewGoalNotes(e.target.value)}
                                placeholder="Strategy, constraints, or personal reminders"
                                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#14151b] text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="px-4 py-2 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/12 text-gray-700 dark:text-slate-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2 text-xs font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-emerald-400 dark:hover:bg-emerald-300 text-white dark:text-gray-950 disabled:opacity-50"
                        >
                            {submitting ? 'Creating...' : 'Create Goal'}
                        </button>
                    </div>
                </form>
            )}

            {/* STACKED EMBLEM GOAL ROWS */}
            {loading ? (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-slate-400">
                    Loading goals...
                </div>
            ) : goals.length === 0 ? (
                <div className="bg-white dark:bg-[#1b1d24] border border-dashed border-gray-300 dark:border-white/15 rounded-3xl p-10 text-center">
                    <p className="text-gray-800 dark:text-white font-semibold">No goals found</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        Create a goal and link your daily habits to track progress automatically.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {goals.map((goal) => {
                        const isSelected = selectedGoalId === goal.goal_id;
                        const count =
                            linkedCounts[goal.goal_id] ?? goal.linked_habits_count ?? 0;

                        return (
                            <div
                                key={goal.goal_id}
                                onClick={() => {
                                    if (selectedGoalId !== goal.goal_id) {
                                        setProgressSummary(null);
                                        setDetailTab('habits');
                                    }
                                    setSelectedGoalId(goal.goal_id);
                                    setEditingGoal(false);
                                }}
                                className={`cursor-pointer rounded-3xl p-4 sm:p-5 border transition-all bg-white dark:bg-[#1b1d24] ${isSelected
                                        ? 'border-indigo-500 dark:border-emerald-400 ring-2 ring-indigo-500/20 dark:ring-emerald-400/20'
                                        : 'border-gray-200/80 dark:border-white/8 hover:border-indigo-300 dark:hover:border-white/20'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-4">
                                    {/* Left Medallion + Title & Window */}
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className="w-11 h-11 rounded-full bg-amber-500/12 border border-amber-400/35 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1.8}
                                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                                />
                                            </svg>
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base truncate">
                                                    {goal.goal_name}
                                                </h3>
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadgeStyle(
                                                        goal.status
                                                    )}`}
                                                >
                                                    {goal.status}
                                                </span>
                                            </div>

                                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                                                {goal.description
                                                    ? goal.description
                                                    : `${goal.start_date || '—'} → ${goal.end_date || 'Open-ended'}`}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right Adherence Readout + `/ X linked` Above Goal Adherence */}
                                    <div className="text-right shrink-0">
                                        <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-none">
                                            {goal.progress_percentage.toFixed(0)}
                                            <span className="text-xs font-semibold text-gray-400 dark:text-slate-400 ml-0.5">
                                                %
                                            </span>
                                        </p>
                                        <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                                            / {count} linked
                                        </p>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                                            Goal Adherence
                                        </p>
                                    </div>
                                </div>

                                {/* Sleek Progress Bar */}
                                <div className="mt-3.5 pt-3 border-t border-gray-100 dark:border-white/6 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600 dark:bg-emerald-400 rounded-full transition-all duration-300"
                                            style={{
                                                width: `${Math.min(100, goal.progress_percentage)}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-[11px] text-gray-400 dark:text-slate-400 shrink-0">
                                        {goal.start_date || '—'} → {goal.end_date || 'Open'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* SELECTED GOAL WORKSPACE */}
            {activeGoal && (
                <div className="bg-white dark:bg-[#1b1d24] border border-gray-200 dark:border-white/10 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6">
                    {/* Top Summary & Controls */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-4 border-b border-gray-200/80 dark:border-white/10">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {activeGoal.goal_name}
                                </h2>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeStyle(
                                        activeGoal.status
                                    )}`}
                                >
                                    {activeGoal.status}
                                </span>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    / {activeParentLinks.length} linked
                                </span>
                            </div>
                            {activeGoal.description && (
                                <p className="text-sm text-gray-600 dark:text-slate-300">
                                    {activeGoal.description}
                                </p>
                            )}
                            {activeGoal.notes && (
                                <p className="text-xs text-gray-500 dark:text-slate-400 italic">
                                    Notes: {activeGoal.notes}
                                </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                Window: {activeGoal.start_date} → {activeGoal.end_date || 'No deadline'}
                                {activeGoal.completed_at && ` • Completed at ${activeGoal.completed_at}`}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {isGoalEditable(activeGoal.status) && !editingGoal && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenEditGoal(activeGoal)}
                                    className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-white/8"
                                >
                                    Edit Details
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleDeleteGoal(activeGoal)}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-red-200 dark:border-red-800/70 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedGoalId(null);
                                    setProgressSummary(null);
                                    setEditingGoal(false);
                                }}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-full text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-white"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Inline Edit Goal Form */}
                    {editingGoal && (
                        <form
                            onSubmit={handleSaveGoalEdits}
                            className="p-4 rounded-2xl bg-gray-50 dark:bg-[#14151b] border border-gray-200 dark:border-white/10 space-y-3"
                        >
                            <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                                Edit Goal Metadata
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">
                                        Goal Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={editGoalName}
                                        onChange={(e) => setEditGoalName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1b1d24] text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={editGoalEnd}
                                        onChange={(e) => setEditGoalEnd(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1b1d24] text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">
                                        Description
                                    </label>
                                    <input
                                        type="text"
                                        value={editGoalDesc}
                                        onChange={(e) => setEditGoalDesc(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1b1d24] text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">
                                        Notes
                                    </label>
                                    <input
                                        type="text"
                                        value={editGoalNotes}
                                        onChange={(e) => setEditGoalNotes(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1b1d24] text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingGoal(false)}
                                    className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/12 text-gray-600 dark:text-slate-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-1.5 text-xs font-bold rounded-full bg-indigo-600 dark:bg-emerald-400 text-white dark:text-gray-950"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Status State Machine Controls */}
                    {MANUAL_NEXT_STATUSES[activeGoal.status].length > 0 && (
                        <form
                            onSubmit={handleStatusTransition}
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3.5 rounded-2xl bg-gray-50 dark:bg-[#14151b] border border-gray-200/80 dark:border-white/8"
                        >
                            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300 shrink-0">
                                Transition Status:
                            </span>
                            <select
                                value={targetStatus}
                                onChange={(e) => setTargetStatus(e.target.value as GoalStatus | '')}
                                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1b1d24] text-xs text-gray-900 dark:text-white"
                            >
                                <option value="">Select next status...</option>
                                {MANUAL_NEXT_STATUSES[activeGoal.status].map((st) => (
                                    <option key={st} value={st}>
                                        {st}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={statusReason}
                                onChange={(e) => setStatusReason(e.target.value)}
                                placeholder="Reason (optional, logged in audit history)"
                                className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1b1d24] text-xs text-gray-900 dark:text-white"
                            />
                            <button
                                type="submit"
                                disabled={!targetStatus || submitting}
                                className="px-4 py-1.5 text-xs font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-emerald-400 dark:hover:bg-emerald-300 text-white dark:text-gray-950 disabled:opacity-50"
                            >
                                Apply
                            </button>
                        </form>
                    )}

                    {/* Workspace Sub-Navigation */}
                    <div className="flex flex-wrap border-b border-gray-200 dark:border-white/10 gap-2 sm:gap-4 text-xs sm:text-sm">
                        {(
                            [
                                ['habits', `Linked Habits (${activeParentLinks.length})`],
                                ['progress', `Completed Logs (${progressSummary?.records_count ?? 0})`],
                                ['history', 'Status History'],
                            ] as const
                        ).map(([tabKey, label]) => (
                            <button
                                key={tabKey}
                                type="button"
                                onClick={() => setDetailTab(tabKey)}
                                className={`px-3.5 py-2 rounded-t-xl font-bold border-b-2 transition-colors ${detailTab === tabKey
                                        ? 'border-indigo-600 dark:border-emerald-400 bg-indigo-50/70 dark:bg-white/6 text-indigo-700 dark:text-emerald-300'
                                        : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {detailLoading ? (
                        <div className="py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                            Loading details...
                        </div>
                    ) : (
                        <>
                            {/* TAB 1: LINKED HABITS */}
                            {detailTab === 'habits' && (
                                <div className="space-y-4">
                                    {isGoalEditable(activeGoal.status) && (
                                        <div className="flex flex-col sm:flex-row gap-2.5 p-4 rounded-2xl bg-indigo-50/60 dark:bg-[#14151b] border border-indigo-200 dark:border-white/10">
                                            <select
                                                aria-label="Select a habit to link to this goal"
                                                value={selectedParentHabitId}
                                                onChange={(e) => setSelectedParentHabitId(e.target.value)}
                                                className="flex-1 px-3.5 py-2.5 rounded-xl border border-indigo-200 dark:border-white/12 bg-white dark:bg-[#1b1d24] text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-emerald-400"
                                            >
                                                <option value="">
                                                    Select a habit to link to this goal...
                                                </option>
                                                {allUserHabits
                                                    .filter(
                                                        (uh) =>
                                                            !activeParentLinks.some(
                                                                (al) => al.habit_id === uh.habit_id
                                                            )
                                                    )
                                                    .map((uh) => (
                                                        <option key={uh.habit_id} value={uh.habit_id}>
                                                            {uh.habit_name}
                                                        </option>
                                                    ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={handleLinkHabitToGoal}
                                                disabled={!selectedParentHabitId || submitting}
                                                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-emerald-400 dark:hover:bg-emerald-300 text-white dark:text-gray-950 text-sm font-bold disabled:opacity-50 shrink-0"
                                            >
                                                + Link Habit
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                            Active Goal Habits
                                        </h4>
                                        {activeParentLinks.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-slate-400">
                                                No habits linked to this goal yet. Select a habit above so its completions count toward this goal.
                                            </p>
                                        ) : (
                                            activeParentLinks.map((link) => (
                                                <div
                                                    key={link.habit_goal_id}
                                                    className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/70 dark:bg-[#14151b] border border-gray-200/80 dark:border-white/8"
                                                >
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                            {link.habit_name || `Habit #${link.habit_id}`}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-slate-400">
                                                            Linked {link.linked_at}
                                                        </p>
                                                    </div>
                                                    {isGoalEditable(activeGoal.status) && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleUnlinkHabitFromGoal(link.habit_id)
                                                            }
                                                            className="px-3 py-1.5 text-xs font-semibold rounded-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                                                        >
                                                            Unlink
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {historicalParentLinks.length > 0 && (
                                        <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-white/10">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                                Previously Linked Habits
                                            </h4>
                                            {historicalParentLinks.map((link) => (
                                                <div
                                                    key={link.habit_goal_id}
                                                    className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-[#14151b]/60 border border-gray-200/70 dark:border-white/6 text-xs text-gray-500 dark:text-slate-400"
                                                >
                                                    <span>
                                                        {link.habit_name || `Habit #${link.habit_id}`}
                                                    </span>
                                                    <span>Unlinked {link.unlinked_at}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: COMPLETED HABIT LOGS */}
                            {detailTab === 'progress' && (
                                <div className="space-y-2.5">
                                    <p className="text-xs text-gray-500 dark:text-slate-400">
                                        Only completed (
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            Done
                                        </span>
                                        ) sessions count toward adherence; missed, skipped, and carried-over occurrences are excluded.
                                    </p>
                                    {(progressSummary?.progress_records ?? []).length === 0 ? (
                                        <p className="text-sm text-gray-500 dark:text-slate-400">
                                            No completed sessions recorded yet. Mark a linked habit as{' '}
                                            <strong>Done</strong> on your Dashboard to record progress here.
                                        </p>
                                    ) : (
                                        progressSummary?.progress_records.map((rec) => (
                                            <div
                                                key={rec.progress_id}
                                                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/70 dark:bg-[#14151b] border border-gray-200/80 dark:border-white/8 text-sm"
                                            >
                                                <div>
                                                    <p className="font-semibold text-gray-900 dark:text-white">
                                                        {rec.criterion_name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-slate-400">
                                                        Completed • {rec.recorded_at}
                                                    </p>
                                                </div>
                                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                                    Done
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* TAB 3: STATUS HISTORY */}
                            {detailTab === 'history' && (
                                <div className="space-y-2.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                                        Status Transitions
                                    </h4>
                                    {statusHistory.length === 0 ? (
                                        <p className="text-xs text-gray-500 dark:text-slate-400">
                                            No status history found.
                                        </p>
                                    ) : (
                                        statusHistory.map((h) => (
                                            <div
                                                key={h.history_id}
                                                className="p-3.5 rounded-2xl bg-gray-50/70 dark:bg-[#14151b] border border-gray-200/80 dark:border-white/8 text-xs space-y-1"
                                            >
                                                <div className="flex justify-between font-bold text-gray-800 dark:text-white">
                                                    <span>
                                                        {h.old_status ?? 'Created'} → {h.new_status}
                                                    </span>
                                                    <span className="text-indigo-600 dark:text-emerald-400">
                                                        {h.changed_by_type}
                                                    </span>
                                                </div>
                                                {h.reason && (
                                                    <p className="text-gray-600 dark:text-slate-300">
                                                        {h.reason}
                                                    </p>
                                                )}
                                                <p className="text-gray-400 dark:text-slate-500">
                                                    {h.changed_at}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}