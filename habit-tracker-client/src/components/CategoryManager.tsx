import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Category, Habit } from '../types';
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getHabits,
} from '../services/api';

export const CategoryManager = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);

    // Create category form state
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [creating, setCreating] = useState(false);

    // Inline editing state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // Two-step delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [catData, habitData] = await Promise.all([getCategories(), getHabits()]);
            setCategories(catData);
            setHabits(habitData);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const habitCountByCategory = useMemo(() => {
        const counts = new Map<number, number>();
        for (const h of habits) {
            if (h.category_id != null) {
                counts.set(h.category_id, (counts.get(h.category_id) || 0) + 1);
            }
        }
        return counts;
    }, [habits]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        try {
            setCreating(true);
            setError(null);
            await createCategory({
                category_name: newCategoryName.trim(),
                description: newDescription.trim() || undefined,
            });
            setBanner(`Category "${newCategoryName.trim()}" created.`);
            setNewCategoryName('');
            setNewDescription('');
            await loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const startEditing = (cat: Category) => {
        setEditingId(cat.category_id);
        setEditName(cat.category_name);
        setEditDescription(cat.description || '');
        setConfirmDeleteId(null);
        setError(null);
    };

    const handleSaveEdit = async (categoryId: number) => {
        if (!editName.trim()) return;
        try {
            setActionLoading(categoryId);
            setError(null);
            await updateCategory(categoryId, {
                category_name: editName.trim(),
                description: editDescription.trim(),
            });
            setEditingId(null);
            setBanner('Category updated successfully.');
            await loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleConfirmDelete = async (categoryId: number) => {
        try {
            setActionLoading(categoryId);
            setError(null);
            await deleteCategory(categoryId);
            setConfirmDeleteId(null);
            setBanner('Category deleted.');
            await loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Create New Category Card */}
            <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <h2 className="text-lg sm:text-xl font-bold mb-1 text-gray-900 dark:text-white tracking-tight">
                    Categories
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Organize your habits into focused areas like Fitness, Deep Work, or Health.
                </p>

                {banner && (
                    <div className="flex items-center justify-between p-3 mb-4 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
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
                    <div className="p-3 mb-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Category Name
                            </label>
                            <input
                                type="text"
                                required
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                placeholder="e.g., Fitness & Mobility"
                                className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description (optional)
                            </label>
                            <input
                                type="text"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="e.g., Strength training, walks, and recovery"
                                className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-1">
                        <button
                            type="submit"
                            disabled={creating || !newCategoryName.trim()}
                            className="w-full sm:w-auto py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm"
                        >
                            {creating ? 'Creating...' : 'Add Category'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Existing Categories List */}
            <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Your Categories ({categories.length})
                    </h3>
                </div>

                {loading ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-sm">
                        Loading categories...
                    </p>
                ) : categories.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-sm">
                        No categories yet. Add your first category above to group your habits.
                    </p>
                ) : (
                    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                        {categories.map((cat) => {
                            const isEditing = editingId === cat.category_id;
                            const isConfirmingDelete = confirmDeleteId === cat.category_id;
                            const isBusy = actionLoading === cat.category_id;
                            const linkedCount = habitCountByCategory.get(cat.category_id) || 0;

                            return (
                                <li
                                    key={cat.category_id}
                                    className="p-4 border border-gray-100 dark:border-gray-700 rounded-xl flex flex-col justify-between gap-3 hover:shadow-md transition-all bg-gray-50/50 dark:bg-gray-700/30"
                                >
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                    Category Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                    Description
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editDescription}
                                                    onChange={(e) => setEditDescription(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => setEditingId(null)}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isBusy || !editName.trim()}
                                                    onClick={() => handleSaveEdit(cat.category_id)}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                                >
                                                    {isBusy ? 'Saving...' : 'Save Changes'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-semibold text-base text-gray-800 dark:text-gray-100 wrap-break-word">
                                                        {cat.category_name}
                                                    </h4>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 wrap-break-word">
                                                        {cat.description || 'No description provided'}
                                                    </p>
                                                </div>
                                                <span className="px-2.5 py-1 text-xs rounded-full font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                                    {linkedCount} {linkedCount === 1 ? 'habit' : 'habits'}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/80">
                                                {isConfirmingDelete ? (
                                                    <>
                                                        <span className="text-xs text-red-600 dark:text-red-400 font-medium mr-auto">
                                                            {linkedCount > 0
                                                                ? `Reassign ${linkedCount} habit(s) first before deleting.`
                                                                : 'Delete this category?'}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                                                        >
                                                            Cancel
                                                        </button>
                                                        {linkedCount === 0 && (
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleConfirmDelete(cat.category_id)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                                                            >
                                                                {isBusy ? 'Deleting...' : 'Confirm'}
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditing(cat)}
                                                            className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteId(cat.category_id)}
                                                            className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                            </div>
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