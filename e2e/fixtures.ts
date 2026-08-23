import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { E2ERuntimeConfig } from './global-setup';

const runtimeConfigPath = join(dirname(fileURLToPath(import.meta.url)), '.runtime-config.json');

export function loadRuntimeConfig(): E2ERuntimeConfig {
  return JSON.parse(readFileSync(runtimeConfigPath, 'utf8')) as E2ERuntimeConfig;
}

export async function signInStudent(page: Page, config = loadRuntimeConfig()): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  const authModal = page.locator('.ui-modal');
  await authModal.getByPlaceholder('Email Address').fill(config.studentEmail);
  await authModal.getByPlaceholder('Password').fill(config.studentPassword);
  await authModal.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/cabinet/);
}

export async function openGuestBookingModal(page: Page, instructorName: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: instructorName })).toBeVisible({
    timeout: 20_000,
  });
  await page
    .locator('.ui-list-row')
    .filter({ has: page.getByRole('heading', { name: instructorName }) })
    .getByRole('button', { name: 'Book Lesson' })
    .click();
  await expect(
    page.getByRole('heading', { name: instructorName, exact: true }).first()
  ).toBeVisible();
}

function getBookingModal(page: Page) {
  return page.locator('.ui-modal').filter({
    has: page.getByRole('button', { name: 'Date', exact: true }),
  });
}

export async function fillBookingSelectors(page: Page, dayOffset = 1): Promise<void> {
  const bookingModal = getBookingModal(page);

  const bookingDate = new Date();
  bookingDate.setHours(0, 0, 0, 0);
  bookingDate.setDate(bookingDate.getDate() + dayOffset);

  const dateButton = bookingModal.getByRole('button', { name: 'Date', exact: true });
  await expect(dateButton).toBeVisible();
  await dateButton.click();
  await bookingModal
    .getByRole('button', { name: String(bookingDate.getDate()), exact: true })
    .click();
  if ((await dateButton.getAttribute('aria-expanded')) === 'true') {
    await page.keyboard.press('Escape');
  }

  const timeButton = bookingModal.getByRole('button', { name: 'Time Slot', exact: true });
  await expect(timeButton).toBeEnabled({ timeout: 20_000 });
  await expect
    .poll(async () => /\d{1,2}:\d{2}/.test((await timeButton.textContent()) ?? ''), {
      timeout: 20_000,
    })
    .toBe(true);

  await timeButton.click();
  await bookingModal.getByRole('button', { name: /^\d{1,2}:\d{2}$/ }).first().click();
}

export { expect };
