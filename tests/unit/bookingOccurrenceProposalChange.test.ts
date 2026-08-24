import { describe, expect, expectTypeOf, it } from 'vitest';
import { canonicalBookingCollaborationFixtures } from '@ski-academy/shared-domain/testing';
import {
  AccountIdSchema,
  BookingChangeRequestMutationShapeSchema,
  BookingChangeRequestSchema,
  BookingIdSchema,
  BookingOccurrenceSchema,
  BookingPartySchema,
  BookingProposalReservationShapeSchema,
  BookingProposalSchema,
  BookingSchema,
  GuestSubjectIdSchema,
  ImmutableBookingAttributionSchema,
  InstructorIdSchema,
  LegacyBookingShapeSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  accountActorRef,
  bookingOccurrenceIdentityIsPresent,
  changeRequestCarriesNoDirectBookingMutation,
  changeRequestLifecycleSeparateFromBookingLifecycle,
  containsLegacyBookingFields,
  deriveBookingPartyKind,
  guestActorRef,
  payerAccountDistinctFromParticipants,
  proposalCarriesNoReservationAuthority,
  proposalTargetsExactlyOneParticipant,
  timestampFromDate,
  validateCanonical,
  type AccountId,
  type BookingId,
  type InstructorId,
  type ParticipantId,
  type PaymentId,
} from '@ski-academy/shared-domain';

const timestamp = (value: string) => timestampFromDate(new Date(value));

const audit = {
  createdByCommandId: 'command_booking_test_create',
  lastChangedByCommandId: 'command_booking_test_create',
  correlationId: 'correlation_booking_test_create',
};

const metadata = {
  revision: 1,
  createdAt: timestamp('2026-01-01T00:00:00.000Z'),
  updatedAt: timestamp('2026-01-01T00:00:00.000Z'),
  audit,
};

const accountId = AccountIdSchema.parse('account_booking_test_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_subject_test_01');
const participantOne = ParticipantIdSchema.parse('participant_booking_test_01');
const participantTwo = ParticipantIdSchema.parse('participant_booking_test_02');
const participantThree = ParticipantIdSchema.parse('participant_booking_test_03');
const instructorId = InstructorIdSchema.parse('instructor_booking_test_01');
const paymentId = PaymentIdSchema.parse('payment_booking_test_01');
const bookingId = BookingIdSchema.parse('booking_booking_test_01');

function occurrence(participantIds: readonly string[]) {
  return {
    occurrenceId: 'occurrence_booking_test_01',
    instructorId,
    interval: {
      startsAt: timestamp('2026-01-15T04:00:00.000Z'),
      endsAt: timestamp('2026-01-15T05:00:00.000Z'),
    },
    timeZone: 'Asia/Almaty',
    scheduleRevision: 1,
    serviceParty: {
      participantIds: [...participantIds],
      frozenAt: metadata.createdAt,
    },
  };
}

function baseBooking(overrides: Record<string, unknown> = {}) {
  return {
    bookingId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: accountActorRef(accountId),
    },
    party: {
      kind: 'individual',
      participantIds: [participantOne],
    },
    occurrence: occurrence([participantOne]),
    lifecycle: { status: 'confirmed' },
    paymentId,
    payerAccountId: accountId,
    ...metadata,
    ...overrides,
  };
}

describe('canonical booking collaboration fixtures', () => {
  it('publishes individual, family/group, guest, proposal, and change-request fixtures', () => {
    expect(canonicalBookingCollaborationFixtures.individualBooking.party.kind).toBe('individual');
    expect(
      canonicalBookingCollaborationFixtures.familyGroupBooking.party.participantIds
    ).toHaveLength(3);
    expect(canonicalBookingCollaborationFixtures.guestPendingBooking.lifecycle.status).toBe(
      'pending'
    );
    expect(
      canonicalBookingCollaborationFixtures.adminGuestBookedByBooking.attribution.bookingOrigin
    ).toBe('admin');
    expect(canonicalBookingCollaborationFixtures.openProposal.lifecycle.status).toBe('open');
    expect(canonicalBookingCollaborationFixtures.openChangeRequest.lifecycle.status).toBe('open');
  });
});

