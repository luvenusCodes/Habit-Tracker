import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Habit, Category } from '../types';
import { getHabits, getCategories, updateHabit, deleteHabit } from '../services/api';
import { HabitForm } from './HabitForm';
import { HabitScheduleManager } from './HabitScheduleManager';

export const HabitList = () => {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
    const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<'ALL' | 'High' | 'Medium' | 'Low'>('ALL');

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

    const categoryMap = useMemo(() => {
        const map = new Map<number, Category>();
        categories.forEach((cat) => map.set(cat.category_id, cat));
        return map;
    }, [categories]);

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

    return (
        <div className="space-y-6">
            {/* Habit Creation Form */}
            <HabitForm
                categories={categories}
                onHabitCreated={fetchHabitsData}
                onCategoryCreated={fetchCategoriesData}
            />

            {error && (
                <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl w-full">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Habit List Section */}
            <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Your Habits</h2>

                    {habits.length > 0 && (
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <label htmlFor="habit-priority-filter" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Priority:
                            </label>
                            <select
                                id="habit-priority-filter"
                                value={selectedPriorityFilter}
                                onChange={(e) => setSelectedPriorityFilter(e.target.value as 'ALL' | 'High' | 'Medium' | 'Low')}
                                className="px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="ALL">All Priorities</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Category Filter Pills */}
                {habits.length > 0 && categories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-5 pb-4 border-b border-gray-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={() => setSelectedCategoryFilter('ALL')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedCategoryFilter === 'ALL'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            All Categories ({habits.length})
                        </button>

                        {categories.map((cat) => {
                            const idStr = String(cat.category_id);
                            const active = selectedCategoryFilter === idStr;
                            const count = habits.filter((h) => String(h.category_id ?? '') === idStr).length;
                            return (
                                <button
                                    key={cat.category_id}
                                    type="button"
                                    onClick={() => setSelectedCategoryFilter(idStr)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${active
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {cat.category_name} ({count})
                                </button>
                            );
                        })}
                    </div>
                )}

                {loading && habits.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading your habits...</p>
                ) : habits.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">No habits found yet. Time to log your first one above!</p>
                ) : filteredHabits.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500 dark:text-gray-400 mb-3">No habits match the selected category or priority filter.</p>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedCategoryFilter('ALL');
                                setSelectedPriorityFilter('ALL');
                            }}
                            className="px-4 py-2 text-xs font-medium rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 lg:grid-cols-2 items-start gap-3 sm:gap-4">
                        {filteredHabits.map((habit) => {
                            const isEditing = editingId === habit.habit_id;
                            const isConfirmingDelete = confirmDeleteId === habit.habit_id;
                            const isBusy = actionLoading === habit.habit_id;
                            const categoryObj = habit.category_id ? categoryMap.get(habit.category_id) : undefined;

                            return (
                                <li
                                    key={habit.habit_id}
                                    className="p-4 border border-gray-100 dark:border-gray-700 rounded-xl flex flex-col justify-between gap-3 hover:shadow-md transition-all bg-gray-50/50 dark:bg-gray-700/30"
                                >
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Habit Name</label>
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category</label>
                                                    <select
                                                        value={editCategoryId}
                                                        onChange={(e) => setEditCategoryId(e.target.value)}
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {categories.map((cat) => (
                                                            <option key={cat.category_id} value={cat.category_id}>
                                                                {cat.category_name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Priority</label>
                                                    <select
                                                        value={editPriority}
                                                        onChange={(e) => setEditPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="High">High</option>
                                                        <option value="Medium">Medium</option>
                                                        <option value="Low">Low</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Status</label>
                                                    <select
                                                        value={editStatus}
                                                        onChange={(e) => setEditStatus(e.target.value as Habit['status'])}
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="Active">Active</option>
                                                        <option value="Paused">Paused</option>
                                                        <option value="Completed">Completed</option>
                                                        <option value="Archived">Archived</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description</label>
                                                <textarea
                                                    rows={2}
                                                    value={editDescription}
                                                    onChange={(e) => setEditDescription(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>

                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={cancelEditing}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isBusy || !editName.trim()}
                                                    onClick={() => handleSaveEdit(habit.habit_id)}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                                                >
                                                    {isBusy ? 'Saving...' : 'Save Changes'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="font-semibold text-base sm:text-lg text-gray-800 dark:text-gray-100 wrap-break-word">
                                                            {habit.habit_name}
                                                        </h3>
                                                        {categoryObj && (
                                                            <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                                                {categoryObj.category_name}
                                                            </span>
                                                        )}
                                                        {habit.status && habit.status !== 'Active' && (
                                                            <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200">
                                                                {habit.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 wrap-break-word">
                                                        {habit.description || 'No description provided'}
                                                    </p>
                                                </div>

                                                <span className={`px-3 py-1 text-xs rounded-full font-medium shrink-0 ${habit.priority === 'High'
                                                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800'
                                                    : habit.priority === 'Medium'
                                                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                                        : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                                    }`}>
                                                    {habit.priority}
                                                </span>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/80">
                                                {isConfirmingDelete ? (
                                                    <>
                                                        <span className="text-xs text-red-600 dark:text-red-400 font-medium mr-auto">
                                                            Delete this habit?
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => handleConfirmDelete(habit.habit_id)}
                                                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
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
                                                                    prev === habit.habit_id ? null : habit.habit_id
                                                                )
                                                            }
                                                            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors mr-auto ${openScheduleHabitId === habit.habit_id
                                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                                                                }`}
                                                        >
                                                            {openScheduleHabitId === habit.habit_id ? 'Hide Schedule' : 'Schedule'}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => startEditing(habit)}
                                                            className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteId(habit.habit_id)}
                                                            className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
        </div>
    );
};