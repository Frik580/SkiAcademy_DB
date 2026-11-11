import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  attemptAuthenticatedBooking,
  attemptAuthenticatedCancellation,
  attemptAuthenticatedReschedule,
} from './callable-client';
import { loadRuntimeConfig, signInStudent } from './fixtures';
import { getBookingRecord } from './firestore-admin';
import { waitForFunctionsEmulatorReady } from './global-setup';
import { E2E_PROJECT_ID } from './emulator-config';

test('reschedule timezone preserves Almaty 09:00 in America/New_York', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  expect(E2E_PROJECT_ID).toBe('demo-ski-school-e2e');
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  await waitForFunctionsEmulatorReady();
  const config = loadRuntimeConfig();
  const fixedNow = new Date();
  const original = new Date(fixedNow);
  original.setUTCDate(original.getUTCDate() + 30 + info.repeatEachIndex * 3);
  const target = new Date(original);
  target.setUTCDate(target.getUTCDate() + 1);
  const originalDate = original.toISOString().slice(0, 10);
  const targetDate = target.toISOString().slice(0, 10);
  const bookingId = `booking_e2e_timezone_${randomUUID().replaceAll('-', '')}`;
  const context = await browser.newContext({
    timezoneId: 'America/New_York',
    locale: 'en-US',
    baseURL: info.project.use.baseURL,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(fixedNow);
  const created = await attemptAuthenticatedBooking({
    accountId: config.studentUid,
    email: config.studentEmail,
    password: config.studentPassword,
    instructorId: config.instructorId,
    participantIds: [config.studentParticipantId],
    exercisedCapability: 'account_owner',
    bookingId,
    localDate: originalDate,
    localTime: '10:00',
    timezone: 'Asia/Almaty',
    durationMinutes: 60,
  });
  expect(created).toMatchObject({ ok: true });
  try {
    const before = await getBookingRecord(bookingId);
    expect(before!.occurrence.timeZone).toBe('Asia/Almaty');
    const rejected = await attemptAuthenticatedReschedule({
      email: config.studentEmail,
      password: config.studentPassword,
      bookingId,
      expectedRevision: before!.revision,
      localDate: targetDate,
      localTime: '09:00',
      timezone: 'America/New_York',
      durationMinutes: 60,
    });
    expect(rejected).toMatchObject({ ok: false, errorCode: 'validation' });
    expect(await getBookingRecord(bookingId)).toEqual(before);
    await signInStudent(page, config);
    await page.goto('/cabinet/calendar', { waitUntil: 'domcontentloaded' });
    const card = page.locator(`#booking-card-${bookingId}`);
    await card.getByRole('button', { name: /Reschedule/i }).click();
    const modal = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'Reschedule lesson', exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Confirm reschedule', exact: true }) })
      .last();
    const dateButton = modal.getByRole('button', { name: 'Select Date', exact: true });
    await dateButton.click();
    const month = target.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    if (original.getUTCFullYear() !== target.getUTCFullYear()) {
      await modal
        .getByRole('button', { name: String(target.getUTCFullYear()), exact: true })
        .click();
    }
    if (original.getUTCMonth() !== target.getUTCMonth()) {
      await modal.getByRole('button', { name: month, exact: true }).click();
    }
    await modal.getByRole('button', { name: String(target.getUTCDate()), exact: true }).click();
    if ((await dateButton.getAttribute('aria-expanded')) === 'true')
      await page.keyboard.press('Escape');
    await modal.getByRole('button', { name: 'Time', exact: true }).click();
    await modal.getByRole('button', { name: '09:00', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(modal.getByRole('button', { name: 'Time', exact: true })).toHaveAttribute('aria-expanded', 'false');
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('executeCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'reschedule_booking'
    );
    await modal.getByRole('button', { name: 'Confirm reschedule', exact: true }).click();
    const response = await responsePromise;
    expect((await response.json()).result.status).toBe('success');
    const expectedSeconds = Date.parse(`${targetDate}T04:00:00Z`) / 1000;
    await expect
      .poll(async () => (await getBookingRecord(bookingId))?.occurrence.interval.startsAt.seconds)
      .toBe(expectedSeconds);
    const saved = await getBookingRecord(bookingId);
    expect(saved!.occurrence.timeZone).toBe('Asia/Almaty');
    expect(saved!.occurrence.interval.endsAt.seconds).toBe(expectedSeconds + 3600);
    await page.reload();
    await expect(page.locator(`#booking-card-${bookingId}`)).toContainText('09:00');
    await expect(page.locator(`#booking-card-${bookingId}`)).toBeVisible();
  } finally {
    await context.close();
    const booking = await getBookingRecord(bookingId);
    if (booking)
      expect(
        await attemptAuthenticatedCancellation({
          email: config.studentEmail,
          password: config.studentPassword,
          bookingId,
          expectedRevision: booking.revision,
          exercisedCapability: 'account_owner',
        })
      ).toMatchObject({ ok: true });
  }
});
