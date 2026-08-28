import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { E2ERuntimeConfig } from './global-setup';
import { DEFAULT_LESSON_DURATION_MINUTES } from './emulator-config';

const runtimeConfigPath = join(dirname(fileURLToPath(import.meta.url)), '.runtime-config.json');

export interface BookingSlotSelection {
  localDate: string;
  localTime: string;
  timezone: string;
  durationMinutes: number;
}

const REPEAT_TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'] as const;

function simpleHash(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export interface E2ETestIsolation {
  repeatEachIndex: number;
  title: string;
}

export function uniqueDayOffset(_baseOffset: number, testInfo: E2ETestIsolation): number {
  const slot = (simpleHash(testInfo.title) + testInfo.repeatEachIndex * 17) % 28;
  return 2 + slot;
}

export function uniqueTimeSlot(testInfo: E2ETestIsolation): string {
  const index =
    (simpleHash(testInfo.title) + testInfo.repeatEachIndex) % REPEAT_TIME_SLOTS.length;
  return REPEAT_TIME_SLOTS[index]!;
}

export function loadRuntimeConfig(): E2ERuntimeConfig {
  return JSON.parse(readFileSync(runtimeConfigPath, 'utf8')) as E2ERuntimeConfig;
}

export async function signInStudent(
  page: Page,
  config: Pick<E2ERuntimeConfig, 'studentEmail' | 'studentPassword'> = loadRuntimeConfig()
): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  const authModal = page.locator('.ui-modal');
  await authModal.getByPlaceholder('Email Address').fill(config.studentEmail);
  await authModal.getByPlaceholder('Password').fill(config.studentPassword);
  await authModal.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/cabinet/);
}

