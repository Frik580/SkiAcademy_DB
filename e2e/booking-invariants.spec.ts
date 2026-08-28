import { test } from '@playwright/test';
import { attemptAuthenticatedBooking, attemptAuthenticatedCancellation } from './callable-client';
import {
  expect,
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
  countBlockingBookingsForInstructor,
  getBlockingBookingIdsForPayer,
  getBookingById,
  getBookingSlotContext,
  getLatestBlockingBookingForPayer,
  listResourceClaimsForBooking,
} from './firestore-admin';

test.describe('booking migration invariants', () => {
  test.beforeAll(async () => {
    await waitForFunctionsEmulatorReady();
  });

  test('rejects overlapping bookings for the same instructor slot', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const blockingBefore = await countBlockingBookingsForInstructor(runtimeConfig.instructorId);
    const payerBookingsBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(10, testInfo), {
      time: uniqueTimeSlot(testInfo),
    });
    await waitForFunctionsEmulatorReady();
    await submitStudentBookingConfirmation(page);

    const firstBooking = await waitForNewBlockingBookingForPayer(
      runtimeConfig.studentUid,
      payerBookingsBefore,
      (candidate) => candidate.lifecycleStatus === 'confirmed'
    );
    expect(await countBlockingBookingsForInstructor(runtimeConfig.instructorId)).toBe(
      blockingBefore + 1
    );

    const authoritativeSlot = await getBookingSlotContext(firstBooking.bookingId);
    expect(authoritativeSlot).not.toBeNull();

    const conflictAttempt = await attemptAuthenticatedBooking({
      accountId: runtimeConfig.studentBUid,
      email: runtimeConfig.studentBEmail,
      password: runtimeConfig.studentBPassword,
      instructorId: runtimeConfig.instructorId,
      participantIds: [runtimeConfig.studentBParticipantId],
      localDate: authoritativeSlot!.localDate,
      localTime: authoritativeSlot!.localTime,
      timezone: authoritativeSlot!.timezone,
      durationMinutes: authoritativeSlot!.durationMinutes,
    });

    expect(conflictAttempt.ok).toBe(false);
    expect(
      ['instructor_conflict', 'resource_conflict', 'participant_conflict', 'ABORTED'].includes(
        conflictAttempt.errorCode ?? ''
      )
    ).toBe(true);
    expect(await countBlockingBookingsForInstructor(runtimeConfig.instructorId)).toBe(
      blockingBefore + 1
    );
  });

  test('persists the selected participant on the created booking', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const payerBookingsBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(11, testInfo), {
      participantDisplayName: runtimeConfig.studentChildDisplayName,
      time: uniqueTimeSlot(testInfo),
    });
    await waitForFunctionsEmulatorReady();
    await submitStudentBookingConfirmation(page);

    const booking = await waitForNewBlockingBookingForPayer(
      runtimeConfig.studentUid,
      payerBookingsBefore,
      (candidate) =>
        candidate.lifecycleStatus === 'confirmed' &&
        candidate.participantIds.includes(runtimeConfig.studentChildParticipantId)
    );

    expect(booking.participantIds).toEqual([runtimeConfig.studentChildParticipantId]);
  });

  test('forbids another account from cancelling a booking they do not own', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const payerBookingsBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(12, testInfo), {
      time: uniqueTimeSlot(testInfo),
    });
    await waitForFunctionsEmulatorReady();
    await submitStudentBookingConfirmation(page);

    await waitForNewBlockingBookingForPayer(
      runtimeConfig.studentUid,
      payerBookingsBefore,
      (candidate) => candidate.lifecycleStatus === 'confirmed'
    );

    const booking = await getLatestBlockingBookingForPayer(runtimeConfig.studentUid);
    expect(booking).not.toBeNull();
    expect(payerBookingsBefore.has(booking!.bookingId)).toBe(false);

    const unauthorizedAttempt = await attemptAuthenticatedCancellation({
      email: runtimeConfig.studentBEmail,
      password: runtimeConfig.studentBPassword,
      bookingId: booking!.bookingId,
      expectedRevision: booking!.revision,
    });

    expect(unauthorizedAttempt.ok).toBe(false);
    expect(['forbidden', 'PERMISSION_DENIED']).toContain(unauthorizedAttempt.errorCode);

    const unchanged = await getBookingById(booking!.bookingId);
    expect(unchanged?.lifecycleStatus).toBe('confirmed');
    expect(unchanged?.revision).toBe(booking!.revision);
  });

  test('canonical cancellation releases protected resource claims', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const payerBookingsBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(13, testInfo), {
      participantDisplayName: runtimeConfig.studentChildDisplayName,
      time: uniqueTimeSlot(testInfo),
    });
    await waitForFunctionsEmulatorReady();
    await submitStudentBookingConfirmation(page);

    await waitForNewBlockingBookingForPayer(
      runtimeConfig.studentUid,
      payerBookingsBefore,
      (candidate) => candidate.lifecycleStatus === 'confirmed'
    );

    const booking = await getLatestBlockingBookingForPayer(runtimeConfig.studentUid);
    expect(booking).not.toBeNull();
    expect(payerBookingsBefore.has(booking!.bookingId)).toBe(false);

    const claimsBefore = await listResourceClaimsForBooking(booking!.bookingId);
    expect(claimsBefore.some((claim) => claim.lifecycleStatus === 'active')).toBe(true);

    const cancellationAttempt = await attemptAuthenticatedCancellation({
      email: runtimeConfig.studentEmail,
      password: runtimeConfig.studentPassword,
      bookingId: booking!.bookingId,
      expectedRevision: booking!.revision,
    });
    expect(cancellationAttempt.ok).toBe(true);

    await expect
      .poll(async () => (await getBookingById(booking!.bookingId))?.lifecycleStatus)
      .toBe('cancelled');

    const claimsAfter = await listResourceClaimsForBooking(booking!.bookingId);
    expect(claimsAfter.length).toBeGreaterThan(0);
    expect(claimsAfter.every((claim) => claim.lifecycleStatus === 'released')).toBe(true);
  });

  test('does not report booking success when the canonical command fails', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const blockingBefore = await countBlockingBookingsForInstructor(runtimeConfig.instructorId);

    await page.route('**/*executeCanonicalCommand*', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Injected E2E backend failure',
            status: 'INTERNAL',
          },
        }),
      });
    });

    await openStudentBookingModal(page, runtimeConfig);
    const bookingModal = page.locator('.ui-modal').filter({
      has: page.getByRole('button', { name: 'Date', exact: true }),
    });
    await fillBookingSelectors(page, uniqueDayOffset(14, testInfo), {
      time: uniqueTimeSlot(testInfo),
    });
    await waitForFunctionsEmulatorReady();
    await page.getByRole('button', { name: /Confirm — deduct .+ from balance/ }).click();

    await expect(page.getByText('Lesson Booked!')).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(async () => countBlockingBookingsForInstructor(runtimeConfig.instructorId))
      .toBe(blockingBefore);
    await expect(bookingModal).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirm — deduct .+ from balance/ })).toBeVisible();
  });
});
