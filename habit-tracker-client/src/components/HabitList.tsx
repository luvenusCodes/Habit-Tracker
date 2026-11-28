import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Habit, Category } from '../types';
import { getHabits, getCategories, updateHabit, deleteHabit } from '../services/api';
import { HabitForm } from './HabitForm';
import { HabitScheduleManager } from './HabitScheduleManager';

const CATEGORY_BADGE_STYLES = [
    'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/30',
    'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-400/30',
    'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-400/30',
    'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400/30',
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30',
    'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30',
];

const getCategoryBadgeClass = (categoryId?: number) => {
    if (!categoryId) return CATEGORY_BADGE_STYLES[0];
    return CATEGORY_BADGE_STYLES[Math.abs(categoryId) % CATEGORY_BADGE_STYLES.length];
};

export const HabitList = () => {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // 7-day interactive calendar strip state
    const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);

    // Filter state
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
    const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<
        'ALL' | 'High' | 'Medium' | 'Low'
    >('ALL');

    // Create Habit drawer toggle (triggered by floating + or top button)
    const [showCreateDrawer, setShowCreateDrawer] = useState<boolean>(false);

    // Inline editing state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPriority, setEditPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
    const [editStatus, setEditStatus] = useState<Habit['status']>('Active');
    const [editCategoryId, setEditCategoryId] = useState<string>('');
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // Two-step delete confirmation & schedule drawer state
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [openScheduleHabitId, setOpenScheduleHabitId] = useState<number | null>(null);

    const fetchCategoriesData = useCallback(async () => {
        try {
            const catData = await getCategories();
            setCategories(catData);
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
    }, []);

    const fetchHabitsData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getHabits();
            setHabits(data);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHabitsData();
        fetchCategoriesData();
    }, [fetchHabitsData, fetchCategoriesData]);

    // Build 7-day date strip centered around today (-5 days to +1 day)
    const weekDays = useMemo(() => {
        const offsets = [-5, -4, -3, -2, -1, 0, 1];
        const base = new Date();
        return offsets.map((offset) => {
            const d = new Date(base);
            d.setDate(base.getDate() + offset);
            return {
                offset,
                weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
                dayNum: d.getDate(),
                fullLabel: d.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                }),
                isFuture: offset > 0,
            };
        });
    }, []);

    const activeDayObj =
        weekDays.find((d) => d.offset === selectedDayOffset) ?? weekDays[5];

    const categoryMap = useMemo(() => {
        const map = new Map<number, Category>();
        categories.forEach((cat) => map.set(cat.category_id, cat));
        return map;
    }, [categories]);

    // Portfolio summary metrics for Hero Horseshoe & 3 Pillar Cards
    const portfolioStats = useMemo(() => {
        const visible = habits.filter((h) => h.status !== 'Deleted');
        const total = visible.length;
        const activeCount = visible.filter((h) => (h.status || 'Active') === 'Active').length;
        const pausedOrDone = Math.max(0, total - activeCount);

        const highList = visible.filter((h) => h.priority === 'High');
        const mediumList = visible.filter((h) => h.priority === 'Medium');
        const lowList = visible.filter((h) => h.priority === 'Low');

        const activeRate = total > 0 ? Math.round((activeCount / total) * 100) : 0;

        return {
            total,
            activeCount,
            pausedOrDone,
            activeRate,
            highCount: highList.length,
            highActive: highList.filter((h) => (h.status || 'Active') === 'Active').length,
            mediumCount: mediumList.length,
            mediumActive: mediumList.filter((h) => (h.status || 'Active') === 'Active').length,
            lowCount: lowList.length,
            lowActive: lowList.filter((h) => (h.status || 'Active') === 'Active').length,
        };
    }, [habits]);

    const filteredHabits = useMemo(() => {
        return habits.filter((habit) => {
            const matchesCategory =
                selectedCategoryFilter === 'ALL'
                    ? true
                    : String(habit.category_id ?? '') === selectedCategoryFilter;

            const matchesPriority =
                selectedPriorityFilter === 'ALL' || habit.priority === selectedPriorityFilter;

            return matchesCategory && matchesPriority;
        });
    }, [habits, selectedCategoryFilter, selectedPriorityFilter]);

    const startEditing = (habit: Habit) => {
        setEditingId(habit.habit_id);
        setEditName(habit.habit_name);
        setEditDescription(habit.description || '');
        setEditPriority(habit.priority);
        setEditStatus(habit.status || 'Active');
        setEditCategoryId(habit.category_id ? String(habit.category_id) : '');
        setConfirmDeleteId(null);
        setOpenScheduleHabitId(null);
    };

    const cancelEditing = () => {
        setEditingId(null);
    };

    const handleSaveEdit = async (habitId: number) => {
        if (!editName.trim()) return;
        try {
            setActionLoading(habitId);
            setError(null);
            await updateHabit(habitId, {
                habit_name: editName.trim(),
                description: editDescription.trim(),
                priority: editPriority,
                status: editStatus,
                ...(editCategoryId ? { category_id: Number(editCategoryId) } : {}),
            });
            setEditingId(null);
            await fetchHabitsData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleConfirmDelete = async (habitId: number) => {
        try {
            setActionLoading(habitId);
            setError(null);
            await deleteHabit(habitId);
            setConfirmDeleteId(null);
            if (openScheduleHabitId === habitId) {
                setOpenScheduleHabitId(null);
            }
            await fetchHabitsData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    // Open-bottom 240-degree horseshoe ring geometry
    const ringRadius = 40;
    const ringCirc = 2 * Math.PI * ringRadius;
    const arcMax = ringCirc * 0.72;
    const arcFill = arcMax * (portfolioStats.activeRate / 100);

    return (
        <div className="relative space-y-6 pb-20">
            {/* Ambient Background Orbs for Glassmorphism */}
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 overflow-hidden -z-10"
            >
                <div className="absolute top-12 right-1/4 w-80 h-80 rounded-full bg-amber-400/12 dark:bg-amber-400/10 blur-3xl" />
                <div className="absolute bottom-24 left-1/5 w-96 h-96 rounded-full bg-indigo-500/10 dark:bg-indigo-500/12 blur-3xl" />
            </div>

            {/* TOP HEADER + 7-DAY HORIZONTAL DATE STRIP */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                            {activeDayObj.fullLabel}
                        </p>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mt-0.5">
                            Habits &amp; Routines
                        </h1>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowCreateDrawer((prev) => !prev)}
                        className="self-start sm:self-auto px-4 py-2 rounded-full bg-gray-900 hover:bg-gray-800 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-gray-950 font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
                    >
                        <span className="text-sm leading-none">{showCreateDrawer ? '×' : '+'}</span>
                        <span>{showCreateDrawer ? 'Close Form' : 'New Habit'}</span>
                    </button>
                </div>

                {/* 7-Day Date Strip */}
                <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day) => {
                        const isSelected = day.offset === selectedDayOffset;
                        return (
                            <button
                                key={day.offset}
                                type="button"
                                onClick={() => setSelectedDayOffset(day.offset)}
                                className="flex flex-col items-center gap-1.5 group focus:outline-none"
                            >
                                <span
                                    className={`text-[11px] font-semibold ${isSelected
                                        ? 'text-gray-900 dark:text-white'
                                        : 'text-gray-400 dark:text-slate-500'
                                        }`}
                                >
                                    {day.weekday}
                                </span>
                                <div
                                    className={`w-full max-w-12 aspect-square rounded-2xl flex items-center justify-center text-sm font-bold transition-all backdrop-blur-xl border ${isSelected
                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-950 border-gray-900 dark:border-white shadow-md scale-105'
                                        : day.isFuture
                                            ? 'bg-white/45 dark:bg-white/3 border-gray-200/60 dark:border-white/6 text-gray-400 dark:text-slate-500'
                                            : 'bg-white/75 dark:bg-white/6 border-gray-200/80 dark:border-white/10 text-gray-800 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10'
                                        }`}
                                >
                                    {day.dayNum}
                                </div>
                                <span
                                    className={`h-1 w-4 rounded-full transition-opacity ${isSelected
                                        ? 'bg-gray-900 dark:bg-amber-400 opacity-100'
                                        : 'opacity-0'
                                        }`}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* EXPANDABLE HABIT CREATION DRAWER */}
            {showCreateDrawer && (
                <div className="rounded-3xl backdrop-blur-xl bg-white/85 dark:bg-white/7 border border-gray-200/80 dark:border-white/12 p-1 shadow-lg">
                    <HabitForm
                        categories={categories}
                        onHabitCreated={() => {
                            fetchHabitsData();
                            setShowCreateDrawer(false);
                        }}
                        onCategoryCreated={fetchCategoriesData}
                    />
                </div>
            )}

            {/* HERO SUMMARY CARD (INSPIRED BY CALORIES HERO + HORSESHOE ARC) */}
            <div className="p-5 sm:p-6 rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-white/6 border border-gray-200/80 dark:border-white/12 shadow-sm flex items-center justify-between gap-4">
                <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-400 dark:text-slate-400">
                        Active Habits
                    </p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
                            {portfolioStats.activeCount}
                        </span>
                        <span className="text-sm font-semibold text-gray-400 dark:text-slate-400">
                            of {portfolioStats.total} tracked
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowCreateDrawer((prev) => !prev)}
                        className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                    >
                        <span>
                            {portfolioStats.pausedOrDone > 0
                                ? `${portfolioStats.pausedOrDone} paused or archived`
                                : 'All habits active & scheduled'}
                        </span>
                        <svg
                            className="w-3.5 h-3.5"
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
                    </button>
                </div>

                {/* Open-Bottom Horseshoe Progress Ring */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full rotate-140" viewBox="0 0 100 100">
                        <circle
                            cx="50"
                            cy="50"
                            r={ringRadius}
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={`${arcMax} ${ringCirc}`}
                            strokeLinecap="round"
                            className="stroke-gray-200/80 dark:stroke-white/10"
                        />
                        <circle
                            cx="50"
                            cy="50"
                            r={ringRadius}
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={`${arcFill} ${ringCirc}`}
                            strokeLinecap="round"
                            className="stroke-amber-400 transition-all duration-500"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-none">
                            {portfolioStats.activeRate}%
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 dark:text-slate-400 mt-1">
                            ACTIVE
                        </span>
                    </div>
                </div>
            </div>

            {/* THREE PRIORITY PILLAR CARDS (INSPIRED BY PROTEIN / CARBS / FAT CARDS) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {(
                    [
                        {
                            key: 'High' as const,
                            label: 'HIGH PRIORITY',
                            active: portfolioStats.highActive,
                            total: portfolioStats.highCount,
                            barClass: 'bg-rose-500',
                            dotClass: 'bg-rose-500',
                            ringClass: 'ring-rose-500/40 border-rose-400/50',
                        },
                        {
                            key: 'Medium' as const,
                            label: 'MEDIUM PRIORITY',
                            active: portfolioStats.mediumActive,
                            total: portfolioStats.mediumCount,
                            barClass: 'bg-amber-400',
                            dotClass: 'bg-amber-400',
                            ringClass: 'ring-amber-400/40 border-amber-400/50',
                        },
                        {
                            key: 'Low' as const,
                            label: 'LOW PRIORITY',
                            active: portfolioStats.lowActive,
                            total: portfolioStats.lowCount,
                            barClass: 'bg-violet-500',
                            dotClass: 'bg-violet-500',
                            ringClass: 'ring-violet-500/40 border-violet-400/50',
                        },
                    ] as const
                ).map((pillar) => {
                    const isSelected = selectedPriorityFilter === pillar.key;
                    const pct =
                        pillar.total > 0 ? Math.round((pillar.active / pillar.total) * 100) : 0;
                    const inactiveCount = Math.max(0, pillar.total - pillar.active);

                    return (
                        <button
                            key={pillar.key}
                            type="button"
                            onClick={() =>
                                setSelectedPriorityFilter((prev) =>
                                    prev === pillar.key ? 'ALL' : pillar.key
                                )
                            }
                            className={`text-left p-4 rounded-3xl backdrop-blur-xl transition-all border ${isSelected
                                ? `bg-white/95 dark:bg-white/12 ring-2 ${pillar.ringClass} shadow-md`
                                : 'bg-white/75 dark:bg-white/6 border-gray-200/80 dark:border-white/10 hover:bg-white/90 dark:hover:bg-white/9'
                                }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${pillar.dotClass}`} />
                                    <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">
                                        {pillar.label}
                                    </span>
                                </div>
                                {isSelected && (
                                    <span className="text-[10px] font-bold text-indigo-600 dark:text-amber-300">
                                        Filtered
                                    </span>
                                )}
                            </div>

                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                                    {pillar.active}
                                </span>
                                <span className="text-xs font-semibold text-gray-400 dark:text-slate-400">
                                    /{pillar.total}
                                </span>
                            </div>

                            <div className="mt-2.5 w-full h-1.5 rounded-full bg-gray-200/80 dark:bg-white/10 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${pillar.barClass}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>

                            <p className="mt-2 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                                {pillar.total === 0
                                    ? 'None assigned'
                                    : inactiveCount === 0
                                        ? '100% active'
                                        : `${inactiveCount} paused`}
                            </p>
                        </button>
                    );
                })}
            </div>

            {error && (
                <div className="p-4 text-xs font-medium text-red-700 dark:text-red-300 backdrop-blur-xl bg-red-500/12 border border-red-400/30 rounded-2xl w-full">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* HABITS LIST CONTAINER */}
            <div className="space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                        Your Habits ({filteredHabits.length})
                    </h2>

                    {(selectedCategoryFilter !== 'ALL' || selectedPriorityFilter !== 'ALL') && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedCategoryFilter('ALL');
                                setSelectedPriorityFilter('ALL');
                            }}
                            className="self-start sm:self-auto text-xs font-semibold text-indigo-600 dark:text-amber-400 hover:underline"
                        >
                            Clear active filters
                        </button>
                    )}
                </div>

                {/* Category Filter Pills */}
                {habits.length > 0 && categories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setSelectedCategoryFilter('ALL')}
                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-colors backdrop-blur-xl border ${selectedCategoryFilter === 'ALL'
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-950 border-gray-900 dark:border-white'
                                : 'bg-white/70 dark:bg-white/5 text-gray-600 dark:text-slate-300 border-gray-200/80 dark:border-white/10 hover:bg-white dark:hover:bg-white/10'
                                }`}
                        >
                            All Categories ({habits.length})
                        </button>

                        {categories.map((cat) => {
                            const idStr = String(cat.category_id);
                            const active = selectedCategoryFilter === idStr;
                            const count = habits.filter(
                                (h) => String(h.category_id ?? '') === idStr
                            ).length;
                            return (
                                <button
                                    key={cat.category_id}
                                    type="button"
                                    onClick={() => setSelectedCategoryFilter(idStr)}
                                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-colors backdrop-blur-xl border ${active
                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-950 border-gray-900 dark:border-white'
                                        : 'bg-white/70 dark:bg-white/5 text-gray-600 dark:text-slate-300 border-gray-200/80 dark:border-white/10 hover:bg-white dark:hover:bg-white/10'
                                        }`}
                                >
                                    {cat.category_name} ({count})
                                </button>
                            );
                        })}
                    </div>
                )}

                {loading && habits.length === 0 ? (
                    <div className="p-10 rounded-3xl backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-center text-sm text-gray-500 dark:text-slate-400">
                        Loading your habits...
                    </div>
                ) : habits.length === 0 ? (
                    <div className="p-10 rounded-3xl backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/15 text-center space-y-3">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">
                            No habits found yet
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                            Tap the <strong>+</strong> button to log your first daily habit.
                        </p>
                    </div>
                ) : filteredHabits.length === 0 ? (
                    <div className="p-8 rounded-3xl backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-center">
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                            No habits match the selected category or priority filter.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedCategoryFilter('ALL');
                                setSelectedPriorityFilter('ALL');
                            }}
                            className="px-4 py-2 text-xs font-bold rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-950 transition-colors"
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 lg:grid-cols-2 items-start gap-3.5">
                        {filteredHabits.map((habit) => {
                            const isEditing = editingId === habit.habit_id;
                            const isConfirmingDelete = confirmDeleteId === habit.habit_id;
                            const isBusy = actionLoading === habit.habit_id;
                            const categoryObj = habit.category_id
                                ? categoryMap.get(habit.category_id)
                                : undefined;

                            return (
                                <li
                                    key={habit.habit_id}
                                    className="p-4 sm:p-5 rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-white/6 border border-gray-200/80 dark:border-white/10 hover:bg-white/90 dark:hover:bg-white/9 transition-all flex flex-col justify-between gap-3.5 shadow-xs"
                                >
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                    Habit Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="w-full px-3.5 py-2 bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                        Category
                                                    </label>
                                                    <select
                                                        value={editCategoryId}
                                                        onChange={(e) =>
                                                            setEditCategoryId(e.target.value)
                                                        }
                                                        className="w-full px-3 py-2 bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400"
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {categories.map((cat) => (
                                                            <option
                                                                key={cat.category_id}
                                                                value={cat.category_id}
                                                            >
                                                                {cat.category_name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                        Priority
                                                    </label>
                                                    <select
                                                        value={editPriority}
                                                        onChange={(e) =>
                                                            setEditPriority(
                                                                e.target.value as
                                                                | 'High'
                                                                | 'Medium'
                                                                | 'Low'
                                                            )
                                                        }
                                                        className="w-full px-3 py-2 bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400"
                                                    >
                                                        <option value="High">High</option>
                                                        <option value="Medium">Medium</option>
                                                        <option value="Low">Low</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                        Status
                                                    </label>
                                                    <select
                                                        value={editStatus}
                                                        onChange={(e) =>
                                                            setEditStatus(
                                                                e.target.value as Habit['status']
                                                            )
                                                        }
                                                        className="w-full px-3 py-2 bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400"
                                                    >
                                                        <option value="Active">Active</option>
                                                        <option value="Paused">Paused</option>
                                                        <option value="Completed">Completed</option>
                                                        <option value="Archived">Archived</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                    Description
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    value={editDescription}
                                                    onChange={(e) =>
                                                        setEditDescription(e.target.value)
                                                    }
                                                    className="w-full px-3.5 py-2 bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-amber-400"
                                                />
                                            </div>

                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={cancelEditing}
                                                    className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/15 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isBusy || !editName.trim()}
                                                    onClick={() => handleSaveEdit(habit.habit_id)}
                                                    className="px-4 py-1.5 text-xs font-bold rounded-full bg-gray-900 dark:bg-amber-400 text-white dark:text-gray-950 transition-colors disabled:opacity-50"
                                                >
                                                    {isBusy ? 'Saving...' : 'Save Changes'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Row Top: Rounded Square Icon Tile + Title & Metadata Pills */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                                    <div
                                                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm border ${habit.priority === 'High'
                                                            ? 'bg-rose-500/12 border-rose-400/30 text-rose-600 dark:text-rose-300'
                                                            : habit.priority === 'Medium'
                                                                ? 'bg-amber-500/12 border-amber-400/30 text-amber-600 dark:text-amber-300'
                                                                : 'bg-violet-500/12 border-violet-400/30 text-violet-600 dark:text-violet-300'
                                                            }`}
                                                    >
                                                        {habit.habit_name.slice(0, 2).toUpperCase()}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="font-bold text-base text-gray-900 dark:text-white wrap-break-word leading-snug">
                                                            {habit.habit_name}
                                                        </h3>
                                                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                                            {habit.description ||
                                                                'No description provided'}
                                                        </p>

                                                        {/* Compact Metadata Badges (Inspired by P / C / F Macro Chips) */}
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                                            {categoryObj && (
                                                                <span
                                                                    className={`px-2.5 py-0.5 text-[11px] rounded-full font-semibold border ${getCategoryBadgeClass(
                                                                        categoryObj.category_id
                                                                    )}`}
                                                                >
                                                                    {categoryObj.category_name}
                                                                </span>
                                                            )}

                                                            <span
                                                                className={`px-2.5 py-0.5 text-[11px] rounded-full font-semibold border ${habit.priority === 'High'
                                                                    ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-400/25'
                                                                    : habit.priority === 'Medium'
                                                                        ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-400/25'
                                                                        : 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-400/25'
                                                                    }`}
                                                            >
                                                                {habit.priority}
                                                            </span>

                                                            <span
                                                                className={`px-2.5 py-0.5 text-[11px] rounded-full font-semibold ${(habit.status || 'Active') ===
                                                                    'Active'
                                                                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                                                    : 'bg-gray-200/80 dark:bg-white/10 text-gray-600 dark:text-slate-300'
                                                                    }`}
                                                            >
                                                                {habit.status || 'Active'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-gray-200/70 dark:border-white/8">
                                                {isConfirmingDelete ? (
                                                    <>
                                                        <span className="text-xs text-red-600 dark:text-red-400 font-semibold mr-auto">
                                                            Delete this habit?
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/15 text-gray-700 dark:text-slate-300"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                handleConfirmDelete(habit.habit_id)
                                                            }
                                                            className="px-3 py-1 text-xs font-bold rounded-full bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                                                        >
                                                            {isBusy ? 'Deleting...' : 'Confirm'}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setOpenScheduleHabitId((prev) =>
                                                                    prev === habit.habit_id
                                                                        ? null
                                                                        : habit.habit_id
                                                                )
                                                            }
                                                            className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-colors mr-auto ${openScheduleHabitId ===
                                                                habit.habit_id
                                                                ? 'bg-gray-900 dark:bg-amber-400 text-white dark:text-gray-950 border-transparent'
                                                                : 'bg-white/70 dark:bg-white/6 border-gray-200 dark:border-white/12 text-indigo-600 dark:text-amber-300 hover:bg-white dark:hover:bg-white/12'
                                                                }`}
                                                        >
                                                            {openScheduleHabitId === habit.habit_id
                                                                ? 'Hide Schedule'
                                                                : 'Schedule'}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => startEditing(habit)}
                                                            className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white/70 dark:bg-white/6 border border-gray-200 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/12 transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setConfirmDeleteId(habit.habit_id)
                                                            }
                                                            className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white/70 dark:bg-white/6 border border-gray-200 dark:border-white/12 text-gray-700 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300/60 transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            {/* Expandable Weekly Schedule Manager */}
                                            {openScheduleHabitId === habit.habit_id && (
                                                <HabitScheduleManager
                                                    habitId={habit.habit_id}
                                                    habitName={habit.habit_name}
                                                />
                                            )}
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* FLOATING CIRCULAR '+' QUICK-ADD BUTTON */}
            <button
                type="button"
                aria-label="Create new habit"
                onClick={() => {
                    setShowCreateDrawer((prev) => !prev);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="fixed bottom-24 md:bottom-6 right-5 md:right-6 z-30 w-14 h-14 rounded-full bg-gray-900 hover:bg-gray-800 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-gray-950 shadow-xl flex items-center justify-center text-2xl font-light transition-transform active:scale-95"
            >
                {showCreateDrawer ? '×' : '+'}
            </button>
        </div>
    );
};