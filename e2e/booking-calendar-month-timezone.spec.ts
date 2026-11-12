import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { loadRuntimeConfig, signInStudent } from './fixtures';
import { ensureFirestore } from './firestore-admin';
import { AUTH_EMULATOR_HOST, E2E_PROJECT_ID, functionsCallableUrl } from './emulator-config';

const requireRoot = createRequire(new URL('../package.json', import.meta.url));
const { BookingSchema, timestampFromDate, paymentIdFromBookingId } = requireRoot(
  '@ski-academy/shared-domain'
);

import type { Booking } from '@ski-academy/shared-domain';
test.describe.serial('school timezone calendar', () => {
  const prefix = `booking_cal_${randomUUID().replaceAll('-', '')}`;
  let config: ReturnType<typeof loadRuntimeConfig>;
  let db: ReturnType<typeof ensureFirestore>;
  let fixtures: Booking[] = [];
  let originalZone: string;
  test.beforeAll(async () => {
    expect(E2E_PROJECT_ID).toBe('demo-ski-school-e2e');
    expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
    config = loadRuntimeConfig();
    db = ensureFirestore();
    originalZone = (await db.doc('resort_data/config').get()).data()?.timeZone ?? 'Asia/Almaty';
    const metadata = {
      revision: 1,
      createdAt: timestampFromDate(new Date('2026-01-01T00:00:00Z')),
      updatedAt: timestampFromDate(new Date('2026-10-02T00:00:00Z')),
      audit: {
        createdByCommandId: 'command_calendar_fixture',
        lastChangedByCommandId: 'command_calendar_fixture',
        correlationId: 'correlation_calendar_fixture',
      },
    };
    // Historical completed fixtures ensure account_hot cannot mask a missing month read.
    fixtures = [
      ['before', '2026-08-31T17:00:00Z', '2026-08-31T18:00:00Z', 'Asia/Almaty'],
      ['touch', '2026-08-31T18:00:00Z', '2026-08-31T19:00:00Z', 'Asia/Almaty'],
      ['overlap', '2026-08-31T18:30:00Z', '2026-08-31T19:30:00Z', 'Asia/Almaty'],
      ['first', '2026-08-31T19:00:00Z', '2026-08-31T20:00:00Z', 'Asia/Almaty'],
      ['last', '2026-09-30T18:00:00Z', '2026-09-30T19:00:00Z', 'Asia/Almaty'],
      ['next', '2026-09-30T19:00:00Z', '2026-09-30T20:00:00Z', 'Asia/Almaty'],
      ['old_zone', '2026-08-31T10:00:00Z', '2026-08-31T11:00:00Z', 'Pacific/Kiritimati'],
    ].map(([suffix, start, end, timeZone]) =>
      BookingSchema.parse({
        bookingId: `${prefix}_${suffix}`,
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId: config.studentUid },
        },
        party: { kind: 'individual', participantIds: [config.studentParticipantId] },
        occurrence: {
          occurrenceId: `occurrence_${prefix}_${suffix}`,
          instructorId: config.instructorId,
          interval: {
            startsAt: timestampFromDate(new Date(start)),
            endsAt: timestampFromDate(new Date(end)),
          },
          timeZone,
          scheduleRevision: 1,
          serviceParty: { participantIds: [config.studentParticipantId] },
        },
        lifecycle: { status: 'completed', completedAt: timestampFromDate(new Date(end)) },
        paymentId: paymentIdFromBookingId(`${prefix}_${suffix}`),
        payerAccountId: config.studentUid,
        ...metadata,
      })
    );
    await db.doc('resort_data/config').set({ timeZone: 'Asia/Almaty' }, { merge: true });
    const batch = db.batch();
    for (const fixture of fixtures) batch.set(db.doc(`bookings/${fixture.bookingId}`), fixture);
    await batch.commit();
  });
  test.afterAll(async () => {
    if (!db) return;
    await db.doc('resort_data/config').set({ timeZone: originalZone }, { merge: true });
    const batch = db.batch();
    for (const fixture of fixtures) batch.delete(db.doc(`bookings/${fixture.bookingId}`));
    await batch.commit();
  });
  test('real calendar callable preserves school-month intersections', async () => {
    const auth = await fetch(
      `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.studentEmail,
          password: config.studentPassword,
          returnSecureToken: true,
        }),
      }
    );
    const { idToken } = await auth.json();
    expect(idToken).toBeTruthy();
    // Real callable + Firestore integration: retain the existing inclusive endsAt contract.
    const response = await fetch(functionsCallableUrl('queryLessonBookingReadModels'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        data: {
          scope: 'account_calendar_month',
          rangeStart: timestampFromDate(new Date('2026-08-31T19:00:00Z')),
          rangeEnd: timestampFromDate(new Date('2026-09-30T19:00:00Z')),
        },
      }),
    });
    const payload = await response.json();
    expect(response.ok, JSON.stringify(payload)).toBe(true);
    const ids = payload.result.items.map((item: { bookingId: string }) => item.bookingId);
    for (const suffix of ['touch', 'overlap', 'first', 'last'])
      expect(ids).toContain(`${prefix}_${suffix}`);
    for (const suffix of ['before', 'next', 'old_zone'])
      expect(ids).not.toContain(`${prefix}_${suffix}`);
  });
  test('New York browser retains lessons through navigation, timezone changes and reload', async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      timezoneId: 'America/New_York',
      locale: 'en-US',
      baseURL: info.project.use.baseURL,
    });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
      const monthReads: unknown[] = [];
      page.on('request', (request) => {
        if (request.url().includes('queryLessonBookingReadModels')) {
          const data = request.postDataJSON()?.data;
          if (data?.scope === 'account_calendar_month') monthReads.push(data);
        }
      });
      await signInStudent(page, config);
      await page.goto('/cabinet/calendar', { waitUntil: 'domcontentloaded' });
      const calendar = page
        .locator('div.rounded-lg')
        .filter({ has: page.getByText('Interactive Calendar', { exact: true }) })
        .last();
      const nav = calendar.locator('button').filter({ has: page.locator('svg') });
      const day = (number: string) => calendar.getByRole('button', { name: number, exact: true });
      await expect(calendar).toContainText('September 2026');
      await expect(day('1').locator('span').nth(1)).toBeVisible();
      await day('1').click();
      await expect(page.locator(`#booking-card-${prefix}_first`)).toBeVisible();
      await expect(page.locator(`#booking-card-${prefix}_old_zone`)).toBeVisible();
      await nav.nth(0).click();
      await expect(calendar).toContainText('August 2026');
      await expect(day('31').locator('span').nth(1)).toBeVisible();
      await nav.nth(1).click();
      await expect(calendar).toContainText('September 2026');
      await expect(day('30').locator('span').nth(1)).toBeVisible();
      await nav.nth(1).click();
      await expect(calendar).toContainText('October 2026');
      await expect(day('1').locator('span').nth(1)).toBeVisible();
      await nav.nth(0).click();
      const beforeChange = monthReads.length;
      await db.doc('resort_data/config').set({ timeZone: 'UTC' }, { merge: true });
      await expect.poll(() => monthReads.length).toBeGreaterThan(beforeChange);
      await expect(calendar).toContainText('September 2026');
      await expect(page.locator(`#booking-card-${prefix}_first`)).toBeVisible();
      await expect(page.locator(`#booking-card-${prefix}_old_zone`)).toBeVisible();
      for (const fixture of fixtures)
        expect((await db.doc(`bookings/${fixture.bookingId}`).get()).data()).toEqual(fixture);
      await db.doc('resort_data/config').set({ timeZone: 'Asia/Almaty' }, { merge: true });
      await page.reload();
      await expect(calendar).toContainText('September 2026');
      await expect(day('1').locator('span').nth(1)).toBeVisible();
      await day('1').click();
      await expect(page.locator(`#booking-card-${prefix}_first`)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