describe('Booking aggregate contracts', () => {
  it('accepts a valid individual Booking', () => {
    expect(BookingSchema.safeParse(baseBooking()).success).toBe(true);
  });

  it('accepts a valid family/group Booking', () => {
    expect(
      BookingSchema.safeParse(
        baseBooking({
          party: {
            kind: 'family_group',
            participantIds: [participantOne, participantTwo, participantThree],
          },
          occurrence: occurrence([participantOne, participantTwo, participantThree]),
        })
      ).success
    ).toBe(true);
  });

  it('rejects zero Participants', () => {
    expect(
      BookingPartySchema.safeParse({
        kind: 'individual',
        participantIds: [],
      }).success
    ).toBe(false);
  });

  it('rejects more than eight Participants', () => {
    expect(
      BookingPartySchema.safeParse({
        kind: 'family_group',
        participantIds: Array.from({ length: 9 }, (_, index) => `participant_overflow_${index}`),
      }).success
    ).toBe(false);
  });

  it('rejects duplicate Participants', () => {
    expect(
      BookingSchema.safeParse(
        baseBooking({
          party: {
            kind: 'family_group',
            participantIds: [participantOne, participantOne],
          },
          occurrence: occurrence([participantOne, participantOne]),
        })
      ).success
    ).toBe(false);
  });

  it('rejects invalid Booking origins', () => {
    expect(
      ImmutableBookingAttributionSchema.safeParse({
        bookingOrigin: 'legacy',
        bookedBy: accountActorRef(accountId),
      }).success
    ).toBe(false);
  });

  it('accepts the approved bookingOrigin and bookedBy combinations', () => {
    const attributionCases = [
      { bookingOrigin: 'account', bookedBy: accountActorRef(accountId) },
      { bookingOrigin: 'guest', bookedBy: guestActorRef(guestSubjectId) },
      { bookingOrigin: 'instructor', bookedBy: accountActorRef(accountId) },
      { bookingOrigin: 'admin', bookedBy: accountActorRef(accountId) },
      { bookingOrigin: 'admin', bookedBy: guestActorRef(guestSubjectId) },
    ] as const;

    for (const attribution of attributionCases) {
      expect(ImmutableBookingAttributionSchema.safeParse(attribution).success).toBe(true);
      expect(
        BookingSchema.safeParse(
          baseBooking({
            attribution,
            lifecycle:
              attribution.bookingOrigin === 'guest'
                ? {
                    status: 'pending',
                    reservationExpiresAt: timestamp('2026-01-01T01:00:00.000Z'),
                  }
                : { status: 'confirmed' },
            payerAccountId:
              attribution.bookingOrigin === 'guest' && attribution.bookedBy.kind === 'guest'
                ? undefined
                : accountId,
          })
        ).success
      ).toBe(true);
    }
  });

  it('rejects invalid bookingOrigin and bookedBy combinations', () => {
    const invalidCases = [
      { bookingOrigin: 'account', bookedBy: guestActorRef(guestSubjectId) },
      { bookingOrigin: 'guest', bookedBy: accountActorRef(accountId) },
      { bookingOrigin: 'instructor', bookedBy: guestActorRef(guestSubjectId) },
    ] as const;

    for (const attribution of invalidCases) {
      expect(ImmutableBookingAttributionSchema.safeParse(attribution).success).toBe(false);
    }
  });

  it('rejects non-guest pending lifecycle combinations', () => {
    expect(
      BookingSchema.safeParse(
        baseBooking({
          lifecycle: {
            status: 'pending',
            reservationExpiresAt: timestamp('2026-01-01T01:00:00.000Z'),
          },
        })
      ).success
    ).toBe(false);
  });

  it('rejects invalid service intervals', () => {
    expect(
      BookingSchema.safeParse(
        baseBooking({
          occurrence: {
            ...occurrence([participantOne]),
            interval: {
              startsAt: timestamp('2026-01-15T05:00:00.000Z'),
              endsAt: timestamp('2026-01-15T04:00:00.000Z'),
            },
          },
        })
      ).success
    ).toBe(false);
  });

  it('rejects serviceParty Participants outside the booking party', () => {
    expect(
      BookingSchema.safeParse(
        baseBooking({
          occurrence: occurrence([participantTwo]),
        })
      ).success
    ).toBe(false);
  });

  it('represents immutable historical attribution structurally', () => {
    const attribution = ImmutableBookingAttributionSchema.parse({
      bookingOrigin: 'guest',
      bookedBy: guestActorRef(guestSubjectId),
    });
    expect(Object.keys(attribution).sort()).toEqual(['bookedBy', 'bookingOrigin']);
    expect(
      BookingSchema.safeParse(
        baseBooking({
          attribution,
          lifecycle: {
            status: 'pending',
            reservationExpiresAt: timestamp('2026-01-01T01:00:00.000Z'),
          },
          payerAccountId: undefined,
        })
      ).success
    ).toBe(true);
  });

  it('requires occurrence identity and rejects synthetic course Instructor IDs', () => {
    const parsedOccurrence = BookingOccurrenceSchema.parse(occurrence([participantOne]));
    expect(bookingOccurrenceIdentityIsPresent(parsedOccurrence)).toBe(true);
    expect(
      BookingOccurrenceSchema.safeParse({
        ...occurrence([participantOne]),
        instructorId: 'course_legacy_01',
      }).success
    ).toBe(false);
  });

  it('rejects legacy scalar userId/isGuest and course-shaped fields', () => {
    expect(containsLegacyBookingFields({ userId: accountId })).toBe(true);
    expect(containsLegacyBookingFields({ isGuest: true })).toBe(true);
    expect(containsLegacyBookingFields({ courseId: 'course_01' })).toBe(true);
    expect(LegacyBookingShapeSchema.safeParse({ userId: 'legacy_user' }).success).toBe(false);
    expect(LegacyBookingShapeSchema.safeParse({ courseId: 'course_01' }).success).toBe(false);
  });

  it('rejects withdrawn for individual Booking lifecycle', () => {
    expect(containsLegacyBookingFields({ status: 'withdrawn' })).toBe(true);
    expect(LegacyBookingShapeSchema.safeParse({ status: 'withdrawn' }).success).toBe(false);
    expect(
      BookingSchema.safeParse(
        baseBooking({
          lifecycle: { status: 'withdrawn' },
        })
      ).success
    ).toBe(false);
  });

  it('rejects course fields on canonical Booking payloads', () => {
    expect(
      BookingSchema.safeParse({
        ...baseBooking(),
        courseId: 'course_01',
      }).success
    ).toBe(false);
  });

  it('keeps payer, bookedBy, Participant, and Instructor identities distinct at compile time', () => {
    expectTypeOf(accountId).toEqualTypeOf<AccountId>();
    expectTypeOf(participantOne).toEqualTypeOf<ParticipantId>();
    expectTypeOf(instructorId).toEqualTypeOf<InstructorId>();
    expectTypeOf(paymentId).toEqualTypeOf<PaymentId>();
    expectTypeOf(bookingId).toEqualTypeOf<BookingId>();
    expectTypeOf<AccountId>().not.toEqualTypeOf<ParticipantId>();
    expectTypeOf<InstructorId>().not.toEqualTypeOf<ParticipantId>();
    expect(payerAccountDistinctFromParticipants(accountId, [participantOne])).toBe(true);
  });

  it('round-trips canonical Booking variants through strict serialization', () => {
    const individual = BookingSchema.parse(baseBooking());
    const family = BookingSchema.parse(
      baseBooking({
        party: {
          kind: 'family_group',
          participantIds: [participantOne, participantTwo],
        },
        occurrence: occurrence([participantOne, participantTwo]),
      })
    );
    const guest = BookingSchema.parse(
      baseBooking({
        attribution: {
          bookingOrigin: 'guest',
          bookedBy: guestActorRef(guestSubjectId),
        },
        lifecycle: {
          status: 'pending',
          reservationExpiresAt: timestamp('2026-01-01T01:00:00.000Z'),
        },
        payerAccountId: undefined,
      })
    );
    const pendingCancellation = BookingSchema.parse(
      baseBooking({
        lifecycle: {
          status: 'pending_cancellation',
          requestedAt: metadata.updatedAt,
        },
      })
    );
    const cancelled = BookingSchema.parse(
      baseBooking({
        lifecycle: {
          status: 'cancelled',
          cancelledAt: metadata.updatedAt,
          reasonCode: 'account_owner_cancelled',
        },
      })
    );
    const completed = BookingSchema.parse(
      baseBooking({
        lifecycle: {
          status: 'completed',
          completedAt: metadata.updatedAt,
        },
      })
    );
    const noShow = BookingSchema.parse(
      baseBooking({
        lifecycle: {
          status: 'no_show',
          noShowAt: metadata.updatedAt,
        },
      })
    );

    for (const booking of [
      individual,
      family,
      guest,
      pendingCancellation,
      cancelled,
      completed,
      noShow,
    ]) {
      expect(BookingSchema.parse(JSON.parse(JSON.stringify(booking)))).toEqual(booking);
    }
  });
});