export async function signInStudentB(page: Page, config = loadRuntimeConfig()): Promise<void> {
  await signInStudent(page, {
    studentEmail: config.studentBEmail,
    studentPassword: config.studentBPassword,
  });
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

export async function openStudentBookingModal(
  page: Page,
  config = loadRuntimeConfig()
): Promise<void> {
  await signInStudent(page, config);
  await page.getByRole('button', { name: 'Book Lesson' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a coach' })).toBeVisible();
  await page
    .getByRole('button')
    .filter({ hasText: config.instructorName })
    .first()
    .click();
}

function getBookingModal(page: Page) {
  return page.locator('.ui-modal').filter({
    has: page.getByRole('button', { name: 'Date', exact: true }),
  });
}

function buildTargetDate(dayOffset: number): Date {
  const bookingDate = new Date();
  bookingDate.setHours(0, 0, 0, 0);
  bookingDate.setDate(bookingDate.getDate() + dayOffset);
  return bookingDate;
}

function formatLocalDate(dayOffset: number): string {
  const bookingDate = buildTargetDate(dayOffset);
  const year = bookingDate.getFullYear();
  const month = String(bookingDate.getMonth() + 1).padStart(2, '0');
  const day = String(bookingDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthLabel(date: Date, locale = 'en-US'): string {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  const label = formatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function normalizeTimeLabel(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return time.trim();
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

async function ensureParticipantSelected(
  bookingModal: ReturnType<typeof getBookingModal>,
  participantDisplayName: string
): Promise<void> {
  const button = bookingModal.getByRole('button', { name: participantDisplayName });
  const className = (await button.getAttribute('class')) ?? '';
  if (!className.includes('border-[var(--accent)]')) {
    await button.click();
  }
}

function formatShortMonth(date: Date, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
}

function displayMatchesTargetDate(display: string, targetDate: Date): boolean {
  const day = targetDate.getDate();
  const monthLabel = getMonthLabel(targetDate);
  const shortMonth = formatShortMonth(targetDate);
  const hasDay = new RegExp(`\\b${day}\\b`).test(display);
  const hasMonth =
    display.includes(shortMonth) ||
    display.toLowerCase().includes(monthLabel.slice(0, 3).toLowerCase());
  return hasDay && hasMonth;
}

export async function selectBookingDateInModal(page: Page, dayOffset: number): Promise<void> {
  const bookingModal = getBookingModal(page);
  const targetDate = buildTargetDate(dayOffset);
  const monthLabel = getMonthLabel(targetDate);
  const dayLabel = String(targetDate.getDate());

  const dateButton = bookingModal.getByRole('button', { name: 'Date', exact: true });
  const currentDisplay = ((await dateButton.locator('span').first().textContent()) ?? '').trim();

  if (displayMatchesTargetDate(currentDisplay, targetDate)) {
    return;
  }

  await dateButton.click();
  await expect(dateButton).toHaveAttribute('aria-expanded', 'true');

  const currentHasTargetMonth =
    currentDisplay.includes(formatShortMonth(targetDate)) ||
    currentDisplay.toLowerCase().includes(monthLabel.slice(0, 3).toLowerCase());

  if (!currentHasTargetMonth) {
    const monthButton = bookingModal.getByRole('button', { name: monthLabel, exact: true });
    await monthButton.scrollIntoViewIfNeeded();
    await monthButton.click();
  }

  const dayButton = bookingModal.getByRole('button', { name: dayLabel, exact: true });
  await dayButton.scrollIntoViewIfNeeded();
  await expect(dayButton).toBeVisible({ timeout: 10_000 });
  await dayButton.click();

  if ((await dateButton.getAttribute('aria-expanded')) === 'true') {
    await page.keyboard.press('Escape');
  }
}

export async function fillBookingSelectors(
  page: Page,
  dayOffset = 1,
  options?: {
    participantDisplayName?: string;
    time?: string;
  }
): Promise<BookingSlotSelection> {
  const bookingModal = getBookingModal(page);
  const localDate = formatLocalDate(dayOffset);

  if (options?.participantDisplayName) {
    await ensureParticipantSelected(bookingModal, options.participantDisplayName);
  }

  const dateButton = bookingModal.getByRole('button', { name: 'Date', exact: true });
  await expect(dateButton).toBeVisible();
  await selectBookingDateInModal(page, dayOffset);

  const timeButton = bookingModal.getByRole('button', { name: 'Time Slot', exact: true });
  await expect(timeButton).toBeEnabled({ timeout: 20_000 });
  await expect
    .poll(async () => /\d{1,2}:\d{2}/.test((await timeButton.textContent()) ?? ''), {
      timeout: 20_000,
    })
    .toBe(true);

  await timeButton.click();
  if (options?.time) {
    await bookingModal.getByRole('button', { name: options.time, exact: true }).click();
  } else {
    await bookingModal.getByRole('button', { name: /^\d{1,2}:\d{2}$/ }).first().click();
  }

  const localTime = normalizeTimeLabel(
    options?.time ??
      ((await timeButton.textContent())?.match(/\d{1,2}:\d{2}/)?.[0] ?? '').trim()
  );
  const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  return {
    localDate,
    localTime,
    timezone,
    durationMinutes: DEFAULT_LESSON_DURATION_MINUTES,
  };
}

export async function submitGuestBookingApplication(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Submit Application to Admin' }).click();
}

export async function submitStudentBookingConfirmation(page: Page): Promise<void> {
  const bookingModal = getBookingModal(page);
  await page.getByRole('button', { name: /Confirm — deduct .+ from balance/ }).click();
  await expect
    .poll(async () => {
      const modalOpen = await bookingModal.isVisible().catch(() => false);
      const hasSuccess = (await page.getByText('Lesson Booked!').count()) > 0;
      const hasError = (await page.getByText('Booking Error').count()) > 0;
      return !modalOpen || hasSuccess || hasError;
    })
    .toBe(true);
  await expect(page.getByText('Booking Error')).toHaveCount(0);
}

export async function openMyLessons(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'My Lessons' }).click();
}

export async function cancelLessonBookingFromCabinet(page: Page): Promise<void> {
  await openMyLessons(page);
  const cancelButton = page.getByRole('button', { name: 'Cancel Booking & Refund' }).first();
  await expect(cancelButton).toBeVisible({ timeout: 30_000 });
  await cancelButton.click();
  const confirmModal = page.locator('.ui-modal-overlay').filter({ hasText: 'Confirm Action' });
  await confirmModal
    .getByPlaceholder('Please explain why you need to cancel this lesson...')
    .fill('E2E cancellation');
  await confirmModal.getByRole('button', { name: 'Confirm', exact: true }).click();
}

export async function waitForNewBlockingBookingForPayer(
  payerAccountId: string,
  beforeBookingIds: ReadonlySet<string>,
  predicate: (booking: {
    bookingId: string;
    lifecycleStatus: string;
    participantIds: readonly string[];
  }) => boolean = () => true
): Promise<{ bookingId: string; lifecycleStatus: string; participantIds: readonly string[] }> {
  const { listBlockingBookingsForPayer } = await import('./firestore-admin');
  let found:
    | { bookingId: string; lifecycleStatus: string; participantIds: readonly string[] }
    | null = null;

  await expect
    .poll(async () => {
      const bookings = await listBlockingBookingsForPayer(payerAccountId);
      found =
        bookings.find(
          (booking) => !beforeBookingIds.has(booking.bookingId) && predicate(booking)
        ) ?? null;
      return found?.bookingId ?? null;
    })
    .not.toBeNull();

  return found!;
}

export { expect };
