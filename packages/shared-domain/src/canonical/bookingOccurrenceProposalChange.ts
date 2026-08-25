import { z } from 'zod';
import {
  AccountIdSchema,
  ActorRefSchema,
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  type AccountId,
  type ActorRef,
  type ParticipantId,
} from './identifiers';
import { CanonicalRecordMetadataSchema } from './accountParticipantAccess';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
  TimeIntervalSchema,
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const BOOKING_ORIGINS = ['account', 'guest', 'instructor', 'admin'] as const;
export type BookingOriginValue = (typeof BOOKING_ORIGINS)[number];

export const BOOKING_PARTY_KINDS = ['individual', 'family_group'] as const;
export type BookingPartyKind = (typeof BOOKING_PARTY_KINDS)[number];

export const BOOKING_PARTY_MIN = 1 as const;
export const BOOKING_PARTY_MAX = 8 as const;

export const BOOKING_LIFECYCLE_STATUSES = [
  'pending',
  'confirmed',
  'pending_cancellation',
  'cancelled',
  'completed',
  'no_show',
] as const;
export type BookingLifecycleStatus = (typeof BOOKING_LIFECYCLE_STATUSES)[number];

export const BOOKING_CANCELLATION_REASON_CODES = [
  'reservation_expired',
  'guest_cancelled',
  'account_owner_cancelled',
  'administrator_cancelled',
  'incomplete_payment',
  'booking_change_request',
  'system_expired',
] as const;
export type BookingCancellationReasonCode = (typeof BOOKING_CANCELLATION_REASON_CODES)[number];

export const BOOKING_PROPOSAL_STATUSES = [
  'open',
  'accepted',
  'declined',
  'expired',
  'unavailable',
  'cancelled',
] as const;
export type BookingProposalStatus = (typeof BOOKING_PROPOSAL_STATUSES)[number];

export const BOOKING_PROPOSAL_CANCELLATION_REASON_CODES = [
  'instructor_withdrawn',
  'instructor_blocked_by_owner',
] as const;
export type BookingProposalCancellationReasonCode =
  (typeof BOOKING_PROPOSAL_CANCELLATION_REASON_CODES)[number];

export const BOOKING_CHANGE_REQUEST_STATUSES = ['open', 'resolved', 'cancelled'] as const;
export type BookingChangeRequestStatus = (typeof BOOKING_CHANGE_REQUEST_STATUSES)[number];

export const BOOKING_CHANGE_REQUEST_TYPES = ['instructor_unavailable'] as const;
export type BookingChangeRequestType = (typeof BOOKING_CHANGE_REQUEST_TYPES)[number];

export const BOOKING_CHANGE_REQUEST_RESOLUTIONS = [
  'rescheduled',
  'booking_cancelled',
  'no_change',
] as const;
export type BookingChangeRequestResolution = (typeof BOOKING_CHANGE_REQUEST_RESOLUTIONS)[number];

export const BookingOriginSchema = z.enum(BOOKING_ORIGINS);
export const BookingPartyKindSchema = z.enum(BOOKING_PARTY_KINDS);
export const BookingLifecycleStatusSchema = z.enum(BOOKING_LIFECYCLE_STATUSES);
export const BookingCancellationReasonCodeSchema = z.enum(BOOKING_CANCELLATION_REASON_CODES);
export const BookingProposalStatusSchema = z.enum(BOOKING_PROPOSAL_STATUSES);
export const BookingProposalCancellationReasonCodeSchema = z.enum(
  BOOKING_PROPOSAL_CANCELLATION_REASON_CODES
);
export const BookingChangeRequestStatusSchema = z.enum(BOOKING_CHANGE_REQUEST_STATUSES);
export const BookingChangeRequestTypeSchema = z.enum(BOOKING_CHANGE_REQUEST_TYPES);
export const BookingChangeRequestResolutionSchema = z.enum(BOOKING_CHANGE_REQUEST_RESOLUTIONS);

export const LEGACY_BOOKING_FIELD_NAMES = [
  'userId',
  'isGuest',
  'date',
  'time',
  'durationHours',
  'duration',
  'courseId',
  'coursePrice',
  'instructorName',
  'instructorAvatar',
  'difficulty',
  'totalPrice',
  'enrollmentId',
  'availableSeats',
  'syntheticInstructorId',
  'booking_course',
] as const;

export const PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES = [
  'resourceClaimId',
  'resourceClaimIds',
  'claimId',
  'claimIds',
  'reservationClaimId',
  'reservationExpiresAt',
  'availabilitySlotId',
  'hourLockId',
] as const;