describe('BookingProposal contracts', () => {
  it('accepts an open proposal bound to exactly one Participant', () => {
    const proposal = BookingProposalSchema.parse({
      proposalId: 'proposal_test_01',
      participantId: participantOne,
      instructorId,
      proposedService: {
        interval: occurrence([participantOne]).interval,
        timeZone: 'Asia/Almaty',
      },
      lifecycle: { status: 'open' },
      ...metadata,
    });
    expect(proposalTargetsExactlyOneParticipant(proposal)).toBe(true);
  });

  it('allows overlap and carries no reservation or claim authority', () => {
    const proposalPayload = {
      proposalId: 'proposal_test_02',
      participantId: participantOne,
      instructorId,
      proposedService: {
        interval: occurrence([participantOne]).interval,
        timeZone: 'Asia/Almaty',
      },
      lifecycle: { status: 'open' },
      ...metadata,
    };
    expect(BookingProposalSchema.safeParse(proposalPayload).success).toBe(true);
    expect(proposalCarriesNoReservationAuthority(proposalPayload)).toBe(true);
    expect(
      BookingProposalReservationShapeSchema.safeParse({
        resourceClaimId: 'claim_test_01',
      }).success
    ).toBe(false);
  });

  it('serializes terminal proposal lifecycle variants', () => {
    const accepted = BookingProposalSchema.parse({
      proposalId: 'proposal_accepted_01',
      participantId: participantOne,
      instructorId,
      proposedService: {
        interval: occurrence([participantOne]).interval,
        timeZone: 'Asia/Almaty',
      },
      lifecycle: {
        status: 'accepted',
        acceptedAt: metadata.updatedAt,
        resultingBookingId: bookingId,
      },
      ...metadata,
    });
    const declined = BookingProposalSchema.parse({
      proposalId: 'proposal_declined_01',
      participantId: participantOne,
      instructorId,
      proposedService: {
        interval: occurrence([participantOne]).interval,
        timeZone: 'Asia/Almaty',
      },
      lifecycle: { status: 'declined', declinedAt: metadata.updatedAt },
      ...metadata,
    });

    expect(BookingProposalSchema.parse(JSON.parse(JSON.stringify(accepted)))).toEqual(accepted);
    expect(BookingProposalSchema.parse(JSON.parse(JSON.stringify(declined)))).toEqual(declined);
  });
});

