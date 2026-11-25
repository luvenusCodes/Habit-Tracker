import React, { useEffect, useState, useCallback } from 'react';
import type {
    Goal,
    GoalStatus,
    GoalCriterion,
    MeasurementType,
    HabitGoalLink,
    CriterionHabitLink,
    GoalProgressSummary,
    GoalStatusHistoryItem,
    CriterionHistoryItem,
} from '../types/goals';
import {
    fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    changeGoalStatus,
    runGoalMaintenance,
    createGoalCriterion,
    updateGoalCriterion,
    deactivateGoalCriterion,
    fetchGoalHabits,
    linkHabitToGoal,
    unlinkHabitFromGoal,
    fetchCriterionHabits,
    linkHabitToCriterion,
    unlinkHabitFromCriterion,
    fetchGoalProgressSummary,
    fetchGoalStatusHistory,
    fetchGoalCriteriaHistory,
    extractApiError,
} from '../services/goalsService';
import { fetchHabits } from '../services/habitService';

interface UserHabitOption {
    habit_id: number;
    habit_name: string;
    status?: string;
}

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
            return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
        case 'Planned':
            return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
        case 'Paused':
            return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
        case 'Completed':
            return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
        case 'Expired':
            return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
        case 'Abandoned':
            return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
        case 'Archived':
            return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    }
};

const isGoalEditable = (status: GoalStatus): boolean =>
    status === 'Planned' || status === 'Active' || status === 'Paused';