export const CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES = [
  'bookingStatus',
  'targetBookingStatus',
  'nextBookingStatus',
  'lifecyclePatch',
  'patchBooking',
  'setStatus',
  'transitionTo',
] as const;

function addRecordChronologyIssue(
  record: { readonly createdAt: CanonicalTimestamp; readonly updatedAt: CanonicalTimestamp },
  context: z.RefinementCtx
): void {
  if (compareCanonicalTimestamps(record.updatedAt, record.createdAt) < 0) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must not precede createdAt',
    });
  }
}

function addEventChronologyIssue(
  eventAt: CanonicalTimestamp,
  path: (string | number)[],
  record: { readonly createdAt: CanonicalTimestamp; readonly updatedAt: CanonicalTimestamp },
  context: z.RefinementCtx
): void {
  if (
    compareCanonicalTimestamps(eventAt, record.createdAt) < 0 ||
    compareCanonicalTimestamps(eventAt, record.updatedAt) > 0
  ) {
    context.addIssue({
      code: 'custom',
      path,
      message: 'Lifecycle timestamp must fall between createdAt and updatedAt',
    });
  }
}

function duplicateParticipantIndexes(
  participantIds: readonly ParticipantId[]
): readonly number[] {
  const firstIndexById = new Map<string, number>();
  const duplicates: number[] = [];
  participantIds.forEach((participantId, index) => {
    if (firstIndexById.has(participantId)) duplicates.push(index);
    else firstIndexById.set(participantId, index);
  });
  return duplicates;
}

export function deriveBookingPartyKind(participantCount: number): BookingPartyKind {
  return participantCount === 1 ? 'individual' : 'family_group';
}

export function isSyntheticCourseInstructorId(value: string): boolean {
  return value.startsWith('course_');
}

export function containsLegacyBookingFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  if (record.status === 'withdrawn') return true;
  if (typeof record.instructorId === 'string' && isSyntheticCourseInstructorId(record.instructorId)) {
    return true;
  }
  return LEGACY_BOOKING_FIELD_NAMES.some((field) => record[field] !== undefined);
}

export function proposalCarriesNoReservationAuthority(input: unknown): boolean {
  if (!input || typeof input !== 'object') return true;
  const record = input as Record<string, unknown>;
  return !PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES.some((field) => record[field] !== undefined);
}

export function changeRequestCarriesNoDirectBookingMutation(input: unknown): boolean {
  if (!input || typeof input !== 'object') return true;
  const record = input as Record<string, unknown>;
  return !CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES.some(
    (field) => record[field] !== undefined
  );
}

export function validateBookingAttribution(
  attribution: Readonly<{ bookingOrigin: BookingOriginValue; bookedBy: ActorRef }>,
  context: z.RefinementCtx,
  basePath: (string | number)[] = ['attribution']
): void {
  const add = (path: string, message: string) => {
    context.addIssue({ code: 'custom', path: [...basePath, path], message });
  };

  switch (attribution.bookingOrigin) {
    case 'guest':
      if (attribution.bookedBy.kind !== 'guest') {
        add('bookedBy', 'Guest bookingOrigin requires a guest bookedBy actor');
      }
      return;
    case 'account':
    case 'instructor':
      if (attribution.bookedBy.kind !== 'account') {
        add('bookedBy', `${attribution.bookingOrigin} bookingOrigin requires an Account bookedBy actor`);
      }
      return;
    case 'admin':
      return;
  }
}

export function validateBookingPartyParticipantIds(
  participantIds: readonly ParticipantId[],
  context: z.RefinementCtx,
  basePath: (string | number)[] = ['party', 'participantIds']
): void {
  if (participantIds.length < BOOKING_PARTY_MIN) {
    context.addIssue({
      code: 'custom',
      path: basePath,
      message: 'Booking party must contain at least one Participant',
    });
  }
  if (participantIds.length > BOOKING_PARTY_MAX) {
    context.addIssue({
      code: 'custom',
      path: basePath,
      message: 'Booking party must contain at most eight Participants',
    });
  }
  for (const index of duplicateParticipantIndexes(participantIds)) {
    context.addIssue({
      code: 'custom',
      path: [...basePath, index],
      message: 'Duplicate Participant identity',
    });
  }
}

