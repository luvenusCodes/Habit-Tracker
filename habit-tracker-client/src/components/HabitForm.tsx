import { useState } from 'react';
import type { Category } from '../types';
import type { HabitCreatePayload } from '../services/api';
import { createHabit, createCategory } from '../services/api';

interface HabitFormProps {
    categories: Category[];
    onHabitCreated: () => void;
    onCategoryCreated: () => Promise<void>;
}

export const HabitForm = ({ categories, onHabitCreated, onCategoryCreated }: HabitFormProps) => {
    const [habitName, setHabitName] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
    const [categoryId, setCategoryId] = useState<string>('');

    // Inline quick category creation state
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categorySaving, setCategorySaving] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleQuickCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        setCategorySaving(true);
        setError(null);
        try {
            const created = await createCategory({ category_name: newCategoryName.trim() });
            await onCategoryCreated();
            if (created?.category_id) {
                setCategoryId(String(created.category_id));
            }
            setNewCategoryName('');
            setIsAddingCategory(false);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCategorySaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!habitName.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const payload: HabitCreatePayload = {
                habit_name: habitName.trim(),
                description: description.trim() || undefined,
                priority,
                category_id: categoryId ? Number(categoryId) : undefined,
            };

            await createHabit(payload);

            setHabitName('');
            setDescription('');
            setPriority('Medium');

            onHabitCreated();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <h3 className="text-lg sm:text-xl font-bold mb-4 text-gray-900 dark:text-white tracking-tight">Create New Habit</h3>

            {error && (
                <div className="p-3 mb-4 text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Habit Name</label>
                        <input
                            type="text"
                            value={habitName}
                            onChange={(e) => setHabitName(e.target.value)}
                            placeholder="e.g., Morning Jog"
                            required
                            className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                            <button
                                type="button"
                                onClick={() => setIsAddingCategory((prev) => !prev)}
                                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                {isAddingCategory ? 'Cancel' : '+ New'}
                            </button>
                        </div>

                        {isAddingCategory ? (
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Category name"
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                                />
                                <button
                                    type="button"
                                    disabled={categorySaving || !newCategoryName.trim()}
                                    onClick={handleQuickCreateCategory}
                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl disabled:opacity-50 shrink-0"
                                >
                                    {categorySaving ? '...' : 'Add'}
                                </button>
                            </div>
                        ) : (
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white"
                            >
                                <option value="">Default / Unassigned</option>
                                {categories.map((cat) => (
                                    <option key={cat.category_id} value={cat.category_id}>
                                        {cat.category_name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                            className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white"
                        >
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g., Run 3 Kilometers around the neighborhood"
                        rows={2}
                        className="w-full px-4 py-2.5 sm:py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-white dark:placeholder-gray-400"
                    />
                </div>

                <div className="flex justify-end pt-1">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full sm:w-auto py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 text-sm"
                    >
                        {loading ? 'Creating Habit...' : 'Add Habit'}
                    </button>
                </div>
            </form>
        </div>
    );
};