export function GoalsManager() {
    const [goals, setGoals] = useState<Goal[]>([]);
    const [statusFilter, setStatusFilter] = useState<'ALL' | GoalStatus>('ALL');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);

    // Selected goal workspace
    const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
    const [detailTab, setDetailTab] = useState<'criteria' | 'habits' | 'progress' | 'history'>('criteria');
    const [detailLoading, setDetailLoading] = useState<boolean>(false);

    const [progressSummary, setProgressSummary] = useState<GoalProgressSummary | null>(null);
    const [goalHabits, setGoalHabits] = useState<HabitGoalLink[]>([]);
    const [criterionHabitsMap, setCriterionHabitsMap] = useState<Record<number, CriterionHabitLink[]>>({});
    const [statusHistory, setStatusHistory] = useState<GoalStatusHistoryItem[]>([]);
    const [criteriaHistory, setCriteriaHistory] = useState<CriterionHistoryItem[]>([]);
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

    // Status Change Modal / Inline Controls
    const [targetStatus, setTargetStatus] = useState<GoalStatus | ''>('');
    const [statusReason, setStatusReason] = useState('');

    // Create Criterion Form State
    const [critName, setCritName] = useState('');
    const [critType, setCritType] = useState<MeasurementType>('Count');
    const [critTarget, setCritTarget] = useState('1');
    const [critUnit, setCritUnit] = useState('sessions');
    const [critMandatory, setCritMandatory] = useState(true);

    // Edit Criterion Inline State
    const [editingCritId, setEditingCritId] = useState<number | null>(null);
    const [editCritTarget, setEditCritTarget] = useState('');
    const [editCritReason, setEditCritReason] = useState('');

    // Habit Linking State
    const [selectedParentHabitId, setSelectedParentHabitId] = useState<string>('');
    const [selectedCritHabitMap, setSelectedCritHabitMap] = useState<Record<number, string>>({});

    const loadGoals = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchGoals(statusFilter === 'ALL' ? undefined : statusFilter);
            setGoals(data);
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
                    .map((h: { habit_id: number; habit_name?: string; title?: string; status?: string }) => ({
                        habit_id: h.habit_id,
                        habit_name: h.habit_name || h.title || `Habit #${h.habit_id}`,
                        status: h.status,
                    }))
            );
        } catch {
            // ignore if habits endpoint temporarily fails
        }
    }, []);

    const loadGoalWorkspace = useCallback(async (goalId: number) => {
        setDetailLoading(true);
        setError(null);
        try {
            const [summary, links, sHist, cHist] = await Promise.all([
                fetchGoalProgressSummary(goalId),
                fetchGoalHabits(goalId, true),
                fetchGoalStatusHistory(goalId),
                fetchGoalCriteriaHistory(goalId),
            ]);
            setProgressSummary(summary);
            setGoalHabits(links);
            setStatusHistory(sHist);
            setCriteriaHistory(cHist);

            // Load linked habits per criterion
            const critLinksEntries = await Promise.all(
                summary.criteria_progress.map(async (c) => {
                    const cLinks = await fetchCriterionHabits(goalId, c.criterion_id, false);
                    return [c.criterion_id, cLinks] as const;
                })
            );
            const map: Record<number, CriterionHabitLink[]> = {};
            for (const [cid, cLinks] of critLinksEntries) {
                map[cid] = cLinks;
            }
            setCriterionHabitsMap(map);
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
            setBanner(`Goal "${created.goal_name}" created (${created.status}).`);
            await loadGoals();
            setProgressSummary(null);
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

    const handleAddCriterion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGoalId || !critName.trim() || !critUnit.trim()) return;
        const numericTarget = parseFloat(critTarget);
        if (isNaN(numericTarget) || numericTarget <= 0) {
            setError('Target value must be greater than 0.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await createGoalCriterion(selectedGoalId, {
                criterion_name: critName.trim(),
                measurement_type: critType,
                target_value: numericTarget,
                measurement_unit: critUnit.trim(),
                is_mandatory: critMandatory,
            });
            setCritName('');
            setCritTarget('1');
            setBanner('Criterion added to goal.');
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Failed to add criterion.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateCriterionTarget = async (criterion: GoalCriterion) => {
        if (!selectedGoalId) return;
        const parsed = parseFloat(editCritTarget);
        if (isNaN(parsed) || parsed <= 0) {
            setError('Target value must be greater than 0.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await updateGoalCriterion(selectedGoalId, criterion.criterion_id, {
                target_value: parsed,
                reason: editCritReason.trim() || 'Target updated via UI',
            });
            setEditingCritId(null);
            setEditCritReason('');
            setBanner('Criterion target updated and logged to audit history.');
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Failed to update criterion.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeactivateCriterion = async (criterionId: number) => {
        if (!selectedGoalId) return;
        setSubmitting(true);
        setError(null);
        try {
            await deactivateGoalCriterion(selectedGoalId, criterionId, 'Deactivated from Goals UI');
            setBanner('Criterion deactivated.');
            await Promise.all([loadGoals(), loadGoalWorkspace(selectedGoalId)]);
        } catch (err) {
            setError(extractApiError(err, 'Failed to deactivate criterion.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleLinkHabitToParentGoal = async () => {
        if (!selectedGoalId || !selectedParentHabitId) return;
        setSubmitting(true);
        setError(null);
        try {
            await linkHabitToGoal(selectedGoalId, Number(selectedParentHabitId));
            setSelectedParentHabitId('');
            setBanner('Habit linked to goal.');
            await loadGoalWorkspace(selectedGoalId);
        } catch (err) {
            setError(extractApiError(err, 'Failed to link habit to goal.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnlinkHabitFromParentGoal = async (habitId: number) => {
        if (!selectedGoalId) return;
        setSubmitting(true);
        setError(null);
        try {
            await unlinkHabitFromGoal(selectedGoalId, habitId);
            setBanner('Habit unlinked from goal (and cascaded to criteria).');
            await loadGoalWorkspace(selectedGoalId);
        } catch (err) {
            setError(extractApiError(err, 'Failed to unlink habit.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleLinkHabitToCriterion = async (criterionId: number) => {
        if (!selectedGoalId) return;
        const habitIdStr = selectedCritHabitMap[criterionId];
        if (!habitIdStr) return;

        setSubmitting(true);
        setError(null);
        try {
            await linkHabitToCriterion(selectedGoalId, criterionId, Number(habitIdStr));
            setSelectedCritHabitMap((prev) => ({ ...prev, [criterionId]: '' }));
            setBanner('Habit linked to criterion.');
            await loadGoalWorkspace(selectedGoalId);
        } catch (err) {
            setError(extractApiError(err, 'Failed to link habit to criterion.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnlinkHabitFromCriterion = async (criterionId: number, habitId: number) => {
        if (!selectedGoalId) return;
        setSubmitting(true);
        setError(null);
        try {
            await unlinkHabitFromCriterion(selectedGoalId, criterionId, habitId);
            setBanner('Habit unlinked from criterion.');
            await loadGoalWorkspace(selectedGoalId);
        } catch (err) {
            setError(extractApiError(err, 'Failed to unlink habit from criterion.'));
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
        <div className="space-y-6">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Goals & Milestones
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Connect daily habits to measurable targets and track automatic completion.
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleRunMaintenance}
                        disabled={submitting}
                        className="px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                        Sync Lifecycle
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setShowCreateModal(true);
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
                    >
                        + New Goal
                    </button>
                </div>
            </div>

            {/* FEEDBACK BANNERS */}
            {banner && (
                <div className="flex items-center justify-between p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
                    <span>{banner}</span>
                    <button
                        type="button"
                        onClick={() => setBanner(null)}
                        className="text-xs font-semibold underline ml-4"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="flex items-center justify-between p-3.5 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="text-xs font-semibold underline ml-4"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* STATUS FILTER BAR */}
            <div className="flex flex-wrap gap-2">
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
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === st
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Goal</h2>
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        >
                            Cancel
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Goal Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={newGoalName}
                                onChange={(e) => setNewGoalName(e.target.value)}
                                placeholder="e.g., Ship Full-Stack Habit Tracker v2"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={newGoalStart}
                                onChange={(e) => setNewGoalStart(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Target End Date (Optional)
                            </label>
                            <input
                                type="date"
                                value={newGoalEnd}
                                onChange={(e) => setNewGoalEnd(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <input
                                type="text"
                                value={newGoalDesc}
                                onChange={(e) => setNewGoalDesc(e.target.value)}
                                placeholder="Outcome or milestone summary"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Notes
                            </label>
                            <textarea
                                rows={2}
                                value={newGoalNotes}
                                onChange={(e) => setNewGoalNotes(e.target.value)}
                                placeholder="Strategy, constraints, or personal reminders"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                        >
                            {submitting ? 'Creating...' : 'Create Goal'}
                        </button>
                    </div>
                </form>
            )}

            {/* GOALS LIST */}
            {loading ? (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                    Loading goals...
                </div>
            ) : goals.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
                    <p className="text-gray-700 dark:text-gray-300 font-medium">No goals found</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Create a goal and attach measurable criteria and daily habits to track progress automatically.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {goals.map((goal) => {
                        const isSelected = selectedGoalId === goal.goal_id;
                        return (
                            <div
                                key={goal.goal_id}
                                onClick={() => {
                                    if (selectedGoalId !== goal.goal_id) {
                                        setProgressSummary(null);
                                    }
                                    setSelectedGoalId(goal.goal_id);
                                    setEditingGoal(false);
                                }}
                                className={`cursor-pointer rounded-xl p-5 border transition-all bg-white dark:bg-gray-800 ${isSelected
                                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white text-base">
                                        {goal.goal_name}
                                    </h3>
                                    <span
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${statusBadgeStyle(
                                            goal.status
                                        )}`}
                                    >
                                        {goal.status}
                                    </span>
                                </div>

                                {goal.description && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                        {goal.description}
                                    </p>
                                )}

                                <div className="mt-4">
                                    <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                        <span>Overall Progress</span>
                                        <span>{goal.progress_percentage.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
                                            style={{ width: `${Math.min(100, goal.progress_percentage)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                    <span>Start: {goal.start_date || '—'}</span>
                                    <span>End: {goal.end_date || 'Open-ended'}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* SELECTED GOAL WORKSPACE */}
            {activeGoal && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-6">
                    {/* Top Summary & Controls */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
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
                            </div>
                            {activeGoal.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-300">{activeGoal.description}</p>
                            )}
                            {activeGoal.notes && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                    Notes: {activeGoal.notes}
                                </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Window: {activeGoal.start_date} → {activeGoal.end_date || 'No deadline'}
                                {activeGoal.completed_at && ` • Completed at ${activeGoal.completed_at}`}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {isGoalEditable(activeGoal.status) && !editingGoal && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenEditGoal(activeGoal)}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Edit Details
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleDeleteGoal(activeGoal)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
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
                                className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Inline Edit Goal Form */}
                    {editingGoal && (
                        <form
                            onSubmit={handleSaveGoalEdits}
                            className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-3"
                        >
                            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                Edit Goal Metadata
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        Goal Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={editGoalName}
                                        onChange={(e) => setEditGoalName(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={editGoalEnd}
                                        onChange={(e) => setEditGoalEnd(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        Description
                                    </label>
                                    <input
                                        type="text"
                                        value={editGoalDesc}
                                        onChange={(e) => setEditGoalDesc(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        Notes
                                    </label>
                                    <input
                                        type="text"
                                        value={editGoalNotes}
                                        onChange={(e) => setEditGoalNotes(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingGoal(false)}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
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
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700"
                        >
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                                Transition Status:
                            </span>
                            <select
                                value={targetStatus}
                                onChange={(e) => setTargetStatus(e.target.value as GoalStatus | '')}
                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
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
                                className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                            />
                            <button
                                type="submit"
                                disabled={!targetStatus || submitting}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                            >
                                Apply
                            </button>
                        </form>
                    )}

                    {/* Workspace Sub-Navigation */}
                    <div className="flex flex-wrap border-b border-gray-200 dark:border-gray-700 gap-2 sm:gap-4 text-sm">
                        {(
                            [
                                ['criteria', `Criteria (${progressSummary?.criteria_progress.length ?? 0})`],
                                ['habits', `Linked Habits (${activeParentLinks.length})`],
                                ['progress', `Progress Log (${progressSummary?.records_count ?? 0})`],
                                ['history', 'Audit History'],
                            ] as const
                        ).map(([tabKey, label]) => (
                            <button
                                key={tabKey}
                                type="button"
                                onClick={() => setDetailTab(tabKey)}
                                className={`px-3 py-2 rounded-t-lg font-semibold border-b-2 transition-colors ${detailTab === tabKey
                                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700/40'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {detailLoading ? (
                        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            Loading details...
                        </div>
                    ) : (
                        <>
                            {/* TAB 1: CRITERIA */}
                            {detailTab === 'criteria' && (
                                <div className="space-y-5">
                                    {isGoalEditable(activeGoal.status) && (
                                        <form
                                            onSubmit={handleAddCriterion}
                                            className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700"
                                        >
                                            <input
                                                type="text"
                                                required
                                                value={critName}
                                                onChange={(e) => setCritName(e.target.value)}
                                                placeholder="Criterion name (e.g., Deep Work)"
                                                className="sm:col-span-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                            />
                                            <select
                                                value={critType}
                                                onChange={(e) => setCritType(e.target.value as MeasurementType)}
                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                            >
                                                <option value="Count">Count</option>
                                                <option value="Duration">Duration</option>
                                                <option value="Quantity">Quantity</option>
                                            </select>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                required
                                                value={critTarget}
                                                onChange={(e) => setCritTarget(e.target.value)}
                                                placeholder="Target"
                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                            />
                                            <input
                                                type="text"
                                                required
                                                value={critUnit}
                                                onChange={(e) => setCritUnit(e.target.value)}
                                                placeholder="Unit (sessions)"
                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                            />
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={critMandatory}
                                                        onChange={(e) => setCritMandatory(e.target.checked)}
                                                    />
                                                    Mandatory
                                                </label>
                                                <button
                                                    type="submit"
                                                    disabled={submitting}
                                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {(progressSummary?.criteria_progress ?? []).length === 0 ? (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            No criteria defined yet. Add at least one mandatory criterion to track completion.
                                        </p>
                                    ) : (
                                        <div className="space-y-4">
                                            {progressSummary?.criteria_progress.map((crit) => {
                                                const linkedToCrit = criterionHabitsMap[crit.criterion_id] ?? [];
                                                const eligibleToLink = activeParentLinks.filter(
                                                    (pl) => !linkedToCrit.some((cl) => cl.habit_id === pl.habit_id)
                                                );

                                                return (
                                                    <div
                                                        key={crit.criterion_id}
                                                        className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3"
                                                    >
                                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                            <div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-semibold text-sm text-gray-900 dark:text-white">
                                                                        {crit.criterion_name}
                                                                    </span>
                                                                    <span
                                                                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${crit.is_mandatory
                                                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                                                                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                                            }`}
                                                                    >
                                                                        {crit.is_mandatory ? 'Mandatory' : 'Optional'}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                        ({crit.measurement_type} • {crit.status})
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                                                    Earned: <strong>{crit.earned_amount}</strong> /{' '}
                                                                    <strong>{crit.target_value}</strong> {crit.measurement_unit} (
                                                                    {crit.completion_percentage.toFixed(1)}%)
                                                                </p>
                                                            </div>

                                                            {isGoalEditable(activeGoal.status) && crit.status !== 'Inactive' && (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingCritId(crit.criterion_id);
                                                                            setEditCritTarget(String(crit.target_value));
                                                                            setEditCritReason('');
                                                                        }}
                                                                        className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                                                                    >
                                                                        Edit Target
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeactivateCriterion(crit.criterion_id)}
                                                                        className="px-2.5 py-1 text-xs rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                                                    >
                                                                        Deactivate
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Progress Bar */}
                                                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-emerald-500 transition-all duration-300"
                                                                style={{ width: `${Math.min(100, crit.completion_percentage)}%` }}
                                                            />
                                                        </div>

                                                        {/* Inline Target Editor */}
                                                        {editingCritId === crit.criterion_id && (
                                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0.01"
                                                                    value={editCritTarget}
                                                                    onChange={(e) => setEditCritTarget(e.target.value)}
                                                                    className="w-28 px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={editCritReason}
                                                                    onChange={(e) => setEditCritReason(e.target.value)}
                                                                    placeholder="Reason for target adjustment"
                                                                    className="flex-1 px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdateCriterionTarget(crit)}
                                                                    className="px-3 py-1 rounded bg-indigo-600 text-white text-xs"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingCritId(null)}
                                                                    className="px-2.5 py-1 rounded text-xs text-gray-500"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Criterion-Level Feeding Habits Panel */}
                                                        <div className="mt-3 p-3.5 rounded-xl bg-indigo-50/75 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-800/80 space-y-3">
                                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                                                                        Feeding Habits
                                                                    </span>
                                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-200">
                                                                        {linkedToCrit.length} linked
                                                                    </span>
                                                                </div>

                                                                {isGoalEditable(activeGoal.status) &&
                                                                    crit.status === 'Active' &&
                                                                    activeParentLinks.length === 0 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setDetailTab('habits')}
                                                                            className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline text-left sm:text-right"
                                                                        >
                                                                            Step 1: Link a habit under Linked Habits →
                                                                        </button>
                                                                    )}
                                                            </div>

                                                            {/* Currently Linked Feeding Habits */}
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {linkedToCrit.length === 0 ? (
                                                                    <span className="text-xs text-gray-600 dark:text-gray-300">
                                                                        {activeParentLinks.length === 0
                                                                            ? 'No habits attached to this goal yet.'
                                                                            : 'No feeding habit selected yet — choose one from the dropdown below.'}
                                                                    </span>
                                                                ) : (
                                                                    linkedToCrit.map((cl) => (
                                                                        <span
                                                                            key={cl.goal_criterion_habits_id}
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 text-xs font-semibold shadow-2xs"
                                                                        >
                                                                            {cl.habit_name || `Habit #${cl.habit_id}`}
                                                                            {isGoalEditable(activeGoal.status) && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        handleUnlinkHabitFromCriterion(
                                                                                            crit.criterion_id,
                                                                                            cl.habit_id
                                                                                        )
                                                                                    }
                                                                                    className="ml-1 text-indigo-500 hover:text-red-600 font-bold text-sm leading-none"
                                                                                    title="Unlink from criterion"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            )}
                                                                        </span>
                                                                    ))
                                                                )}
                                                            </div>

                                                            {/* Prominent Habit Selector Dropdown */}
                                                            {isGoalEditable(activeGoal.status) && crit.status === 'Active' && (
                                                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                                                                    <select
                                                                        aria-label={`Select feeding habit for ${crit.criterion_name}`}
                                                                        value={selectedCritHabitMap[crit.criterion_id] || ''}
                                                                        onChange={(e) =>
                                                                            setSelectedCritHabitMap((prev) => ({
                                                                                ...prev,
                                                                                [crit.criterion_id]: e.target.value,
                                                                            }))
                                                                        }
                                                                        disabled={eligibleToLink.length === 0}
                                                                        className="w-full sm:flex-1 px-3.5 py-2 rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white shadow-2xs focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                                                                    >
                                                                        <option value="">
                                                                            {eligibleToLink.length > 0
                                                                                ? 'Select a linked goal habit to feed this criterion...'
                                                                                : activeParentLinks.length === 0
                                                                                    ? 'No goal habits available yet (link one in Linked Habits tab first)'
                                                                                    : 'All goal habits are already linked to this criterion'}
                                                                        </option>
                                                                        {eligibleToLink.map((hl) => (
                                                                            <option key={hl.habit_id} value={hl.habit_id}>
                                                                                {hl.habit_name || `Habit #${hl.habit_id}`}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleLinkHabitToCriterion(crit.criterion_id)}
                                                                        disabled={!selectedCritHabitMap[crit.criterion_id] || submitting}
                                                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-2xs transition-colors disabled:opacity-50 shrink-0"
                                                                    >
                                                                        + Link Habit
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: PARENT GOAL HABIT LINKS */}
                            {detailTab === 'habits' && (
                                <div className="space-y-4">
                                    {isGoalEditable(activeGoal.status) && (
                                        <div className="flex flex-col sm:flex-row gap-2.5 p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                                            <select
                                                aria-label="Select a habit to link to this goal"
                                                value={selectedParentHabitId}
                                                onChange={(e) => setSelectedParentHabitId(e.target.value)}
                                                className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/30"
                                            >
                                                <option value="">Select a habit to link to this goal...</option>
                                                {allUserHabits
                                                    .filter(
                                                        (uh) => !activeParentLinks.some((al) => al.habit_id === uh.habit_id)
                                                    )
                                                    .map((uh) => (
                                                        <option key={uh.habit_id} value={uh.habit_id}>
                                                            {uh.habit_name}
                                                        </option>
                                                    ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={handleLinkHabitToParentGoal}
                                                disabled={!selectedParentHabitId || submitting}
                                                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
                                            >
                                                + Link Habit to Goal
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Active Goal Habits
                                        </h4>
                                        {activeParentLinks.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                No habits linked to this goal yet. Link a habit here first before attaching it to criteria.
                                            </p>
                                        ) : (
                                            activeParentLinks.map((link) => (
                                                <div
                                                    key={link.habit_goal_id}
                                                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                                                >
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                            {link.habit_name || `Habit #${link.habit_id}`}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            Linked {link.linked_at} by {link.linked_by_type}
                                                        </p>
                                                    </div>
                                                    {isGoalEditable(activeGoal.status) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUnlinkHabitFromParentGoal(link.habit_id)}
                                                            className="px-3 py-1 text-xs font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                                        >
                                                            Unlink
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {historicalParentLinks.length > 0 && (
                                        <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                Historical / Unlinked Habits
                                            </h4>
                                            {historicalParentLinks.map((link) => (
                                                <div
                                                    key={link.habit_goal_id}
                                                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400"
                                                >
                                                    <span>{link.habit_name || `Habit #${link.habit_id}`}</span>
                                                    <span>
                                                        Unlinked {link.unlinked_at} ({link.unlinked_by_type})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: PROGRESS RECORDS */}
                            {detailTab === 'progress' && (
                                <div className="space-y-2.5">
                                    {(progressSummary?.progress_records ?? []).length === 0 ? (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            No progress recorded yet. Complete linked habit occurrences on your Dashboard to earn automatic progress.
                                        </p>
                                    ) : (
                                        progressSummary?.progress_records.map((rec) => (
                                            <div
                                                key={rec.progress_id}
                                                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
                                            >
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {rec.criterion_name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        Occurrence #{rec.habit_occurrence_id} • {rec.recorded_at}
                                                    </p>
                                                </div>
                                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                    +{rec.contribution_amount}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* TAB 4: AUDIT HISTORY */}
                            {detailTab === 'history' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2.5">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Status Transitions
                                        </h4>
                                        {statusHistory.length === 0 ? (
                                            <p className="text-xs text-gray-500">No status history found.</p>
                                        ) : (
                                            statusHistory.map((h) => (
                                                <div
                                                    key={h.history_id}
                                                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs space-y-1"
                                                >
                                                    <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-200">
                                                        <span>
                                                            {h.old_status ?? 'Created'} → {h.new_status}
                                                        </span>
                                                        <span className="text-indigo-600 dark:text-indigo-400">
                                                            {h.changed_by_type}
                                                        </span>
                                                    </div>
                                                    {h.reason && (
                                                        <p className="text-gray-600 dark:text-gray-300">{h.reason}</p>
                                                    )}
                                                    <p className="text-gray-400">{h.changed_at}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="space-y-2.5">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Criteria Modifications
                                        </h4>
                                        {criteriaHistory.length === 0 ? (
                                            <p className="text-xs text-gray-500">No criteria modifications logged.</p>
                                        ) : (
                                            criteriaHistory.map((ch) => (
                                                <div
                                                    key={ch.history_id}
                                                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs space-y-1"
                                                >
                                                    <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-200">
                                                        <span>
                                                            {ch.criterion_name} ({ch.field_name})
                                                        </span>
                                                        <span className="text-indigo-600 dark:text-indigo-400">
                                                            {ch.changed_by_type}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-600 dark:text-gray-300">
                                                        {ch.old_value ?? '—'} → {ch.new_value ?? '—'}
                                                    </p>
                                                    {ch.reason && <p className="text-gray-500 italic">{ch.reason}</p>}
                                                    <p className="text-gray-400">{ch.changed_at}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}