describe('BookingChangeRequest contracts', () => {
  it('keeps change-request lifecycle separate from Booking lifecycle state', () => {
    const booking = BookingSchema.parse(baseBooking());
    const changeRequest = BookingChangeRequestSchema.parse({
      requestId: 'change_request_test_01',
      bookingId,
      requestType: 'instructor_unavailable',
      reason: 'Instructor unavailable for the confirmed occurrence.',
      lifecycle: { status: 'open' },
      ...metadata,
    });

    expect(changeRequestLifecycleSeparateFromBookingLifecycle(changeRequest, booking)).toBe(true);
    expect(changeRequestCarriesNoDirectBookingMutation(changeRequest)).toBe(true);
    expect(
      BookingChangeRequestMutationShapeSchema.safeParse({
        targetBookingStatus: 'cancelled',
      }).success
    ).toBe(false);
  });

  it('round-trips canonical proposal and change-request payloads', () => {
    const proposal = BookingProposalSchema.parse({
      proposalId: 'proposal_roundtrip_01',
      participantId: participantOne,
      instructorId,
      proposedService: {
        interval: occurrence([participantOne]).interval,
        timeZone: 'Asia/Almaty',
      },
      lifecycle: { status: 'open' },
      ...metadata,
    });
    const changeRequest = BookingChangeRequestSchema.parse({
      requestId: 'change_request_roundtrip_01',
      bookingId,
      requestType: 'instructor_unavailable',
      reason: 'Need administration to resolve instructor unavailability.',
      lifecycle: { status: 'open' },
      ...metadata,
    });

    expect(BookingProposalSchema.parse(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
    expect(BookingChangeRequestSchema.parse(JSON.parse(JSON.stringify(changeRequest)))).toEqual(
      changeRequest
    );
  });

  it('round-trips resolved and cancelled change-request payloads', () => {
    const resolved = BookingChangeRequestSchema.parse({
      requestId: 'change_request_resolved_01',
      bookingId,
      requestType: 'instructor_unavailable',
      reason: 'Resolved by administration.',
      lifecycle: {
        status: 'resolved',
        resolvedAt: metadata.updatedAt,
        resolution: 'no_change',
      },
      ...metadata,
    });
    const cancelled = BookingChangeRequestSchema.parse({
      requestId: 'change_request_cancelled_01',
      bookingId,
      requestType: 'instructor_unavailable',
      reason: 'Instructor withdrew the request.',
      lifecycle: { status: 'cancelled', cancelledAt: metadata.updatedAt },
      ...metadata,
    });

    expect(BookingChangeRequestSchema.parse(JSON.parse(JSON.stringify(resolved)))).toEqual(resolved);
    expect(BookingChangeRequestSchema.parse(JSON.parse(JSON.stringify(cancelled)))).toEqual(
      cancelled
    );
  });
});

describe('Booking validation boundary', () => {
  it('returns normalized validation issues for malformed Booking payloads', () => {
    const result = validateCanonical(BookingSchema, {
      ...baseBooking(),
      party: {
        kind: 'individual',
        participantIds: [],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.includes('participantIds'))).toBe(true);
    }
  });

  it('derives booking party kind from participant count', () => {
    expect(deriveBookingPartyKind(1)).toBe('individual');
    expect(deriveBookingPartyKind(2)).toBe('family_group');
  });
});
