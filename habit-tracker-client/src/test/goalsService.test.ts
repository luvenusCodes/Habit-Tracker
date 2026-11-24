import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
    fetchGoals,
    createGoal,
    changeGoalStatus,
    deactivateGoalCriterion,
    extractApiError,
} from '../services/goalsService';

vi.mock('axios', async () => {
    const actual = await vi.importActual<typeof import('axios')>('axios');
    return {
        default: {
            ...actual.default,
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
            isAxiosError: actual.default.isAxiosError,
        },
    };
});

const mockedAxios = vi.mocked(axios, true);

describe('goalsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('access_token', 'mock-jwt-token');
    });

    it('fetches user goals with Authorization header and optional status filter', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                goals: [
                    {
                        goal_id: 1,
                        goal_name: 'Master FastAPI & React',
                        status: 'Active',
                        progress_percentage: 50,
                    },
                ],
            },
        });

        const goals = await fetchGoals('Active');

        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        const [url, config] = mockedAxios.get.mock.calls[0];
        expect(url).toContain('/goals/?status=Active');
        expect(config?.headers?.Authorization).toBe('Bearer mock-jwt-token');
        expect(goals).toHaveLength(1);
        expect(goals[0].goal_name).toBe('Master FastAPI & React');
    });

    it('creates a goal and unwraps response.data.goal', async () => {
        const payload = {
            goal_name: 'Ship Production App',
            start_date: '2026-11-24',
            end_date: '2026-12-31',
        };

        mockedAxios.post.mockResolvedValueOnce({
            data: {
                goal: {
                    goal_id: 10,
                    ...payload,
                    status: 'Active',
                    progress_percentage: 0,
                },
            },
        });

        const created = await createGoal(payload);

        expect(mockedAxios.post).toHaveBeenCalledWith(
            expect.stringContaining('/goals/'),
            payload,
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock-jwt-token',
                }),
            })
        );
        expect(created.goal_id).toBe(10);
        expect(created.status).toBe('Active');
    });

    it('sends status transition payload with reason (or null)', async () => {
        mockedAxios.patch.mockResolvedValueOnce({
            data: {
                goal: {
                    goal_id: 5,
                    goal_name: 'Recovered Goal',
                    status: 'Paused',
                },
            },
        });

        const updated = await changeGoalStatus(5, 'Paused', 'Restoring archived goal');

        expect(mockedAxios.patch).toHaveBeenCalledWith(
            expect.stringContaining('/goals/5/status'),
            { status: 'Paused', reason: 'Restoring archived goal' },
            expect.any(Object)
        );
        expect(updated.status).toBe('Paused');
    });

    it('sends DELETE request with deactivation reason in request body', async () => {
        mockedAxios.delete.mockResolvedValueOnce({
            data: {
                criterion: {
                    criterion_id: 9,
                    status: 'Inactive',
                },
            },
        });

        const result = await deactivateGoalCriterion(5, 9, 'No longer needed');

        expect(mockedAxios.delete).toHaveBeenCalledWith(
            expect.stringContaining('/goals/5/criteria/9'),
            expect.objectContaining({
                data: { reason: 'No longer needed' },
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock-jwt-token',
                }),
            })
        );
        expect(result.status).toBe('Inactive');
    });

    it('extracts string and validation array errors via extractApiError', () => {
        const stringDetailErr = {
            isAxiosError: true,
            response: { data: { detail: 'Cannot activate an expired goal.' } },
        };
        expect(extractApiError(stringDetailErr)).toBe('Cannot activate an expired goal.');

        const validationArrayErr = {
            isAxiosError: true,
            response: {
                data: {
                    detail: [{ msg: 'Field required' }, { msg: 'Invalid date format' }],
                },
            },
        };
        expect(extractApiError(validationArrayErr)).toBe('Field required, Invalid date format');
        expect(extractApiError(new Error('Network down'), 'Fallback message')).toBe('Fallback message');
    });
});