export function validateBookingPartyKindConsistency(
  party: Readonly<{ kind: BookingPartyKind; participantIds: readonly ParticipantId[] }>,
  context: z.RefinementCtx,
  basePath: (string | number)[] = ['party']
): void {
  const expectedKind = deriveBookingPartyKind(party.participantIds.length);
  if (party.kind !== expectedKind) {
    context.addIssue({
      code: 'custom',
      path: [...basePath, 'kind'],
      message: 'Booking party kind must match participantIds length',
    });
  }
}

export function validateServicePartySubset(
  partyParticipantIds: readonly ParticipantId[],
  serviceParticipantIds: readonly ParticipantId[],
  context: z.RefinementCtx,
  basePath: (string | number)[] = ['occurrence', 'serviceParty', 'participantIds']
): void {
  validateBookingPartyParticipantIds(serviceParticipantIds, context, basePath);
  const partySet = new Set(partyParticipantIds);
  serviceParticipantIds.forEach((participantId, index) => {
    if (!partySet.has(participantId)) {
      context.addIssue({
        code: 'custom',
        path: [...basePath, index],
        message: 'serviceParty must reference booking party Participants',
      });
    }
  });
}

export function validateBookingOriginLifecycleConsistency(
  attribution: Readonly<{ bookingOrigin: BookingOriginValue }>,
  lifecycle: Readonly<{ status: BookingLifecycleStatus }>,
  context: z.RefinementCtx
): void {
  if (lifecycle.status === 'pending' && attribution.bookingOrigin !== 'guest') {
    context.addIssue({
      code: 'custom',
      path: ['lifecycle', 'status'],
      message: 'Only guest-origin Bookings may be pending',
    });
  }
}

export const ImmutableBookingAttributionSchema = z
  .object({
    bookingOrigin: BookingOriginSchema,
    bookedBy: ActorRefSchema,
  })
  .strict()
  .superRefine((attribution, context) => {
    validateBookingAttribution(attribution, context);
  });

export type ImmutableBookingAttribution = Readonly<z.output<typeof ImmutableBookingAttributionSchema>>;

export const BookingPartySchema = z
  .object({
    kind: BookingPartyKindSchema,
    participantIds: z.array(ParticipantIdSchema).min(BOOKING_PARTY_MIN).max(BOOKING_PARTY_MAX),
  })
  .strict()
  .superRefine((party, context) => {
    validateBookingPartyParticipantIds(party.participantIds, context);
    validateBookingPartyKindConsistency(party, context);
  });

export type BookingParty = Readonly<z.output<typeof BookingPartySchema>>;

export const BookingServicePartySchema = z
  .object({
    participantIds: z
      .array(ParticipantIdSchema)
      .min(BOOKING_PARTY_MIN)
      .max(BOOKING_PARTY_MAX),
    frozenAt: CanonicalTimestampSchema.optional(),
  })
  .strict()
  .superRefine((serviceParty, context) => {
    validateBookingPartyParticipantIds(serviceParty.participantIds, context, [
      'participantIds',
    ]);
  });

export type BookingServiceParty = Readonly<z.output<typeof BookingServicePartySchema>>;

export const BookingOccurrenceSchema = z
  .object({
    occurrenceId: OccurrenceIdSchema,
    instructorId: InstructorIdSchema,
    interval: TimeIntervalSchema,
    timeZone: IanaTimeZoneSchema,
    scheduleRevision: PersistedAggregateRevisionSchema,
    serviceParty: BookingServicePartySchema,
  })
  .strict()
  .superRefine((occurrence, context) => {
    if (isSyntheticCourseInstructorId(occurrence.instructorId)) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'Synthetic course Instructor IDs are not canonical on Bookings',
      });
    }
  });

export type BookingOccurrence = Readonly<z.output<typeof BookingOccurrenceSchema>>;

const BookingLifecycleSchema = z.discriminatedUnion('status', [
    z
      .object({
        status: z.literal('pending'),
        reservationExpiresAt: CanonicalTimestampSchema,
      })
      .strict(),
    z.object({ status: z.literal('confirmed') }).strict(),
    z
      .object({
        status: z.literal('pending_cancellation'),
        requestedAt: CanonicalTimestampSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal('cancelled'),
        cancelledAt: CanonicalTimestampSchema,
        reasonCode: BookingCancellationReasonCodeSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal('completed'),
        completedAt: CanonicalTimestampSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal('no_show'),
        noShowAt: CanonicalTimestampSchema,
      })
      .strict(),
  ]);

export type BookingLifecycle = Readonly<z.output<typeof BookingLifecycleSchema>>;

const BookingArchivalSchema = z
  .object({
    isDeleted: z.literal(true),
    deletedAt: CanonicalTimestampSchema,
  })
  .strict();

