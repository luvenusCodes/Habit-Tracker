import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Category, Habit } from '../types';
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getHabits,
} from '../services/api';

interface CategoryTheme {
    name: string;
    barClass: string;
    glowClass: string;
    strokeClass: string;
    dotClass: string;
    badgeClass: string;
    ringBgClass: string;
    ringTextClass: string;
}

const CATEGORY_THEMES: CategoryTheme[] = [
    {
        name: 'Electric Blue',
        barClass: 'bg-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.75)]',
        glowClass: 'from-blue-500/18',
        strokeClass: 'stroke-blue-500 dark:stroke-blue-400',
        dotClass: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]',
        badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/30',
        ringBgClass: 'bg-blue-500/15 border-blue-400/30',
        ringTextClass: 'text-blue-600 dark:text-blue-300',
    },
    {
        name: 'Coral Orange',
        barClass: 'bg-orange-500 shadow-[0_0_16px_rgba(249,115,22,0.75)]',
        glowClass: 'from-orange-500/18',
        strokeClass: 'stroke-orange-500 dark:stroke-orange-400',
        dotClass: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]',
        badgeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-400/30',
        ringBgClass: 'bg-orange-500/15 border-orange-400/30',
        ringTextClass: 'text-orange-600 dark:text-orange-300',
    },
    {
        name: 'Mint Aqua',
        barClass: 'bg-teal-400 shadow-[0_0_16px_rgba(45,212,191,0.75)]',
        glowClass: 'from-teal-400/18',
        strokeClass: 'stroke-teal-500 dark:stroke-teal-300',
        dotClass: 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]',
        badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-400/30',
        ringBgClass: 'bg-teal-400/15 border-teal-400/30',
        ringTextClass: 'text-teal-600 dark:text-teal-300',
    },
    {
        name: 'Violet Pulse',
        barClass: 'bg-violet-500 shadow-[0_0_16px_rgba(139,92,246,0.75)]',
        glowClass: 'from-violet-500/18',
        strokeClass: 'stroke-violet-500 dark:stroke-violet-400',
        dotClass: 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]',
        badgeClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400/30',
        ringBgClass: 'bg-violet-500/15 border-violet-400/30',
        ringTextClass: 'text-violet-600 dark:text-violet-300',
    },
    {
        name: 'Emerald Neon',
        barClass: 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.75)]',
        glowClass: 'from-emerald-400/18',
        strokeClass: 'stroke-emerald-500 dark:stroke-emerald-400',
        dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30',
        ringBgClass: 'bg-emerald-400/15 border-emerald-400/30',
        ringTextClass: 'text-emerald-600 dark:text-emerald-300',
    },
    {
        name: 'Rose Magenta',
        barClass: 'bg-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.75)]',
        glowClass: 'from-rose-500/18',
        strokeClass: 'stroke-rose-500 dark:stroke-rose-400',
        dotClass: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30',
        ringBgClass: 'bg-rose-500/15 border-rose-400/30',
        ringTextClass: 'text-rose-600 dark:text-rose-300',
    },
];

const getCategoryTheme = (categoryId: number, index: number): CategoryTheme => {
    const idx = Math.abs(categoryId || index) % CATEGORY_THEMES.length;
    return CATEGORY_THEMES[idx];
};

