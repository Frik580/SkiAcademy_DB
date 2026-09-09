import {
  BookingScopedParticipantAccessEvidenceSchema,
  type BookingScopedParticipantAccessEvidence,
} from './accountParticipantAccess';
import type {
  Booking,
  BookingProposalStatus,
} from './bookingOccurrenceProposalChange';
import {
  addMillisecondsToCanonicalTimestamp,
  minCanonicalTimestamp,
} from './guestBooking';
import type { InstructorId, ParticipantId } from './identifiers';
import {
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';

export const BOOKING_LIFECYCLES_THAT_PROVIDE_INSTRUCTOR_PROPOSAL_EVIDENCE = [
  'confirmed',
  'completed',
  'no_show',
] as const;

export type BookingLifecycleThatProvidesInstructorProposalEvidence =
  (typeof BOOKING_LIFECYCLES_THAT_PROVIDE_INSTRUCTOR_PROPOSAL_EVIDENCE)[number];

export function bookingLifecycleProvidesInstructorProposalEvidence(
  status: string
): status is BookingLifecycleThatProvidesInstructorProposalEvidence {
  return status === 'confirmed' || status === 'completed' || status === 'no_show';
}

export interface InstructorProposalBookingEvidenceView {
  readonly instructorId: string;
  readonly participantIds: readonly string[];
  readonly lifecycleStatus: string;
  readonly isDeleted?: boolean;
}

export function bookingProvidesInstructorProposalEvidence(input: {
  readonly instructorId: string;
  readonly participantId: string;
  readonly booking: InstructorProposalBookingEvidenceView;
}): boolean {
  if (input.booking.isDeleted === true) return false;
  if (input.booking.instructorId !== input.instructorId) return false;
  if (!bookingLifecycleProvidesInstructorProposalEvidence(input.booking.lifecycleStatus)) {
    return false;
  }
  return input.booking.participantIds.includes(input.participantId);
}

export function bookingProvidesInstructorProposalEvidenceFromBooking(
  booking: Booking,
  input: Readonly<{ instructorId: InstructorId; participantId: ParticipantId }>
): boolean {
  if (booking.occurrence.instructorId !== input.instructorId) return false;
  if (!booking.party.participantIds.includes(input.participantId)) return false;
  if (!booking.occurrence.serviceParty.participantIds.includes(input.participantId)) {
    return false;
  }
  return bookingProvidesInstructorProposalEvidence({
    instructorId: input.instructorId,
    participantId: input.participantId,
    booking: {
      instructorId: booking.occurrence.instructorId,
      participantIds: booking.party.participantIds,
      lifecycleStatus: booking.lifecycle.status,
      isDeleted: booking.archival?.isDeleted === true,
    },
  });
}

export function bookingScopedEvidenceFromQualifyingBooking(input: {
  readonly booking: Booking;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
  readonly at: CanonicalTimestamp;
}): BookingScopedParticipantAccessEvidence | undefined {
  if (!bookingProvidesInstructorProposalEvidenceFromBooking(input.booking, input)) {
    return undefined;
  }

  const validFrom =
    compareCanonicalTimestamps(input.booking.createdAt, input.at) <= 0
      ? input.booking.createdAt
      : input.at;
  let validUntil = addMillisecondsToCanonicalTimestamp(input.at, 1);
  if (compareCanonicalTimestamps(validFrom, validUntil) >= 0) {
    validUntil = addMillisecondsToCanonicalTimestamp(validFrom, 1);
  }

  return BookingScopedParticipantAccessEvidenceSchema.parse({
    source: { kind: 'booking', bookingId: input.booking.bookingId },
    participantId: input.participantId,
    instructorId: input.instructorId,
    validFrom,
    validUntil,
  });
}

export function instructorMayCreateBookingProposal(input: {
  readonly instructorId: string;
  readonly participantId: string;
  readonly relationshipStatus?: 'active' | 'revoked' | 'expired';
  readonly bookings: readonly InstructorProposalBookingEvidenceView[];
}): boolean {
  if (input.relationshipStatus === 'active') return true;
  return input.bookings.some((booking) =>
    bookingProvidesInstructorProposalEvidence({
      instructorId: input.instructorId,
      participantId: input.participantId,
      booking,
    })
  );
}

export function instructorMayCreateBookingProposalForParty(input: {
  readonly instructorId: string;
  readonly participantIds: readonly string[];
  readonly relationshipStatusByParticipantId: ReadonlyMap<
    string,
    'active' | 'revoked' | 'expired' | undefined
  >;
  readonly bookings: readonly InstructorProposalBookingEvidenceView[];
}): boolean {
  if (input.participantIds.length < 1) return false;
  return input.participantIds.every((participantId) =>
    instructorMayCreateBookingProposal({
      instructorId: input.instructorId,
      participantId,
      relationshipStatus: input.relationshipStatusByParticipantId.get(participantId),
      bookings: input.bookings,
    })
  );
}

/** Maximum hold before an open BookingProposal expires. */
export const BOOKING_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1_000;

export function resolveBookingProposalExpiresAt(input: {
  readonly createdAt: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp {
  const ttlExpiresAt = addMillisecondsToCanonicalTimestamp(
    input.createdAt,
    BOOKING_PROPOSAL_TTL_MS
  );
  return minCanonicalTimestamp(ttlExpiresAt, input.serviceStartsAt);
}

export function isBookingProposalExpired(input: {
  readonly now: CanonicalTimestamp;
  readonly expiresAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.expiresAt) >= 0;
}

export function isBookingProposalAcceptanceAllowedBeforeStart(input: {
  readonly now: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.serviceStartsAt) < 0;
}

export function isTerminalBookingProposalStatus(status: BookingProposalStatus): boolean {
  return status !== 'open';
}
