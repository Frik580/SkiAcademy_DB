import {
  BookingScopedParticipantAccessEvidenceSchema,
  type BookingScopedParticipantAccessEvidence,
} from './accountParticipantAccess';
import type { Booking } from './bookingOccurrenceProposalChange';
import type { AttendanceStatus } from './courseEnrollmentAttendanceAdminIssue';
import { addMillisecondsToCanonicalTimestamp } from './guestBooking';
import type { InstructorId, ParticipantId } from './identifiers';
import {
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';

export const BOOKING_LIFECYCLES_THAT_PROVIDE_INSTRUCTOR_PROGRESS_EVIDENCE = [
  'confirmed',
  'completed',
] as const;

export type BookingLifecycleThatProvidesInstructorProgressEvidence =
  (typeof BOOKING_LIFECYCLES_THAT_PROVIDE_INSTRUCTOR_PROGRESS_EVIDENCE)[number];

export type InstructorProgressAttendanceFact = AttendanceStatus | undefined;

function participantBelongsToInstructorBooking(input: {
  readonly booking: Booking;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
}): boolean {
  if (input.booking.archival?.isDeleted === true) return false;
  if (input.booking.occurrence.instructorId !== input.instructorId) return false;
  if (!input.booking.party.participantIds.includes(input.participantId)) return false;
  return input.booking.occurrence.serviceParty.participantIds.includes(input.participantId);
}

function progressEvidenceWindow(input: {
  readonly booking: Booking;
  readonly at: CanonicalTimestamp;
}): {
  readonly validFrom: CanonicalTimestamp;
  readonly validUntil: CanonicalTimestamp;
} {
  const validFrom =
    compareCanonicalTimestamps(input.booking.createdAt, input.at) <= 0
      ? input.booking.createdAt
      : input.at;
  let validUntil = addMillisecondsToCanonicalTimestamp(input.at, 1);
  if (compareCanonicalTimestamps(validFrom, validUntil) >= 0) {
    validUntil = addMillisecondsToCanonicalTimestamp(validFrom, 1);
  }
  return { validFrom, validUntil };
}

export function bookingProvidesInstructorProgressEvidence(input: {
  readonly booking: Booking;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
  readonly at: CanonicalTimestamp;
  readonly attendanceStatus?: InstructorProgressAttendanceFact;
}): boolean {
  if (!participantBelongsToInstructorBooking(input)) return false;

  const status = input.booking.lifecycle.status;
  if (status === 'no_show') return false;
  if (status !== 'confirmed' && status !== 'completed') return false;
  if (input.attendanceStatus !== 'present') return false;

  if (status === 'confirmed') {
    return (
      compareCanonicalTimestamps(input.at, input.booking.occurrence.interval.startsAt) >= 0
    );
  }

  return true;
}

export function bookingScopedEvidenceFromQualifyingProgressBooking(input: {
  readonly booking: Booking;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
  readonly at: CanonicalTimestamp;
  readonly attendanceStatus?: InstructorProgressAttendanceFact;
}): BookingScopedParticipantAccessEvidence | undefined {
  if (!bookingProvidesInstructorProgressEvidence(input)) {
    return undefined;
  }

  const window = progressEvidenceWindow(input);
  return BookingScopedParticipantAccessEvidenceSchema.parse({
    source: { kind: 'booking', bookingId: input.booking.bookingId },
    participantId: input.participantId,
    instructorId: input.instructorId,
    validFrom: window.validFrom,
    validUntil: window.validUntil,
  });
}