export const BookingSchema = z
  .object({
    bookingId: BookingIdSchema,
    attribution: ImmutableBookingAttributionSchema,
    party: BookingPartySchema,
    occurrence: BookingOccurrenceSchema,
    lifecycle: BookingLifecycleSchema,
    paymentId: PaymentIdSchema,
    payerAccountId: AccountIdSchema.optional(),
    clientSelfServiceRescheduleConsumedAt: CanonicalTimestampSchema.optional(),
    archival: BookingArchivalSchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((booking, context) => {
    addRecordChronologyIssue(booking, context);
    validateServicePartySubset(
      booking.party.participantIds,
      booking.occurrence.serviceParty.participantIds,
      context
    );
    validateBookingOriginLifecycleConsistency(booking.attribution, booking.lifecycle, context);

    if (booking.lifecycle.status === 'pending') {
      if (
        compareCanonicalTimestamps(
          booking.lifecycle.reservationExpiresAt,
          booking.createdAt
        ) < 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['lifecycle', 'reservationExpiresAt'],
          message: 'reservationExpiresAt must not precede createdAt',
        });
      }
    }
    if (booking.lifecycle.status === 'pending_cancellation') {
      addEventChronologyIssue(
        booking.lifecycle.requestedAt,
        ['lifecycle', 'requestedAt'],
        booking,
        context
      );
    }
    if (booking.lifecycle.status === 'cancelled') {
      addEventChronologyIssue(
        booking.lifecycle.cancelledAt,
        ['lifecycle', 'cancelledAt'],
        booking,
        context
      );
    }
    if (booking.lifecycle.status === 'completed') {
      addEventChronologyIssue(
        booking.lifecycle.completedAt,
        ['lifecycle', 'completedAt'],
        booking,
        context
      );
    }
    if (booking.lifecycle.status === 'no_show') {
      addEventChronologyIssue(
        booking.lifecycle.noShowAt,
        ['lifecycle', 'noShowAt'],
        booking,
        context
      );
    }
    if (booking.archival) {
      addEventChronologyIssue(booking.archival.deletedAt, ['archival', 'deletedAt'], booking, context);
    }
  });

export type Booking = Readonly<z.output<typeof BookingSchema>>;

const BookingProposalProposedServiceSchema = z
  .object({
    interval: TimeIntervalSchema,
    timeZone: IanaTimeZoneSchema,
  })
  .strict();

const BookingProposalLifecycleSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open') }).strict(),
  z
    .object({
      status: z.literal('accepted'),
      acceptedAt: CanonicalTimestampSchema,
      resultingBookingId: BookingIdSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('declined'),
      declinedAt: CanonicalTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('expired'),
      expiredAt: CanonicalTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      unavailableAt: CanonicalTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      cancelledAt: CanonicalTimestampSchema,
      reasonCode: BookingProposalCancellationReasonCodeSchema,
    })
    .strict(),
]);

export const BookingProposalSchema = z
  .object({
    proposalId: BookingProposalIdSchema,
    participantId: ParticipantIdSchema,
    instructorId: InstructorIdSchema,
    proposedService: BookingProposalProposedServiceSchema,
    lifecycle: BookingProposalLifecycleSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((proposal, context) => {
    addRecordChronologyIssue(proposal, context);
    if (isSyntheticCourseInstructorId(proposal.instructorId)) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'Synthetic course Instructor IDs are not canonical on proposals',
      });
    }

    const lifecycle = proposal.lifecycle;
    if (lifecycle.status === 'accepted') {
      addEventChronologyIssue(lifecycle.acceptedAt, ['lifecycle', 'acceptedAt'], proposal, context);
    }
    if (lifecycle.status === 'declined') {
      addEventChronologyIssue(lifecycle.declinedAt, ['lifecycle', 'declinedAt'], proposal, context);
    }
    if (lifecycle.status === 'expired') {
      addEventChronologyIssue(lifecycle.expiredAt, ['lifecycle', 'expiredAt'], proposal, context);
    }
    if (lifecycle.status === 'unavailable') {
      addEventChronologyIssue(
        lifecycle.unavailableAt,
        ['lifecycle', 'unavailableAt'],
        proposal,
        context
      );
    }
    if (lifecycle.status === 'cancelled') {
      addEventChronologyIssue(
        lifecycle.cancelledAt,
        ['lifecycle', 'cancelledAt'],
        proposal,
        context
      );
    }
  });

