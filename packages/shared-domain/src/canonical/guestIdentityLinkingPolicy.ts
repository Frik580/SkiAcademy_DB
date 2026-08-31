import { z } from 'zod';
import type { Booking } from './bookingOccurrenceProposalChange';
import type { Course, CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import { isGuestReservationExpired } from './guestBooking';
import type { ParticipantId } from './identifiers';
import { compareCanonicalTimestamps, type CanonicalTimestamp } from './primitives';

export const GUEST_IDENTITY_LINKABLE_LIFECYCLE_STATUSES = [
  'pending',
  'confirmed',
  'pending_cancellation',
] as const;

export type GuestIdentityLinkableLifecycleStatus =
  (typeof GUEST_IDENTITY_LINKABLE_LIFECYCLE_STATUSES)[number];

export const GuestIdentityLinkUnavailableReasonSchema = z.enum([
  'not_guest',
  'already_linked',
  'ambiguous_guest_participant',
  'ineligible_lifecycle',
  'expired_reservation',
  'attendance_recorded',
  'course_started',
  'admin_account_inactive',
]);

export type GuestIdentityLinkUnavailableReason = z.output<
  typeof GuestIdentityLinkUnavailableReasonSchema
>;

const LINKABLE = new Set<string>(GUEST_IDENTITY_LINKABLE_LIFECYCLE_STATUSES);

export function isGuestIdentityLinkableLifecycleStatus(
  status: string
): status is GuestIdentityLinkableLifecycleStatus {
  return LINKABLE.has(status);
}

export function unmanagedGuestParticipantIds(input: {
  readonly partyParticipantIds: readonly ParticipantId[];
  readonly participants: readonly {
    readonly participantId: ParticipantId;
    readonly management: { readonly kind: string };
  }[];
}): ParticipantId[] {
  const byId = new Map(input.participants.map((participant) => [participant.participantId, participant]));
  return input.partyParticipantIds.filter((participantId) => {
    const participant = byId.get(participantId);
    return participant?.management.kind === 'unmanaged_guest';
  });
}

export function evaluateAdminGuestBookingIdentityLinkAvailability(input: {
  readonly bookingOrigin: Booking['attribution']['bookingOrigin'];
  readonly lifecycleStatus: Booking['lifecycle']['status'];
  readonly reservationExpiresAt?: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
  readonly partyParticipantIds: readonly ParticipantId[];
  readonly participants: readonly {
    readonly participantId: ParticipantId;
    readonly management: { readonly kind: string };
  }[];
  readonly recordedAttendance: boolean;
  readonly administratorAccountActive: boolean;
}): {
  readonly canLink: boolean;
  readonly reason?: GuestIdentityLinkUnavailableReason;
  readonly sourceGuestParticipantId?: ParticipantId;
} {
  if (!input.administratorAccountActive) {
    return { canLink: false, reason: 'admin_account_inactive' };
  }
  if (input.bookingOrigin !== 'guest') {
    return { canLink: false, reason: 'not_guest' };
  }
  const unmanaged = unmanagedGuestParticipantIds(input);
  if (unmanaged.length === 0) {
    return { canLink: false, reason: 'already_linked' };
  }
  if (unmanaged.length !== 1) {
    return { canLink: false, reason: 'ambiguous_guest_participant' };
  }
  if (!isGuestIdentityLinkableLifecycleStatus(input.lifecycleStatus)) {
    return { canLink: false, reason: 'ineligible_lifecycle' };
  }
  if (
    input.lifecycleStatus === 'pending' &&
    input.reservationExpiresAt !== undefined &&
    isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: input.reservationExpiresAt,
    })
  ) {
    return { canLink: false, reason: 'expired_reservation' };
  }
  if (input.recordedAttendance) {
    return { canLink: false, reason: 'attendance_recorded' };
  }
  return { canLink: true, sourceGuestParticipantId: unmanaged[0] };
}

export function evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability(input: {
  readonly bookingOrigin: CourseEnrollment['attribution']['bookingOrigin'];
  readonly guestAccountLink?: CourseEnrollment['guestAccountLink'];
  readonly lifecycleStatus: CourseEnrollment['lifecycle']['status'];
  readonly reservationExpiresAt?: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
  readonly recordedDayCount: number;
  readonly courseStartAt: Course['startAt'];
  readonly administratorAccountActive: boolean;
}): {
  readonly canLink: boolean;
  readonly reason?: GuestIdentityLinkUnavailableReason;
} {
  if (!input.administratorAccountActive) {
    return { canLink: false, reason: 'admin_account_inactive' };
  }
  if (input.bookingOrigin !== 'guest') {
    return { canLink: false, reason: 'not_guest' };
  }
  if (input.guestAccountLink) {
    return { canLink: false, reason: 'already_linked' };
  }
  if (!isGuestIdentityLinkableLifecycleStatus(input.lifecycleStatus)) {
    return { canLink: false, reason: 'ineligible_lifecycle' };
  }
  if (
    input.lifecycleStatus === 'pending' &&
    input.reservationExpiresAt !== undefined &&
    isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: input.reservationExpiresAt,
    })
  ) {
    return { canLink: false, reason: 'expired_reservation' };
  }
  if (input.recordedDayCount > 0) {
    return { canLink: false, reason: 'attendance_recorded' };
  }
  if (compareCanonicalTimestamps(input.now, input.courseStartAt) >= 0) {
    return { canLink: false, reason: 'course_started' };
  }
  return { canLink: true };
}
