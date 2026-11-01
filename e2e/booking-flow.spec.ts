import { test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { attemptAuthenticatedBooking, attemptAuthenticatedCancellation } from './callable-client';
import {
  expect,
  ensureParticipantSelected,
  fillBookingSelectors,
  loadRuntimeConfig,
  uniqueDayOffset,
  uniqueTimeSlot,
  openStudentBookingModal,
  submitStudentBookingConfirmation,
  waitForNewBlockingBookingForPayer,
} from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';
import {
  getBlockingBookingIdsForPayer,
  getLatestBlockingBookingForPayer,
  listResourceClaimsForBooking,
  hasBookingAttendanceTriggerWork,
  getBookingById,
} from './firestore-admin';

test.describe('booking flow', () => {
  test.beforeAll(async () => {
    await waitForFunctionsEmulatorReady();
  });

  test('signed-in student can book a lesson from the cabinet', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const blockingBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(5, testInfo), {
      participantDisplayName: runtimeConfig.studentDisplayName,
      time: uniqueTimeSlot(testInfo),
    });
    await waitForFunctionsEmulatorReady();
    await submitStudentBookingConfirmation(page);

    const booking = await waitForNewBlockingBookingForPayer(
      runtimeConfig.studentUid,
      blockingBefore,
      (candidate) => candidate.lifecycleStatus === 'confirmed'
    );

    expect(booking.participantIds.length).toBe(1);
    expect(
      [runtimeConfig.studentParticipantId, runtimeConfig.studentChildParticipantId].some((id) =>
        booking.participantIds.includes(id)
      )
    ).toBe(true);

    const authoritative = await getLatestBlockingBookingForPayer(runtimeConfig.studentUid);
    expect(authoritative?.bookingId).toBe(booking.bookingId);
    expect(authoritative?.instructorId).toBe(runtimeConfig.instructorId);

    const claims = await listResourceClaimsForBooking(booking.bookingId);
    expect(claims.some((claim) => claim.lifecycleStatus === 'active')).toBe(true);
    expect(
      claims.some(
        (claim) =>
          claim.resourceKind === 'instructor' && claim.resourceId === runtimeConfig.instructorId
      )
    ).toBe(true);
  });

  test('signed-in student creates one booking for self and a managed dependent', async ({
    page,
  }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const blockingBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(6, testInfo), {
      participantDisplayName: runtimeConfig.studentDisplayName,
      time: uniqueTimeSlot(testInfo),
    });
    const bookingModal = page.locator('.ui-modal').filter({
      has: page.getByRole('button', { name: 'Select Date', exact: true }),
    });
    await ensureParticipantSelected(bookingModal, runtimeConfig.studentChildDisplayName);
    await waitForFunctionsEmulatorReady();
    await submitStudentBookingConfirmation(page);

    const booking = await waitForNewBlockingBookingForPayer(
      runtimeConfig.studentUid,
      blockingBefore,
      (candidate) => candidate.lifecycleStatus === 'confirmed'
    );
    expect([...booking.participantIds].sort()).toEqual(
      [runtimeConfig.studentParticipantId, runtimeConfig.studentChildParticipantId].sort()
    );

    const claims = await listResourceClaimsForBooking(booking.bookingId);
    expect(
      claims.filter(
        (claim) => claim.lifecycleStatus === 'active' && claim.resourceKind === 'instructor'
      )
    ).toHaveLength(1);
    expect(
      claims.filter(
        (claim) => claim.lifecycleStatus === 'active' && claim.resourceKind === 'participant'
      )
    ).toHaveLength(2);
  });

  test('canonical booking delivers real Attendance trigger work', async ({}, testInfo) => {
    const config = loadRuntimeConfig();
    const bookingId = `booking_e2e_trigger_${randomUUID().replaceAll('-', '')}`;
    const date = new Date();
    date.setDate(date.getDate() + uniqueDayOffset(20, testInfo));
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    expect(await hasBookingAttendanceTriggerWork(bookingId)).toBe(false);
    const created = await attemptAuthenticatedBooking({
      accountId: config.studentBUid,
      email: config.studentBEmail,
      password: config.studentBPassword,
      instructorId: config.instructorId,
      participantIds: [config.studentBParticipantId],
      bookingId,
      exercisedCapability: 'account_owner',
      localDate,
      localTime: uniqueTimeSlot(testInfo),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(created).toMatchObject({ ok: true });
    try {
      // Creation commands do not write this projection; only the actual trigger does.
      await expect
        .poll(() => hasBookingAttendanceTriggerWork(bookingId), {
          timeout: 30_000,
          message: 'real booking Attendance trigger delivered',
        })
        .toBe(true);
    } finally {
      const booking = await getBookingById(bookingId);
      expect(booking).not.toBeNull();
      const cancelled = await attemptAuthenticatedCancellation({
        email: config.studentBEmail,
        password: config.studentBPassword,
        bookingId,
        expectedRevision: booking!.revision,
        exercisedCapability: 'account_owner',
      });
      expect(cancelled).toMatchObject({ ok: true });
    }
  });
});
