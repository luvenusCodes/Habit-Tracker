import { test, expect } from '@playwright/test';

test.describe('Full-Stack Habit & Goal Journey', () => {
    const uniqueId = Date.now();
    const username = `pw_user_${uniqueId}`;
    const email = `pw_user_${uniqueId}@example.com`;
    const password = 'StrongPassword123!';

    test('register, log in, and navigate to goals', async ({ page }) => {
        await page.goto('/');

        // 1. Switch from Login ("Welcome Back") to Register ("Create Account")
        await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();
        await page.getByRole('button', { name: /^Sign up$/i }).click();
        await expect(page.getByRole('heading', { name: /Create Account/i })).toBeVisible();

        // 2. Complete registration form
        await page.getByPlaceholder('Choose a username').fill(username);
        await page.getByPlaceholder('name@example.com').fill(email);
        await page.getByPlaceholder('••••••••').fill(password);
        await page.getByRole('button', { name: /^Sign Up$/i }).click();

        // 3. Verify registration success banner and automatic redirect to Login (1.5s timer)
        await expect(page.getByText(/Account registered successfully/i)).toBeVisible();
        await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible({
            timeout: 5_000,
        });

        // 4. Log in with the newly registered account
        await page.getByPlaceholder('Enter your username').fill(username);
        await page.getByPlaceholder('••••••••').fill(password);
        await page.getByRole('button', { name: /^Log In$/i }).click();

        // 5. Verify authenticated dashboard loads (exact username badge in header)
        await expect(page.getByText(username, { exact: true })).toBeVisible({
            timeout: 10_000,
        });

        // 6. Navigate to Goals tab/view and verify rendering
        const goalsNav = page
            .getByRole('button', { name: /goals/i })
            .or(page.getByRole('link', { name: /goals/i }));
        await expect(goalsNav.first()).toBeVisible();
        await goalsNav.first().click();
        await expect(page.getByRole('heading', { name: /goals/i }).first()).toBeVisible();
    });
});