export const CategoryManager = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);

    // Create category drawer state
    const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
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
            setSelectedCategoryId((prev) =>
                prev && catData.some((c) => c.category_id === prev)
                    ? prev
                    : catData[0]?.category_id ?? null
            );
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const habitsByCategory = useMemo(() => {
        const map = new Map<number, Habit[]>();
        for (const h of habits) {
            if (h.category_id != null && h.status !== 'Deleted') {
                const list = map.get(h.category_id) || [];
                list.push(h);
                map.set(h.category_id, list);
            }
        }
        return map;
    }, [habits]);

    const totalCategorizedHabits = useMemo(() => {
        let sum = 0;
        habitsByCategory.forEach((list) => {
            sum += list.length;
        });
        return sum;
    }, [habitsByCategory]);

    // Top 3 categories for concentric multi-ring breakdown
    const topRingMetrics = useMemo(() => {
        const enriched = categories.map((cat, idx) => {
            const list = habitsByCategory.get(cat.category_id) || [];
            const pct =
                totalCategorizedHabits > 0
                    ? Math.round((list.length / totalCategorizedHabits) * 100)
                    : 0;
            return {
                category: cat,
                count: list.length,
                pct,
                theme: getCategoryTheme(cat.category_id, idx),
            };
        });
        return enriched.sort((a, b) => b.count - a.count).slice(0, 3);
    }, [categories, habitsByCategory, totalCategorizedHabits]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        try {
            setCreating(true);
            setError(null);
            const created = await createCategory({
                category_name: newCategoryName.trim(),
                description: newDescription.trim() || undefined,
            });
            setBanner(`Category "${newCategoryName.trim()}" created.`);
            setNewCategoryName('');
            setNewDescription('');
            setShowCreateForm(false);
            await loadData();
            if (created?.category_id) {
                setSelectedCategoryId(created.category_id);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const startEditing = (cat: Category, e: React.MouseEvent) => {
        e.stopPropagation();
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

    const selectedCategory =
        categories.find((c) => c.category_id === selectedCategoryId) ?? categories[0] ?? null;
    const selectedIndex = selectedCategory
        ? categories.findIndex((c) => c.category_id === selectedCategory.category_id)
        : 0;
    const selectedTheme = selectedCategory
        ? getCategoryTheme(selectedCategory.category_id, selectedIndex)
        : CATEGORY_THEMES[0];
    const selectedCategoryHabits = selectedCategory
        ? habitsByCategory.get(selectedCategory.category_id) || []
        : [];
    const selectedSharePct =
        totalCategorizedHabits > 0
            ? Math.round((selectedCategoryHabits.length / totalCategorizedHabits) * 100)
            : 0;

    return (
        <div className="relative space-y-6 pb-8">
            {/* Ambient Background Orbs for Glassmorphism */}
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 overflow-hidden -z-10"
            >
                <div className="absolute top-16 left-1/4 w-80 h-80 rounded-full bg-blue-500/12 dark:bg-blue-500/14 blur-3xl" />
                <div className="absolute bottom-20 right-1/5 w-96 h-96 rounded-full bg-teal-400/10 dark:bg-teal-400/12 blur-3xl" />
                <div className="absolute top-1/2 left-10 w-64 h-64 rounded-full bg-orange-500/8 dark:bg-orange-500/10 blur-3xl" />
            </div>

            {/* TOP HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400">
                        Habit Architecture
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mt-0.5">
                        Categories &amp; Focus Groups
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
                        Organize your habits into color-coded focus areas with live distribution insights.
                    </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="px-3.5 py-1.5 rounded-full font-semibold backdrop-blur-xl bg-white/75 dark:bg-white/6 border border-gray-200/80 dark:border-white/12 text-gray-700 dark:text-slate-200 shadow-xs">
                        {categories.length} {categories.length === 1 ? 'Group' : 'Groups'} •{' '}
                        {totalCategorizedHabits} Habits
                    </span>
                </div>
            </div>

            {/* FEEDBACK BANNERS */}
            {banner && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl backdrop-blur-xl bg-emerald-500/12 border border-emerald-400/30 text-xs font-medium text-emerald-800 dark:text-emerald-200">
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
                <div className="flex items-center justify-between p-3.5 rounded-2xl backdrop-blur-xl bg-red-500/12 border border-red-400/30 text-xs font-medium text-red-700 dark:text-red-300">
                    <span>
                        <strong>Error:</strong> {error}
                    </span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="font-bold underline ml-4 shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* MAIN BENTO GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: GLASSY CATEGORY CARDS + + CREATE NEW CATEGORY BUTTON */}
                <div className="lg:col-span-5 space-y-3.5">
                    {loading ? (
                        <div className="p-8 rounded-3xl backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-center text-sm text-gray-500 dark:text-slate-400">
                            Loading categories...
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="p-8 rounded-3xl backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/15 text-center">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                No categories yet
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                Click below to create your first color-coded habit group.
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {categories.map((cat, idx) => {
                                const theme = getCategoryTheme(cat.category_id, idx);
                                const isSelected = selectedCategory?.category_id === cat.category_id;
                                const isEditing = editingId === cat.category_id;
                                const isConfirmingDelete = confirmDeleteId === cat.category_id;
                                const isBusy = actionLoading === cat.category_id;
                                const catHabits = habitsByCategory.get(cat.category_id) || [];
                                const linkedCount = catHabits.length;

                                return (
                                    <li
                                        key={cat.category_id}
                                        onClick={() => {
                                            if (!isEditing) {
                                                setSelectedCategoryId(cat.category_id);
                                                setConfirmDeleteId(null);
                                            }
                                        }}
                                        className={`group relative overflow-hidden rounded-2xl backdrop-blur-xl transition-all cursor-pointer border ${isSelected
                                                ? 'bg-white/90 dark:bg-white/10 border-blue-400/60 dark:border-white/25 shadow-lg shadow-black/5 dark:shadow-black/30'
                                                : 'bg-white/65 dark:bg-white/5 border-gray-200/80 dark:border-white/10 hover:bg-white/85 dark:hover:bg-white/8'
                                            }`}
                                    >
                                        {/* Subtle Specular Color Glow Behind Left Accent Bar */}
                                        <div
                                            aria-hidden="true"
                                            className={`pointer-events-none absolute inset-y-0 left-0 w-24 bg-linear-to-r ${theme.glowClass} to-transparent opacity-80`}
                                        />

                                        {isEditing ? (
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="relative z-10 p-4 space-y-3"
                                            >
                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                        Category Name
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="w-full px-3.5 py-2 rounded-xl bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1">
                                                        Description
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editDescription}
                                                        onChange={(e) => setEditDescription(e.target.value)}
                                                        className="w-full px-3.5 py-2 rounded-xl bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/15 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        disabled={isBusy}
                                                        onClick={() => setEditingId(null)}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/15 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isBusy || !editName.trim()}
                                                        onClick={() => handleSaveEdit(cat.category_id)}
                                                        className="px-4 py-1.5 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                                                    >
                                                        {isBusy ? 'Saving...' : 'Save'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative z-10 p-4 flex items-center justify-between gap-3">
                                                {/* Glowing Left Vertical Accent Bar + Name & Habit Count */}
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <span
                                                        className={`w-1.5 h-11 rounded-full shrink-0 ${theme.barClass}`}
                                                    />
                                                    <div className="min-w-0">
                                                        <h3 className="font-bold text-base text-gray-900 dark:text-white truncate">
                                                            {cat.category_name}
                                                        </h3>
                                                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                                                            {linkedCount}{' '}
                                                            {linkedCount === 1 ? 'habit' : 'habits'}
                                                            {cat.description ? ` • ${cat.description}` : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Quick Edit / Delete Action Icons */}
                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1.5 shrink-0"
                                                >
                                                    {isConfirmingDelete ? (
                                                        <div className="flex items-center gap-1.5">
                                                            {linkedCount === 0 && (
                                                                <button
                                                                    type="button"
                                                                    disabled={isBusy}
                                                                    onClick={() =>
                                                                        handleConfirmDelete(cat.category_id)
                                                                    }
                                                                    className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                                                                >
                                                                    {isBusy ? '...' : 'Confirm'}
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => setConfirmDeleteId(null)}
                                                                className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-gray-200/80 dark:bg-white/10 text-gray-700 dark:text-slate-200"
                                                            >
                                                                {linkedCount > 0 ? 'In Use' : 'Cancel'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                title="Edit category"
                                                                onClick={(e) => startEditing(cat, e)}
                                                                className="p-2 rounded-xl text-gray-400 hover:text-gray-800 dark:text-slate-400 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-white/10 transition-colors"
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
                                                                        strokeWidth={1.8}
                                                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                                    />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                title="Delete category"
                                                                onClick={() =>
                                                                    setConfirmDeleteId(cat.category_id)
                                                                }
                                                                className="p-2 rounded-xl text-gray-400 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50/80 dark:hover:bg-red-500/15 transition-colors"
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
                                                                        strokeWidth={1.8}
                                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                    />
                                                                </svg>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {confirmDeleteId === cat.category_id && linkedCount > 0 && (
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="relative z-10 px-4 pb-3 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                                            >
                                                Reassign {linkedCount}{' '}
                                                {linkedCount === 1 ? 'habit' : 'habits'} first before
                                                deleting this category.
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* Prominent Full-Width + CREATE NEW CATEGORY Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowCreateForm((prev) => !prev);
                            setError(null);
                        }}
                        className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs uppercase tracking-[0.16em] shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2"
                    >
                        <span className="text-base leading-none">
                            {showCreateForm ? '×' : '+'}
                        </span>
                        <span>{showCreateForm ? 'Close Form' : 'Create New Category'}</span>
                    </button>

                    {/* Glassy Expandable Create Category Drawer */}
                    {showCreateForm && (
                        <form
                            onSubmit={handleCreate}
                            className="p-5 rounded-3xl backdrop-blur-xl bg-white/85 dark:bg-white/7 border border-gray-200/80 dark:border-white/12 shadow-lg space-y-3.5"
                        >
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                New Focus Category
                            </h3>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                    Category Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="e.g., Fitness & Mobility"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/12 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                    Description (optional)
                                </label>
                                <input
                                    type="text"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder="e.g., Strength training, walks, and recovery"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/12 text-sm text-gray-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="px-4 py-2 text-xs font-semibold rounded-full border border-gray-200 dark:border-white/12 text-gray-600 dark:text-slate-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !newCategoryName.trim()}
                                    className="px-5 py-2 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                                >
                                    {creating ? 'Creating...' : 'Save Category'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* RIGHT COLUMN: CONCENTRIC MULTI-RING BREAKDOWN + SELECTED CATEGORY INSPECTOR */}
                <div className="lg:col-span-7 space-y-5">
                    {/* Concentric Multi-Ring Habit Distribution Card */}
                    <div className="p-5 sm:p-6 rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-white/6 border border-gray-200/80 dark:border-white/12 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                                    Habit Distribution
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                    Share of active habits across your top focus groups
                                </p>
                            </div>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                {totalCategorizedHabits} Total
                            </span>
                        </div>

                        {topRingMetrics.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-slate-400 py-6 text-center">
                                Create categories and assign habits to visualize your distribution rings.
                            </p>
                        ) : (
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                {/* Concentric SVG Arcs */}
                                <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                                        {topRingMetrics.map((item, idx) => {
                                            const radii = [56, 42, 28];
                                            const r = radii[idx];
                                            const circ = 2 * Math.PI * r;
                                            const offset =
                                                circ - (Math.min(100, item.pct) / 100) * circ;
                                            return (
                                                <g key={item.category.category_id}>
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={r}
                                                        strokeWidth="8"
                                                        fill="transparent"
                                                        className="stroke-gray-200/80 dark:stroke-white/8"
                                                    />
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={r}
                                                        strokeWidth="8"
                                                        fill="transparent"
                                                        strokeDasharray={circ}
                                                        strokeDashoffset={offset}
                                                        strokeLinecap="round"
                                                        className={`transition-all duration-500 ${item.theme.strokeClass}`}
                                                    />
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>

                                {/* Legend Breakdown */}
                                <div className="flex-1 w-full space-y-2.5">
                                    {topRingMetrics.map((item) => (
                                        <div
                                            key={item.category.category_id}
                                            onClick={() =>
                                                setSelectedCategoryId(item.category.category_id)
                                            }
                                            className="cursor-pointer flex items-center justify-between p-2.5 rounded-2xl bg-white/60 dark:bg-white/4 hover:bg-white/90 dark:hover:bg-white/8 border border-gray-200/60 dark:border-white/8 transition-colors"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span
                                                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.theme.dotClass}`}
                                                />
                                                <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">
                                                    {item.category.category_name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[11px] text-gray-500 dark:text-slate-400">
                                                    {item.count} {item.count === 1 ? 'habit' : 'habits'}
                                                </span>
                                                <span className="text-xs font-extrabold text-gray-900 dark:text-white w-10 text-right">
                                                    {item.pct}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Selected Category Glassy Habit Inspector */}
                    {selectedCategory && (
                        <div className="relative overflow-hidden p-5 sm:p-6 rounded-3xl backdrop-blur-xl bg-white/75 dark:bg-white/6 border border-gray-200/80 dark:border-white/12 shadow-sm space-y-4">
                            <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-linear-to-bl ${selectedTheme.glowClass} to-transparent blur-2xl`}
                            />

                            <div className="relative z-10 flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3.5">
                                    <div
                                        className={`w-11 h-11 rounded-2xl border flex items-center justify-center font-extrabold text-sm shrink-0 ${selectedTheme.ringBgClass} ${selectedTheme.ringTextClass}`}
                                    >
                                        {selectedSharePct}%
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-gray-400 dark:text-slate-400">
                                            Selected Group
                                        </span>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                            {selectedCategory.category_name}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                            {selectedCategory.description ||
                                                'No description provided for this category.'}
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${selectedTheme.badgeClass}`}
                                >
                                    {selectedCategoryHabits.length}{' '}
                                    {selectedCategoryHabits.length === 1 ? 'Habit' : 'Habits'}
                                </span>
                            </div>

                            <div className="relative z-10 pt-2 border-t border-gray-200/70 dark:border-white/10">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400 mb-2.5">
                                    Habits in {selectedCategory.category_name}
                                </p>

                                {selectedCategoryHabits.length === 0 ? (
                                    <p className="text-xs text-gray-500 dark:text-slate-400 py-4 text-center rounded-2xl bg-gray-50/70 dark:bg-white/4 border border-dashed border-gray-200 dark:border-white/10">
                                        No habits assigned to this category yet. Assign habits to{' '}
                                        <strong>{selectedCategory.category_name}</strong> from the
                                        Habits tab.
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {selectedCategoryHabits.map((h) => (
                                            <li
                                                key={h.habit_id}
                                                className="flex items-center justify-between p-3 rounded-2xl bg-white/70 dark:bg-white/5 border border-gray-200/70 dark:border-white/8"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span
                                                        className={`w-2 h-2 rounded-full shrink-0 ${selectedTheme.dotClass}`}
                                                    />
                                                    <span className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                                                        {h.habit_name}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/8 text-gray-600 dark:text-slate-300 shrink-0">
                                                    {h.status || 'Active'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};