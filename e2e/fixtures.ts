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
  await expect(page.getByRole('heading', { name: instructorName })).toBeVisible({ timeout: 20_000 });
  await page
    .locator('.ui-list-row')
    .filter({ has: page.getByRole('heading', { name: instructorName }) })
    .getByRole('button', { name: 'Book Lesson' })
    .click();
  await expect(page.getByRole('heading', { name: instructorName, exact: true }).first()).toBeVisible();
}

export async function fillBookingSelectors(page: Page, dayOffset = 1): Promise<void> {
  const dateInput = page.locator('input[type="date"]').first();
  await expect(dateInput).toBeVisible();
  const minDate = await dateInput.getAttribute('min');
  if (minDate) {
    const [year, month, day] = minDate.split('-').map(Number);
    const bookingDate = new Date(year, month - 1, day + dayOffset);
    const bookingDateStr = [
      bookingDate.getFullYear(),
      String(bookingDate.getMonth() + 1).padStart(2, '0'),
      String(bookingDate.getDate()).padStart(2, '0'),
    ].join('-');
    await dateInput.fill(bookingDateStr);
  }

  const timeSelect = page.locator('select').first();
  await expect(timeSelect).toBeEnabled({ timeout: 20_000 });
  const firstSlot = timeSelect.locator('option').nth(1);
  const slotValue = await firstSlot.getAttribute('value');
  if (slotValue) {
    await timeSelect.selectOption(slotValue);
  }
}

export { expect };