export type BookingProposal = Readonly<z.output<typeof BookingProposalSchema>>;

const BookingChangeRequestLifecycleSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open') }).strict(),
  z
    .object({
      status: z.literal('resolved'),
      resolvedAt: CanonicalTimestampSchema,
      resolution: BookingChangeRequestResolutionSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      cancelledAt: CanonicalTimestampSchema,
    })
    .strict(),
]);

export const BookingChangeRequestSchema = z
  .object({
    requestId: BookingChangeRequestIdSchema,
    bookingId: BookingIdSchema,
    requestType: BookingChangeRequestTypeSchema,
    reason: z.string().trim().min(1).max(2_000),
    lifecycle: BookingChangeRequestLifecycleSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((request, context) => {
    addRecordChronologyIssue(request, context);
    const lifecycle = request.lifecycle;
    if (lifecycle.status === 'resolved') {
      addEventChronologyIssue(lifecycle.resolvedAt, ['lifecycle', 'resolvedAt'], request, context);
    }
    if (lifecycle.status === 'cancelled') {
      addEventChronologyIssue(lifecycle.cancelledAt, ['lifecycle', 'cancelledAt'], request, context);
    }
  });

export type BookingChangeRequest = Readonly<z.output<typeof BookingChangeRequestSchema>>;

export function bookingOccurrenceIdentityIsPresent(
  occurrence: Pick<BookingOccurrence, 'occurrenceId'>
): boolean {
  return OccurrenceIdSchema.safeParse(occurrence.occurrenceId).success;
}

export function proposalTargetsExactlyOneParticipant(
  proposal: Pick<BookingProposal, 'participantId'>
): boolean {
  return ParticipantIdSchema.safeParse(proposal.participantId).success;
}

export function changeRequestLifecycleSeparateFromBookingLifecycle(
  changeRequest: Pick<BookingChangeRequest, 'lifecycle'>,
  booking: Pick<Booking, 'lifecycle'>
): boolean {
  return changeRequest.lifecycle.status !== booking.lifecycle.status;
}

export function payerAccountDistinctFromParticipants(
  payerAccountId: AccountId | undefined,
  participantIds: readonly ParticipantId[]
): boolean {
  if (payerAccountId === undefined) return true;
  const payerKey = payerAccountId as string;
  return !participantIds.some((participantId) => (participantId as string) === payerKey);
}

export const LegacyBookingShapeSchema = z
  .object({
    userId: z.unknown().optional(),
    isGuest: z.unknown().optional(),
    date: z.unknown().optional(),
    time: z.unknown().optional(),
    durationHours: z.unknown().optional(),
    duration: z.unknown().optional(),
    courseId: z.unknown().optional(),
    coursePrice: z.unknown().optional(),
    instructorName: z.unknown().optional(),
    instructorAvatar: z.unknown().optional(),
    difficulty: z.unknown().optional(),
    totalPrice: z.unknown().optional(),
    enrollmentId: z.unknown().optional(),
    availableSeats: z.unknown().optional(),
    syntheticInstructorId: z.unknown().optional(),
    booking_course: z.unknown().optional(),
    status: z.unknown().optional(),
    instructorId: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'withdrawn') {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'withdrawn is not a canonical Booking lifecycle status',
      });
    }
    if (typeof value.instructorId === 'string' && isSyntheticCourseInstructorId(value.instructorId)) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'Synthetic course Instructor IDs are not canonical on Bookings',
      });
    }
    for (const field of LEGACY_BOOKING_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Legacy Booking field is not canonical',
        });
      }
    }
  });

export const BookingProposalReservationShapeSchema = z
  .object({
    resourceClaimId: z.unknown().optional(),
    resourceClaimIds: z.unknown().optional(),
    claimId: z.unknown().optional(),
    claimIds: z.unknown().optional(),
    reservationClaimId: z.unknown().optional(),
    reservationExpiresAt: z.unknown().optional(),
    availabilitySlotId: z.unknown().optional(),
    hourLockId: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'BookingProposal must not carry reservation or claim authority',
        });
      }
    }
  });

export const BookingChangeRequestMutationShapeSchema = z
  .object({
    bookingStatus: z.unknown().optional(),
    targetBookingStatus: z.unknown().optional(),
    nextBookingStatus: z.unknown().optional(),
    lifecyclePatch: z.unknown().optional(),
    patchBooking: z.unknown().optional(),
    setStatus: z.unknown().optional(),
    transitionTo: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'BookingChangeRequest must not patch Booking lifecycle directly',
        });
      }
    }
  });
