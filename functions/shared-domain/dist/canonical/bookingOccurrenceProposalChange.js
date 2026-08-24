"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingChangeRequestMutationShapeSchema = exports.BookingProposalReservationShapeSchema = exports.LegacyBookingShapeSchema = exports.BookingChangeRequestSchema = exports.BookingProposalSchema = exports.BookingSchema = exports.BookingOccurrenceSchema = exports.BookingServicePartySchema = exports.BookingPartySchema = exports.ImmutableBookingAttributionSchema = exports.CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES = exports.PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES = exports.LEGACY_BOOKING_FIELD_NAMES = exports.BookingChangeRequestResolutionSchema = exports.BookingChangeRequestTypeSchema = exports.BookingChangeRequestStatusSchema = exports.BookingProposalCancellationReasonCodeSchema = exports.BookingProposalStatusSchema = exports.BookingCancellationReasonCodeSchema = exports.BookingLifecycleStatusSchema = exports.BookingPartyKindSchema = exports.BookingOriginSchema = exports.BOOKING_CHANGE_REQUEST_RESOLUTIONS = exports.BOOKING_CHANGE_REQUEST_TYPES = exports.BOOKING_CHANGE_REQUEST_STATUSES = exports.BOOKING_PROPOSAL_CANCELLATION_REASON_CODES = exports.BOOKING_PROPOSAL_STATUSES = exports.BOOKING_CANCELLATION_REASON_CODES = exports.BOOKING_LIFECYCLE_STATUSES = exports.BOOKING_PARTY_MAX = exports.BOOKING_PARTY_MIN = exports.BOOKING_PARTY_KINDS = exports.BOOKING_ORIGINS = void 0;
exports.deriveBookingPartyKind = deriveBookingPartyKind;
exports.isSyntheticCourseInstructorId = isSyntheticCourseInstructorId;
exports.containsLegacyBookingFields = containsLegacyBookingFields;
exports.proposalCarriesNoReservationAuthority = proposalCarriesNoReservationAuthority;
exports.changeRequestCarriesNoDirectBookingMutation = changeRequestCarriesNoDirectBookingMutation;
exports.validateBookingAttribution = validateBookingAttribution;
exports.validateBookingPartyParticipantIds = validateBookingPartyParticipantIds;
exports.validateBookingPartyKindConsistency = validateBookingPartyKindConsistency;
exports.validateServicePartySubset = validateServicePartySubset;
exports.validateBookingOriginLifecycleConsistency = validateBookingOriginLifecycleConsistency;
exports.bookingOccurrenceIdentityIsPresent = bookingOccurrenceIdentityIsPresent;
exports.proposalTargetsExactlyOneParticipant = proposalTargetsExactlyOneParticipant;
exports.changeRequestLifecycleSeparateFromBookingLifecycle = changeRequestLifecycleSeparateFromBookingLifecycle;
exports.payerAccountDistinctFromParticipants = payerAccountDistinctFromParticipants;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const accountParticipantAccess_1 = require("./accountParticipantAccess");
const primitives_1 = require("./primitives");
const PersistedAggregateRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 1, 'Persisted aggregate revision must be at least one');
exports.BOOKING_ORIGINS = ['account', 'guest', 'instructor', 'admin'];
exports.BOOKING_PARTY_KINDS = ['individual', 'family_group'];
exports.BOOKING_PARTY_MIN = 1;
exports.BOOKING_PARTY_MAX = 8;
exports.BOOKING_LIFECYCLE_STATUSES = [
    'pending',
    'confirmed',
    'pending_cancellation',
    'cancelled',
    'completed',
    'no_show',
];
exports.BOOKING_CANCELLATION_REASON_CODES = [
    'reservation_expired',
    'guest_cancelled',
    'account_owner_cancelled',
    'administrator_cancelled',
    'incomplete_payment',
    'booking_change_request',
    'system_expired',
];
exports.BOOKING_PROPOSAL_STATUSES = [
    'open',
    'accepted',
    'declined',
    'expired',
    'unavailable',
    'cancelled',
];
exports.BOOKING_PROPOSAL_CANCELLATION_REASON_CODES = [
    'instructor_withdrawn',
    'instructor_blocked_by_owner',
];
exports.BOOKING_CHANGE_REQUEST_STATUSES = ['open', 'resolved', 'cancelled'];
exports.BOOKING_CHANGE_REQUEST_TYPES = ['instructor_unavailable'];
exports.BOOKING_CHANGE_REQUEST_RESOLUTIONS = [
    'rescheduled',
    'booking_cancelled',
    'no_change',
];
exports.BookingOriginSchema = zod_1.z.enum(exports.BOOKING_ORIGINS);
exports.BookingPartyKindSchema = zod_1.z.enum(exports.BOOKING_PARTY_KINDS);
exports.BookingLifecycleStatusSchema = zod_1.z.enum(exports.BOOKING_LIFECYCLE_STATUSES);
exports.BookingCancellationReasonCodeSchema = zod_1.z.enum(exports.BOOKING_CANCELLATION_REASON_CODES);
exports.BookingProposalStatusSchema = zod_1.z.enum(exports.BOOKING_PROPOSAL_STATUSES);
exports.BookingProposalCancellationReasonCodeSchema = zod_1.z.enum(exports.BOOKING_PROPOSAL_CANCELLATION_REASON_CODES);
exports.BookingChangeRequestStatusSchema = zod_1.z.enum(exports.BOOKING_CHANGE_REQUEST_STATUSES);
exports.BookingChangeRequestTypeSchema = zod_1.z.enum(exports.BOOKING_CHANGE_REQUEST_TYPES);
exports.BookingChangeRequestResolutionSchema = zod_1.z.enum(exports.BOOKING_CHANGE_REQUEST_RESOLUTIONS);
exports.LEGACY_BOOKING_FIELD_NAMES = [
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
];
exports.PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES = [
    'resourceClaimId',
    'resourceClaimIds',
    'claimId',
    'claimIds',
    'reservationClaimId',
    'reservationExpiresAt',
    'availabilitySlotId',
    'hourLockId',
];
exports.CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES = [
    'bookingStatus',
    'targetBookingStatus',
    'nextBookingStatus',
    'lifecyclePatch',
    'patchBooking',
    'setStatus',
    'transitionTo',
];
function addRecordChronologyIssue(record, context) {
    if ((0, primitives_1.compareCanonicalTimestamps)(record.updatedAt, record.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
}
function addEventChronologyIssue(eventAt, path, record, context) {
    if ((0, primitives_1.compareCanonicalTimestamps)(eventAt, record.createdAt) < 0 ||
        (0, primitives_1.compareCanonicalTimestamps)(eventAt, record.updatedAt) > 0) {
        context.addIssue({
            code: 'custom',
            path,
            message: 'Lifecycle timestamp must fall between createdAt and updatedAt',
        });
    }
}
function duplicateParticipantIndexes(participantIds) {
    const firstIndexById = new Map();
    const duplicates = [];
    participantIds.forEach((participantId, index) => {
        if (firstIndexById.has(participantId))
            duplicates.push(index);
        else
            firstIndexById.set(participantId, index);
    });
    return duplicates;
}
function deriveBookingPartyKind(participantCount) {
    return participantCount === 1 ? 'individual' : 'family_group';
}
function isSyntheticCourseInstructorId(value) {
    return value.startsWith('course_');
}
function containsLegacyBookingFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    if (record.status === 'withdrawn')
        return true;
    if (typeof record.instructorId === 'string' && isSyntheticCourseInstructorId(record.instructorId)) {
        return true;
    }
    return exports.LEGACY_BOOKING_FIELD_NAMES.some((field) => record[field] !== undefined);
}
function proposalCarriesNoReservationAuthority(input) {
    if (!input || typeof input !== 'object')
        return true;
    const record = input;
    return !exports.PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES.some((field) => record[field] !== undefined);
}
function changeRequestCarriesNoDirectBookingMutation(input) {
    if (!input || typeof input !== 'object')
        return true;
    const record = input;
    return !exports.CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES.some((field) => record[field] !== undefined);
}
function validateBookingAttribution(attribution, context, basePath = ['attribution']) {
    const add = (path, message) => {
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
function validateBookingPartyParticipantIds(participantIds, context, basePath = ['party', 'participantIds']) {
    if (participantIds.length < exports.BOOKING_PARTY_MIN) {
        context.addIssue({
            code: 'custom',
            path: basePath,
            message: 'Booking party must contain at least one Participant',
        });
    }
    if (participantIds.length > exports.BOOKING_PARTY_MAX) {
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
function validateBookingPartyKindConsistency(party, context, basePath = ['party']) {
    const expectedKind = deriveBookingPartyKind(party.participantIds.length);
    if (party.kind !== expectedKind) {
        context.addIssue({
            code: 'custom',
            path: [...basePath, 'kind'],
            message: 'Booking party kind must match participantIds length',
        });
    }
}
function validateServicePartySubset(partyParticipantIds, serviceParticipantIds, context, basePath = ['occurrence', 'serviceParty', 'participantIds']) {
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
function validateBookingOriginLifecycleConsistency(attribution, lifecycle, context) {
    if (lifecycle.status === 'pending' && attribution.bookingOrigin !== 'guest') {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'status'],
            message: 'Only guest-origin Bookings may be pending',
        });
    }
}
exports.ImmutableBookingAttributionSchema = zod_1.z
    .object({
    bookingOrigin: exports.BookingOriginSchema,
    bookedBy: identifiers_1.ActorRefSchema,
})
    .strict()
    .superRefine((attribution, context) => {
    validateBookingAttribution(attribution, context);
});
exports.BookingPartySchema = zod_1.z
    .object({
    kind: exports.BookingPartyKindSchema,
    participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(exports.BOOKING_PARTY_MIN).max(exports.BOOKING_PARTY_MAX),
})
    .strict()
    .superRefine((party, context) => {
    validateBookingPartyParticipantIds(party.participantIds, context);
    validateBookingPartyKindConsistency(party, context);
});
exports.BookingServicePartySchema = zod_1.z
    .object({
    participantIds: zod_1.z
        .array(identifiers_1.ParticipantIdSchema)
        .min(exports.BOOKING_PARTY_MIN)
        .max(exports.BOOKING_PARTY_MAX),
    frozenAt: primitives_1.CanonicalTimestampSchema.optional(),
})
    .strict()
    .superRefine((serviceParty, context) => {
    validateBookingPartyParticipantIds(serviceParty.participantIds, context, [
        'participantIds',
    ]);
});
exports.BookingOccurrenceSchema = zod_1.z
    .object({
    occurrenceId: identifiers_1.OccurrenceIdSchema,
    instructorId: identifiers_1.InstructorIdSchema,
    interval: primitives_1.TimeIntervalSchema,
    timeZone: primitives_1.IanaTimeZoneSchema,
    scheduleRevision: PersistedAggregateRevisionSchema,
    serviceParty: exports.BookingServicePartySchema,
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
const BookingLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z
        .object({
        status: zod_1.z.literal('pending'),
        reservationExpiresAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z.object({ status: zod_1.z.literal('confirmed') }).strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('pending_cancellation'),
        requestedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('cancelled'),
        cancelledAt: primitives_1.CanonicalTimestampSchema,
        reasonCode: exports.BookingCancellationReasonCodeSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('completed'),
        completedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('no_show'),
        noShowAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
]);
const BookingArchivalSchema = zod_1.z
    .object({
    isDeleted: zod_1.z.literal(true),
    deletedAt: primitives_1.CanonicalTimestampSchema,
})
    .strict();
exports.BookingSchema = zod_1.z
    .object({
    bookingId: identifiers_1.BookingIdSchema,
    attribution: exports.ImmutableBookingAttributionSchema,
    party: exports.BookingPartySchema,
    occurrence: exports.BookingOccurrenceSchema,
    lifecycle: BookingLifecycleSchema,
    paymentId: identifiers_1.PaymentIdSchema,
    payerAccountId: identifiers_1.AccountIdSchema.optional(),
    archival: BookingArchivalSchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
})
    .strict()
    .superRefine((booking, context) => {
    addRecordChronologyIssue(booking, context);
    validateServicePartySubset(booking.party.participantIds, booking.occurrence.serviceParty.participantIds, context);
    validateBookingOriginLifecycleConsistency(booking.attribution, booking.lifecycle, context);
    if (booking.lifecycle.status === 'pending') {
        if ((0, primitives_1.compareCanonicalTimestamps)(booking.lifecycle.reservationExpiresAt, booking.createdAt) < 0) {
            context.addIssue({
                code: 'custom',
                path: ['lifecycle', 'reservationExpiresAt'],
                message: 'reservationExpiresAt must not precede createdAt',
            });
        }
    }
    if (booking.lifecycle.status === 'pending_cancellation') {
        addEventChronologyIssue(booking.lifecycle.requestedAt, ['lifecycle', 'requestedAt'], booking, context);
    }
    if (booking.lifecycle.status === 'cancelled') {
        addEventChronologyIssue(booking.lifecycle.cancelledAt, ['lifecycle', 'cancelledAt'], booking, context);
    }
    if (booking.lifecycle.status === 'completed') {
        addEventChronologyIssue(booking.lifecycle.completedAt, ['lifecycle', 'completedAt'], booking, context);
    }
    if (booking.lifecycle.status === 'no_show') {
        addEventChronologyIssue(booking.lifecycle.noShowAt, ['lifecycle', 'noShowAt'], booking, context);
    }
    if (booking.archival) {
        addEventChronologyIssue(booking.archival.deletedAt, ['archival', 'deletedAt'], booking, context);
    }
});
const BookingProposalProposedServiceSchema = zod_1.z
    .object({
    interval: primitives_1.TimeIntervalSchema,
    timeZone: primitives_1.IanaTimeZoneSchema,
})
    .strict();
const BookingProposalLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z.object({ status: zod_1.z.literal('open') }).strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('accepted'),
        acceptedAt: primitives_1.CanonicalTimestampSchema,
        resultingBookingId: identifiers_1.BookingIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('declined'),
        declinedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('expired'),
        expiredAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('unavailable'),
        unavailableAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('cancelled'),
        cancelledAt: primitives_1.CanonicalTimestampSchema,
        reasonCode: exports.BookingProposalCancellationReasonCodeSchema,
    })
        .strict(),
]);
exports.BookingProposalSchema = zod_1.z
    .object({
    proposalId: identifiers_1.BookingProposalIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    instructorId: identifiers_1.InstructorIdSchema,
    proposedService: BookingProposalProposedServiceSchema,
    lifecycle: BookingProposalLifecycleSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
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
        addEventChronologyIssue(lifecycle.unavailableAt, ['lifecycle', 'unavailableAt'], proposal, context);
    }
    if (lifecycle.status === 'cancelled') {
        addEventChronologyIssue(lifecycle.cancelledAt, ['lifecycle', 'cancelledAt'], proposal, context);
    }
});
const BookingChangeRequestLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z.object({ status: zod_1.z.literal('open') }).strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('resolved'),
        resolvedAt: primitives_1.CanonicalTimestampSchema,
        resolution: exports.BookingChangeRequestResolutionSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('cancelled'),
        cancelledAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
]);
exports.BookingChangeRequestSchema = zod_1.z
    .object({
    requestId: identifiers_1.BookingChangeRequestIdSchema,
    bookingId: identifiers_1.BookingIdSchema,
    requestType: exports.BookingChangeRequestTypeSchema,
    reason: zod_1.z.string().trim().min(1).max(2_000),
    lifecycle: BookingChangeRequestLifecycleSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
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
function bookingOccurrenceIdentityIsPresent(occurrence) {
    return identifiers_1.OccurrenceIdSchema.safeParse(occurrence.occurrenceId).success;
}
function proposalTargetsExactlyOneParticipant(proposal) {
    return identifiers_1.ParticipantIdSchema.safeParse(proposal.participantId).success;
}
function changeRequestLifecycleSeparateFromBookingLifecycle(changeRequest, booking) {
    return changeRequest.lifecycle.status !== booking.lifecycle.status;
}
function payerAccountDistinctFromParticipants(payerAccountId, participantIds) {
    if (payerAccountId === undefined)
        return true;
    const payerKey = payerAccountId;
    return !participantIds.some((participantId) => participantId === payerKey);
}
exports.LegacyBookingShapeSchema = zod_1.z
    .object({
    userId: zod_1.z.unknown().optional(),
    isGuest: zod_1.z.unknown().optional(),
    date: zod_1.z.unknown().optional(),
    time: zod_1.z.unknown().optional(),
    durationHours: zod_1.z.unknown().optional(),
    duration: zod_1.z.unknown().optional(),
    courseId: zod_1.z.unknown().optional(),
    coursePrice: zod_1.z.unknown().optional(),
    instructorName: zod_1.z.unknown().optional(),
    instructorAvatar: zod_1.z.unknown().optional(),
    difficulty: zod_1.z.unknown().optional(),
    totalPrice: zod_1.z.unknown().optional(),
    enrollmentId: zod_1.z.unknown().optional(),
    availableSeats: zod_1.z.unknown().optional(),
    syntheticInstructorId: zod_1.z.unknown().optional(),
    booking_course: zod_1.z.unknown().optional(),
    status: zod_1.z.unknown().optional(),
    instructorId: zod_1.z.unknown().optional(),
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
    for (const field of exports.LEGACY_BOOKING_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'Legacy Booking field is not canonical',
            });
        }
    }
});
exports.BookingProposalReservationShapeSchema = zod_1.z
    .object({
    resourceClaimId: zod_1.z.unknown().optional(),
    resourceClaimIds: zod_1.z.unknown().optional(),
    claimId: zod_1.z.unknown().optional(),
    claimIds: zod_1.z.unknown().optional(),
    reservationClaimId: zod_1.z.unknown().optional(),
    reservationExpiresAt: zod_1.z.unknown().optional(),
    availabilitySlotId: zod_1.z.unknown().optional(),
    hourLockId: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of exports.PROPOSAL_FORBIDDEN_RESERVATION_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'BookingProposal must not carry reservation or claim authority',
            });
        }
    }
});
exports.BookingChangeRequestMutationShapeSchema = zod_1.z
    .object({
    bookingStatus: zod_1.z.unknown().optional(),
    targetBookingStatus: zod_1.z.unknown().optional(),
    nextBookingStatus: zod_1.z.unknown().optional(),
    lifecyclePatch: zod_1.z.unknown().optional(),
    patchBooking: zod_1.z.unknown().optional(),
    setStatus: zod_1.z.unknown().optional(),
    transitionTo: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of exports.CHANGE_REQUEST_FORBIDDEN_BOOKING_MUTATION_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'BookingChangeRequest must not patch Booking lifecycle directly',
            });
        }
    }
});
