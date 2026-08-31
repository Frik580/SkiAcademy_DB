import { describe, expect, it } from 'vitest';
import {
  evaluateAdminGuestBookingIdentityLinkAvailability,
  evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability,
  timestampFromDate,
  unmanagedGuestParticipantIds,
} from '@ski-academy/shared-domain';

const now = timestampFromDate(new Date('2026-08-01T10:00:00.000Z'));
const later = timestampFromDate(new Date('2026-09-01T10:00:00.000Z'));
const guestId = 'participant_policy_guest_01';
const managedId = 'participant_policy_managed_01';

describe('guest identity linking policy', () => {
  it('derives a unique unmanaged guest Participant and does not invent a source id', () => {
    expect(
      unmanagedGuestParticipantIds({
        partyParticipantIds: [guestId, managedId],
        participants: [
          { participantId: guestId, management: { kind: 'unmanaged_guest' } },
          { participantId: managedId, management: { kind: 'managed' } },
        ],
      })
    ).toEqual([guestId]);

    const available = evaluateAdminGuestBookingIdentityLinkAvailability({
      bookingOrigin: 'guest',
      lifecycleStatus: 'pending',
      reservationExpiresAt: later,
      now,
      partyParticipantIds: [guestId],
      participants: [{ participantId: guestId, management: { kind: 'unmanaged_guest' } }],
      recordedAttendance: false,
      administratorAccountActive: true,
    });
    expect(available).toEqual({ canLink: true, sourceGuestParticipantId: guestId });
  });

  it('treats zero unmanaged guests as already linked and more than one as a conflict', () => {
    expect(
      evaluateAdminGuestBookingIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        now,
        partyParticipantIds: [managedId],
        participants: [{ participantId: managedId, management: { kind: 'managed' } }],
        recordedAttendance: false,
        administratorAccountActive: true,
      }).reason
    ).toBe('already_linked');

    expect(
      evaluateAdminGuestBookingIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        now,
        partyParticipantIds: [guestId, 'participant_policy_guest_02'],
        participants: [
          { participantId: guestId, management: { kind: 'unmanaged_guest' } },
          { participantId: 'participant_policy_guest_02', management: { kind: 'unmanaged_guest' } },
        ],
        recordedAttendance: false,
        administratorAccountActive: true,
      }).reason
    ).toBe('ambiguous_guest_participant');
  });

  it('fails closed on attendance, expiry, inactive admin, and non-guest origin', () => {
    expect(
      evaluateAdminGuestBookingIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        now,
        partyParticipantIds: [guestId],
        participants: [{ participantId: guestId, management: { kind: 'unmanaged_guest' } }],
        recordedAttendance: true,
        administratorAccountActive: true,
      }).reason
    ).toBe('attendance_recorded');

    expect(
      evaluateAdminGuestBookingIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        reservationExpiresAt: now,
        now: later,
        partyParticipantIds: [guestId],
        participants: [{ participantId: guestId, management: { kind: 'unmanaged_guest' } }],
        recordedAttendance: false,
        administratorAccountActive: true,
      }).reason
    ).toBe('expired_reservation');

    expect(
      evaluateAdminGuestBookingIdentityLinkAvailability({
        bookingOrigin: 'account',
        lifecycleStatus: 'confirmed',
        now,
        partyParticipantIds: [guestId],
        participants: [{ participantId: guestId, management: { kind: 'unmanaged_guest' } }],
        recordedAttendance: false,
        administratorAccountActive: true,
      }).reason
    ).toBe('not_guest');

    expect(
      evaluateAdminGuestBookingIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        now,
        partyParticipantIds: [guestId],
        participants: [{ participantId: guestId, management: { kind: 'unmanaged_guest' } }],
        recordedAttendance: false,
        administratorAccountActive: false,
      }).reason
    ).toBe('admin_account_inactive');
  });

  it('authorizes Admin enrollment linking only for unlinked guests before start and attendance', () => {
    const available = evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability({
      bookingOrigin: 'guest',
      lifecycleStatus: 'pending',
      reservationExpiresAt: later,
      now,
      recordedDayCount: 0,
      courseStartAt: later,
      administratorAccountActive: true,
    });
    expect(available).toEqual({ canLink: true });

    expect(
      evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability({
        bookingOrigin: 'guest',
        guestAccountLink: {
          linkedAccountId: 'account_policy_01',
          linkedParticipantId: managedId,
          linkedAt: now,
        },
        lifecycleStatus: 'confirmed',
        now,
        recordedDayCount: 0,
        courseStartAt: later,
        administratorAccountActive: true,
      }).reason
    ).toBe('already_linked');

    expect(
      evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        now,
        recordedDayCount: 1,
        courseStartAt: later,
        administratorAccountActive: true,
      }).reason
    ).toBe('attendance_recorded');

    expect(
      evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        now: later,
        recordedDayCount: 0,
        courseStartAt: later,
        administratorAccountActive: true,
      }).reason
    ).toBe('course_started');
  });
});
