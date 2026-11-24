import { useEffect, useState, useCallback } from 'react';
import type { DayOfWeek, HabitSchedule } from '../types';
import {
    getHabitSchedules,
    createHabitSchedule,
    updateHabitScheduleStatus,
    deleteHabitSchedule,
} from '../services/api';

interface HabitScheduleManagerProps {
    habitId: number;
    habitName: string;
}

const DAYS_OF_WEEK: DayOfWeek[] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
];

const SHORT_DAY_LABELS: Record<DayOfWeek, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
};

const formatTimeShort = (timeStr?: string | null) => {
    if (!timeStr) return '';
    // Normalize "08:00:00" or "8:00:00" -> "08:00"
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    return timeStr;
};

export const HabitScheduleManager = ({ habitId, habitName }: HabitScheduleManagerProps) => {
    const [schedules, setSchedules] = useState<HabitSchedule[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [busyScheduleId, setBusyScheduleId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(['Monday']);
    const [startTime, setStartTime] = useState<string>('08:00');
    const [timingMode, setTimingMode] = useState<'duration' | 'end_time'>('duration');
    const [durationMinutes, setDurationMinutes] = useState<number>(30);
    const [endTime, setEndTime] = useState<string>('08:30');

    const loadSchedules = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getHabitSchedules(habitId);
            const sorted = [...data].sort(
                (a, b) =>
                    DAYS_OF_WEEK.indexOf(a.day_of_week) - DAYS_OF_WEEK.indexOf(b.day_of_week) ||
                    a.start_time.localeCompare(b.start_time)
            );
            setSchedules(sorted);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [habitId]);

    useEffect(() => {
        loadSchedules();
    }, [loadSchedules]);

    const toggleDaySelection = (day: DayOfWeek) => {
        setSelectedDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
        );
    };

    const handleAddSchedules = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedDays.length === 0) {
            setError('Select at least one day of the week.');
            return;
        }
        if (!startTime) {
            setError('Start time is required.');
            return;
        }
        if (timingMode === 'duration' && (!durationMinutes || durationMinutes < 1 || durationMinutes > 1439)) {
            setError('Duration must be between 1 and 1439 minutes.');
            return;
        }
        if (timingMode === 'end_time' && !endTime) {
            setError('End time is required when using End Time mode.');
            return;
        }

        try {
            setSubmitting(true);
            setError(null);

            for (const day of selectedDays) {
                await createHabitSchedule({
                    habit_id: habitId,
                    day_of_week: day,
                    start_time: `${startTime}:00`,
                    end_time: timingMode === 'end_time' ? `${endTime}:00` : null,
                    duration_minutes: timingMode === 'duration' ? Number(durationMinutes) : null,
                    status: 'Active',
                });
            }

            await loadSchedules();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async (schedule: HabitSchedule) => {
        const nextStatus = schedule.status === 'Active' ? 'Inactive' : 'Active';
        try {
            setBusyScheduleId(schedule.schedule_id);
            setError(null);
            await updateHabitScheduleStatus(schedule.schedule_id, nextStatus);
            await loadSchedules();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusyScheduleId(null);
        }
    };

    const handleDelete = async (scheduleId: number) => {
        try {
            setBusyScheduleId(scheduleId);
            setError(null);
            await deleteHabitSchedule(scheduleId);
            await loadSchedules();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusyScheduleId(null);
        }
    };

    return (
        <div className="mt-3 pt-3 border-t border-gray-200/80 dark:border-gray-600/80 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Weekly Schedule — {habitName}
                </h4>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {schedules.filter((s) => s.status === 'Active').length} active slot(s)
                </span>
            </div>

            {error && (
                <div className="p-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                    {error}
                </div>
            )}

            {/* Existing Schedule Slots */}
            {loading ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Loading schedule slots...</p>
            ) : schedules.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-gray-800/60 p-2.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-600">
                    No recurring days configured yet. Add days below so daily occurrences generate automatically.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {schedules.map((sch) => {
                        const isBusy = busyScheduleId === sch.schedule_id;
                        const isActive = sch.status === 'Active';
                        return (
                            <li
                                key={sch.schedule_id}
                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-600/70 text-xs"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-800 dark:text-gray-100 w-20">
                                        {sch.day_of_week}
                                    </span>
                                    <span className="text-gray-600 dark:text-gray-300">
                                        {formatTimeShort(sch.start_time)}
                                        {sch.end_time
                                            ? ` – ${formatTimeShort(sch.end_time)}`
                                            : sch.duration_minutes
                                                ? ` (${sch.duration_minutes} min)`
                                                : ''}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleToggleStatus(sch)}
                                        className={`px-2 py-0.5 rounded-md font-medium transition-colors ${isActive
                                                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600'
                                            }`}
                                    >
                                        {sch.status}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleDelete(sch.schedule_id)}
                                        className="px-2 py-0.5 rounded-md font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                        title="Remove slot"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Add Recurring Schedule Form */}
            <form
                onSubmit={handleAddSchedules}
                className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 space-y-3"
            >
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Select Days
                        </span>
                        <div className="flex gap-2 text-[11px]">
                            <button
                                type="button"
                                onClick={() =>
                                    setSelectedDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
                                }
                                className="text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                Weekdays
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedDays([...DAYS_OF_WEEK])}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                Every Day
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {DAYS_OF_WEEK.map((day) => {
                            const active = selectedDays.includes(day);
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleDaySelection(day)}
                                    className={`py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${active
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    {SHORT_DAY_LABELS[day]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                    <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Start Time
                        </label>
                        <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Timing Type
                        </label>
                        <select
                            value={timingMode}
                            onChange={(e) => setTimingMode(e.target.value as 'duration' | 'end_time')}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="duration">Duration (mins)</option>
                            <option value="end_time">End Time</option>
                        </select>
                    </div>

                    {timingMode === 'duration' ? (
                        <div>
                            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Minutes
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={1439}
                                value={durationMinutes}
                                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                                className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                                End Time
                            </label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={submitting || selectedDays.length === 0}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                    >
                        {submitting
                            ? 'Adding...'
                            : `Add to ${selectedDays.length} ${selectedDays.length === 1 ? 'Day' : 'Days'}`}
                    </button>
                </div>
            </form>
        </div>
    );
};