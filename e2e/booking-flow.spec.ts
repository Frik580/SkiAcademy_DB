import { test } from '@playwright/test';
import {
  expect,
  fillBookingSelectors,
  loadRuntimeConfig,
  uniqueDayOffset,
  uniqueTimeSlot,
  openGuestBookingModal,
  openStudentBookingModal,
  submitGuestBookingApplication,
  submitStudentBookingConfirmation,
  waitForNewBlockingBookingForPayer,
} from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';
import {
  getBlockingBookingIdsForPayer,
  getLatestBlockingBookingForPayer,
  getLatestGuestParticipant,
  listResourceClaimsForBooking,
} from './firestore-admin';

test.describe('booking flow', () => {
  test.beforeAll(async () => {
    await waitForFunctionsEmulatorReady();
  });

  test('guest can submit a lesson request from the home page', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const guestParticipantsBefore = await getLatestGuestParticipant();

    await openGuestBookingModal(page, runtimeConfig.instructorName);

    await page.getByPlaceholder('e.g. Alex Carter').fill('Guest Skier');
    await page.getByPlaceholder('+1 (555) 000-0000').fill('+1 555 0100');
    const slot = await fillBookingSelectors(page, uniqueDayOffset(1, testInfo), {
      time: uniqueTimeSlot(testInfo),
    });

    await waitForFunctionsEmulatorReady();
    await submitGuestBookingApplication(page);

    await expect
      .poll(async () => {
        const guestParticipant = await getLatestGuestParticipant();
        return guestParticipant?.participantId ?? null;
      })
      .not.toEqual(guestParticipantsBefore?.participantId ?? null);

    const guestParticipant = await getLatestGuestParticipant();
    expect(guestParticipant?.managementKind).toBe('unmanaged_guest');

    await expect
      .poll(async () => {
        const { listBookingsForInstructor } = await import('./firestore-admin');
        const bookings = await listBookingsForInstructor(runtimeConfig.instructorId);
        return bookings.some(
          (booking) =>
            booking.lifecycleStatus === 'pending' &&
            booking.participantIds.includes(guestParticipant?.participantId ?? '')
        );
      })
      .toBe(true);

    expect(slot.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(slot.localTime).toMatch(/^\d{1,2}:\d{2}$/);
  });

  test('signed-in student can book a lesson from the cabinet', async ({ page }, testInfo) => {
    const runtimeConfig = loadRuntimeConfig();
    const blockingBefore = await getBlockingBookingIdsForPayer(runtimeConfig.studentUid);

    await openStudentBookingModal(page, runtimeConfig);
    await fillBookingSelectors(page, uniqueDayOffset(5, testInfo), {
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
});
