import {
  BookingChangeRequestSchema,
  BookingProposalSchema,
  BookingSchema,
  type Booking,
  type BookingChangeRequest,
  type BookingProposal,
} from '../canonical/bookingOccurrenceProposalChange';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  accountActorRef,
  guestActorRef,
} from '../canonical/identifiers';
import { timestampFromDate } from '../canonical/primitives';
import { canonicalPrimitiveFixtures } from './primitives';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const reservationExpiresAt = timestampFromDate(new Date('2026-01-01T01:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt,
  updatedAt: createdAt,
  audit: {
    createdByCommandId: 'command_booking_fixture_create',
    lastChangedByCommandId: 'command_booking_fixture_create',
    correlationId: 'correlation_booking_fixture_create',
  },
} as const;

const payerAccountId = AccountIdSchema.parse('account_booking_payer_fixture');
const secondParticipantId = ParticipantIdSchema.parse('participant_booking_fixture_02');
const thirdParticipantId = ParticipantIdSchema.parse('participant_booking_fixture_03');

function occurrenceFor(participantIds: readonly string[]) {
  return {
    occurrenceId: 'occurrence_booking_fixture_01',
    instructorId: canonicalPrimitiveFixtures.instructorId,
    interval: canonicalPrimitiveFixtures.interval,
    timeZone: canonicalPrimitiveFixtures.timeZone,
    scheduleRevision: 1,
    serviceParty: {
      participantIds: [...participantIds],
      frozenAt: createdAt,
    },
  } as const;
}

const individualBooking = BookingSchema.parse({
  bookingId: canonicalPrimitiveFixtures.bookingId,
  attribution: {
    bookingOrigin: 'account',
    bookedBy: accountActorRef(canonicalPrimitiveFixtures.accountId),
  },
  party: {
    kind: 'individual',
    participantIds: [canonicalPrimitiveFixtures.participantId],
  },
  occurrence: occurrenceFor([canonicalPrimitiveFixtures.participantId]),
  lifecycle: { status: 'confirmed' },
  paymentId: canonicalPrimitiveFixtures.paymentId,
  payerAccountId,
  ...metadata,
});

const familyGroupBooking = BookingSchema.parse({
  bookingId: 'booking_family_fixture_01',
  attribution: {
    bookingOrigin: 'account',
    bookedBy: accountActorRef(canonicalPrimitiveFixtures.accountId),
  },
  party: {
    kind: 'family_group',
    participantIds: [
      canonicalPrimitiveFixtures.participantId,
      secondParticipantId,
      thirdParticipantId,
    ],
  },
  occurrence: occurrenceFor([
    canonicalPrimitiveFixtures.participantId,
    secondParticipantId,
    thirdParticipantId,
  ]),
  lifecycle: { status: 'confirmed' },
  paymentId: 'payment_family_fixture_01',
  payerAccountId,
  ...metadata,
});

const guestPendingBooking = BookingSchema.parse({
  bookingId: 'booking_guest_fixture_01',
  attribution: {
    bookingOrigin: 'guest',
    bookedBy: guestActorRef(canonicalPrimitiveFixtures.guestSubjectId),
  },
  party: {
    kind: 'individual',
    participantIds: [canonicalPrimitiveFixtures.participantId],
  },
  occurrence: occurrenceFor([canonicalPrimitiveFixtures.participantId]),
  lifecycle: { status: 'pending', reservationExpiresAt },
  paymentId: 'payment_guest_fixture_01',
  ...metadata,
});

const openProposal = BookingProposalSchema.parse({
  proposalId: 'proposal_fixture_01',
  participantId: canonicalPrimitiveFixtures.participantId,
  instructorId: canonicalPrimitiveFixtures.instructorId,
  proposedService: {
    interval: canonicalPrimitiveFixtures.interval,
    timeZone: canonicalPrimitiveFixtures.timeZone,
  },
  lifecycle: { status: 'open' },
  ...metadata,
});

const openChangeRequest = BookingChangeRequestSchema.parse({
  requestId: 'change_request_fixture_01',
  bookingId: individualBooking.bookingId,
  requestType: 'instructor_unavailable',
  reason: 'Instructor cannot deliver the confirmed occurrence.',
  lifecycle: { status: 'open' },
  ...metadata,
});

export interface CanonicalBookingCollaborationFixtures {
  readonly individualBooking: Booking;
  readonly familyGroupBooking: Booking;
  readonly guestPendingBooking: Booking;
  readonly openProposal: BookingProposal;
  readonly openChangeRequest: BookingChangeRequest;
}

export const canonicalBookingCollaborationFixtures: CanonicalBookingCollaborationFixtures =
  Object.freeze({
    individualBooking,
    familyGroupBooking,
    guestPendingBooking,
    openProposal,
    openChangeRequest,
  });
