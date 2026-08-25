import { test } from '@playwright/test';
import {
  expect,
  fillBookingSelectors,
  loadRuntimeConfig,
  openGuestBookingModal,
  signInStudent,
} from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';

test.describe('booking flow', () => {
  test.beforeAll(async () => {
    await waitForFunctionsEmulatorReady();
  });

  test('guest can submit a lesson request from the home page', async ({ page }) => {
    const runtimeConfig = loadRuntimeConfig();
    await openGuestBookingModal(page, runtimeConfig.instructorName);

    await page.getByPlaceholder('e.g. Alex Carter').fill('Guest Skier');
    await page.getByPlaceholder('+1 (555) 000-0000').fill('+1 555 0100');
    await fillBookingSelectors(page);

    await waitForFunctionsEmulatorReady();
    await page.getByRole('button', { name: 'Submit Application to Admin' }).click();

    await expect(page.getByText('Application Submitted!')).toBeVisible();
  });

  test('signed-in student can book a lesson from the cabinet', async ({ page }) => {
    const runtimeConfig = loadRuntimeConfig();
    await signInStudent(page, runtimeConfig);

    await page.getByRole('button', { name: 'Book Lesson' }).click();
    await expect(page.getByRole('dialog', { name: 'Choose a coach' })).toBeVisible();
    await page
      .getByRole('button')
      .filter({ hasText: runtimeConfig.instructorName })
      .first()
      .click();

    await fillBookingSelectors(page, 2);
    await waitForFunctionsEmulatorReady();
    await page.getByRole('button', { name: /Confirm — deduct .+ from balance/ }).click();

    await expect(page.getByText('Lesson Booked!')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Coaching with E2E Test Coach/)).toBeVisible();
  });
});
