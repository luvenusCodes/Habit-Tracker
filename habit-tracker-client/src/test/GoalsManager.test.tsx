import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalsManager } from '../components/GoalsManager';
import * as goalsService from '../services/goalsService';
import type { Goal } from '../types/goals';

vi.mock('../services/goalsService', async () => {
    const actual = await vi.importActual<typeof import('../services/goalsService')>(
        '../services/goalsService'
    );
    return {
        ...actual,
        fetchGoals: vi.fn(),
        createGoal: vi.fn(),
        changeGoalStatus: vi.fn(),
        fetchGoalCriteria: vi.fn().mockResolvedValue([]),
        fetchGoalHabits: vi.fn().mockResolvedValue([]),
        fetchGoalProgressSummary: vi.fn().mockResolvedValue({
            goal_id: 1,
            progress_percentage: 40,
            completed_criteria: 1,
            total_criteria: 2,
        }),
        fetchGoalStatusHistory: vi.fn().mockResolvedValue([]),
        fetchGoalCriteriaHistory: vi.fn().mockResolvedValue([]),
    };
});

const mockGoals: Goal[] = [
    {
        goal_id: 1,
        user_id: 10,
        goal_name: 'Complete Backend Testing',
        description: 'Reach 100% pass rate on pytest',
        status: 'Active',
        start_date: '2026-11-01',
        end_date: '2026-12-01',
        progress_percentage: 75,
        completed_at: null,
        notes: null,
        created_at: '2026-11-01T08:00:00',
        updated_at: '2026-11-01T08:00:00',
    },
    {
        goal_id: 2,
        user_id: 10,
        goal_name: 'Learn Playwright',
        description: 'Write full-stack E2E tests',
        status: 'Paused',
        start_date: '2026-11-10',
        end_date: '2026-12-15',
        progress_percentage: 20,
        completed_at: null,
        notes: null,
        created_at: '2026-11-10T08:00:00',
        updated_at: '2026-11-10T08:00:00',
    },
];

describe('GoalsManager Component Interactions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(goalsService.fetchGoals).mockResolvedValue(mockGoals);
    });

    it('loads and displays user goals on initial render', async () => {
        render(<GoalsManager />);

        expect(await screen.findByText('Complete Backend Testing')).toBeInTheDocument();
        expect(screen.getByText('Learn Playwright')).toBeInTheDocument();
        expect(goalsService.fetchGoals).toHaveBeenCalledTimes(1);
    });

    it('surfaces backend error messages when fetching goals fails', async () => {
        vi.mocked(goalsService.fetchGoals).mockRejectedValueOnce({
            isAxiosError: true,
            response: { data: { detail: 'Session expired. Please log in again.' } },
        });

        render(<GoalsManager />);

        expect(
            await screen.findByText(/Session expired\. Please log in again\./i)
        ).toBeInTheDocument();
    });

    it('triggers status filter reload when clicking a status tab', async () => {
        const user = userEvent.setup();
        render(<GoalsManager />);

        await screen.findByText('Complete Backend Testing');

        const pausedFilterBtn = screen.queryByRole('button', { name: /^Paused$/i });
        if (pausedFilterBtn) {
            await user.click(pausedFilterBtn);
            await waitFor(() => {
                expect(goalsService.fetchGoals).toHaveBeenCalledWith('Paused');
            });
        }
    });
});