"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAvailabilityShapeSchema = exports.ResourceClaimGuardSchema = exports.ResourceClaimGuardEntrySchema = exports.ResourceClaimSchema = exports.ResourceClaimResourceRefSchema = exports.ResourceClaimOwnerRefSchema = exports.ResourceClaimGuardBucketIdentityInputSchema = exports.ResourceClaimIdentityInputSchema = exports.RESOURCE_CLAIM_LIFECYCLE_STATUSES = exports.RESOURCE_OWNER_KINDS = exports.RESOURCE_KINDS = exports.ADMINISTRATIVE_AVAILABILITY_BLOCK_CLAIM_KIND = exports.RESOURCE_CLAIM_KINDS = exports.RESOURCE_GUARD_BUCKET_HOURS = exports.RESOURCE_GUARD_STRATEGY_VERSION = exports.RESOURCE_CLAIM_STRATEGY_VERSION = void 0;
exports.resourceClaimIdFromIdentity = resourceClaimIdFromIdentity;
exports.resourceClaimGuardBucketKeyFromIdentity = resourceClaimGuardBucketKeyFromIdentity;
exports.containsLegacyAvailabilityFields = containsLegacyAvailabilityFields;
exports.intervalsConflict = intervalsConflict;
exports.buildResourceClaimIdentityInput = buildResourceClaimIdentityInput;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const primitives_1 = require("./primitives");
const deterministicIdentity_1 = require("./deterministicIdentity");
const PersistedAggregateRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 1, 'Persisted aggregate revision must be at least one');
exports.RESOURCE_CLAIM_STRATEGY_VERSION = 'claim:v1';
exports.RESOURCE_GUARD_STRATEGY_VERSION = 'guard:v1';
exports.RESOURCE_GUARD_BUCKET_HOURS = 12;
exports.RESOURCE_CLAIM_KINDS = [
    'instructor_booking_occurrence',
    'participant_booking_occurrence',
    'instructor_course_day',
    'participant_course_day_enrollment',
    'course_seat_pre_start',
    'administrative_availability_block',
];
// Administrative schedule unavailability claims (ADR-0002). These are resource-time
// enforcement records and are not T02 ParticipantBlock access-policy records.
exports.ADMINISTRATIVE_AVAILABILITY_BLOCK_CLAIM_KIND = 'administrative_availability_block';
exports.RESOURCE_KINDS = [
    'instructor',
    'participant',
    'course',
    'administrative_block',
];
exports.RESOURCE_OWNER_KINDS = [
    'booking',
    'course_enrollment',
    'course_day',
    'administrative_block',
];
exports.RESOURCE_CLAIM_LIFECYCLE_STATUSES = ['active', 'released', 'frozen'];
const AdministrativeAvailabilityBlockIdSchema = identifiers_1.CanonicalOpaqueIdSchema.describe('Administrative availability block ID');
function validateClaimIdentityRefs(input, context) {
    const resourceIdChecks = {
        instructor: identifiers_1.InstructorIdSchema,
        participant: identifiers_1.ParticipantIdSchema,
        course: identifiers_1.CourseIdSchema,
        administrative_block: AdministrativeAvailabilityBlockIdSchema,
    };
    const ownerIdChecks = {
        booking: identifiers_1.BookingIdSchema,
        course_enrollment: identifiers_1.CourseEnrollmentIdSchema,
        course_day: identifiers_1.CourseDayIdSchema,
        administrative_block: AdministrativeAvailabilityBlockIdSchema,
    };
    if (!resourceIdChecks[input.resourceKind].safeParse(input.resourceId).success) {
        context.addIssue({
            code: 'custom',
            path: ['resourceId'],
            message: 'resourceId must be a canonical ID for the declared resourceKind',
        });
    }
    if (!ownerIdChecks[input.ownerKind].safeParse(input.ownerId).success) {
        context.addIssue({
            code: 'custom',
            path: ['ownerId'],
            message: 'ownerId must be a canonical ID for the declared ownerKind',
        });
    }
}
exports.ResourceClaimIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal(exports.RESOURCE_CLAIM_STRATEGY_VERSION),
    claimKind: zod_1.z.enum(exports.RESOURCE_CLAIM_KINDS),
    resourceKind: zod_1.z.enum(exports.RESOURCE_KINDS),
    resourceId: zod_1.z.string().min(1).max(128),
    ownerKind: zod_1.z.enum(exports.RESOURCE_OWNER_KINDS),
    ownerId: zod_1.z.string().min(1).max(128),
    occurrenceId: identifiers_1.OccurrenceIdSchema,
})
    .strict()
    .superRefine((input, context) => {
    validateClaimIdentityRefs(input, context);
});
function resourceClaimIdFromIdentity(input) {
    const parsed = exports.ResourceClaimIdentityInputSchema.parse(input);
    return identifiers_1.ResourceClaimIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([
        parsed.strategyVersion,
        parsed.claimKind,
        parsed.resourceKind,
        parsed.resourceId,
        parsed.ownerKind,
        parsed.ownerId,
        parsed.occurrenceId,
    ]));
}
exports.ResourceClaimGuardBucketIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal(exports.RESOURCE_GUARD_STRATEGY_VERSION),
    resourceKind: zod_1.z.enum(exports.RESOURCE_KINDS),
    resourceId: zod_1.z.string().min(1).max(128),
    bucketStartSeconds: zod_1.z.number().finite().int().nonnegative(),
})
    .strict()
    .superRefine((input, context) => {
    const resourceIdChecks = {
        instructor: identifiers_1.InstructorIdSchema,
        participant: identifiers_1.ParticipantIdSchema,
        course: identifiers_1.CourseIdSchema,
        administrative_block: AdministrativeAvailabilityBlockIdSchema,
    };
    if (!resourceIdChecks[input.resourceKind].safeParse(input.resourceId).success) {
        context.addIssue({
            code: 'custom',
            path: ['resourceId'],
            message: 'resourceId must be a canonical ID for the declared resourceKind',
        });
    }
});
function resourceClaimGuardBucketKeyFromIdentity(input) {
    const parsed = exports.ResourceClaimGuardBucketIdentityInputSchema.parse(input);
    return (0, deterministicIdentity_1.canonicalDeterministicHash)([
        parsed.strategyVersion,
        parsed.resourceKind,
        parsed.resourceId,
        String(parsed.bucketStartSeconds),
    ]);
}
exports.ResourceClaimOwnerRefSchema = zod_1.z.discriminatedUnion('ownerKind', [
    zod_1.z.object({ ownerKind: zod_1.z.literal('booking'), ownerId: identifiers_1.BookingIdSchema }).strict(),
    zod_1.z
        .object({ ownerKind: zod_1.z.literal('course_enrollment'), ownerId: identifiers_1.CourseEnrollmentIdSchema })
        .strict(),
    zod_1.z
        .object({
        ownerKind: zod_1.z.literal('course_day'),
        ownerId: identifiers_1.CourseDayIdSchema,
        courseId: identifiers_1.CourseIdSchema,
    })
        .strict(),
    zod_1.z
        .object({ ownerKind: zod_1.z.literal('administrative_block'), ownerId: zod_1.z.string().min(1).max(128) })
        .strict(),
]);
exports.ResourceClaimResourceRefSchema = zod_1.z.discriminatedUnion('resourceKind', [
    zod_1.z.object({ resourceKind: zod_1.z.literal('instructor'), resourceId: identifiers_1.InstructorIdSchema }).strict(),
    zod_1.z.object({ resourceKind: zod_1.z.literal('participant'), resourceId: identifiers_1.ParticipantIdSchema }).strict(),
    zod_1.z.object({ resourceKind: zod_1.z.literal('course'), resourceId: identifiers_1.CourseIdSchema }).strict(),
    zod_1.z
        .object({
        resourceKind: zod_1.z.literal('administrative_block'),
        resourceId: zod_1.z.string().min(1).max(128),
    })
        .strict(),
]);
exports.ResourceClaimSchema = zod_1.z
    .object({
    claimId: identifiers_1.ResourceClaimIdSchema,
    strategyVersion: zod_1.z.literal(exports.RESOURCE_CLAIM_STRATEGY_VERSION),
    claimKind: zod_1.z.enum(exports.RESOURCE_CLAIM_KINDS),
    resourceKind: zod_1.z.enum(exports.RESOURCE_KINDS),
    resourceId: zod_1.z.string().min(1).max(128),
    ownerKind: zod_1.z.enum(exports.RESOURCE_OWNER_KINDS),
    ownerId: zod_1.z.string().min(1).max(128),
    occurrenceId: identifiers_1.OccurrenceIdSchema,
    interval: primitives_1.TimeIntervalSchema,
    lifecycle: zod_1.z.discriminatedUnion('status', [
        zod_1.z.object({ status: zod_1.z.literal('active') }).strict(),
        zod_1.z
            .object({
            status: zod_1.z.literal('released'),
            releasedAt: primitives_1.CanonicalTimestampSchema,
        })
            .strict(),
        zod_1.z
            .object({
            status: zod_1.z.literal('frozen'),
            frozenAt: primitives_1.CanonicalTimestampSchema,
        })
            .strict(),
    ]),
    revision: PersistedAggregateRevisionSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    lastChangedByCommandId: identifiers_1.CommandIdSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
})
    .strict()
    .superRefine((claim, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(claim.updatedAt, claim.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
    const expectedClaimId = resourceClaimIdFromIdentity({
        strategyVersion: exports.RESOURCE_CLAIM_STRATEGY_VERSION,
        claimKind: claim.claimKind,
        resourceKind: claim.resourceKind,
        resourceId: claim.resourceId,
        ownerKind: claim.ownerKind,
        ownerId: claim.ownerId,
        occurrenceId: claim.occurrenceId,
    });
    if (claim.claimId !== expectedClaimId) {
        context.addIssue({
            code: 'custom',
            path: ['claimId'],
            message: 'claimId must match deterministic identity inputs',
        });
    }
    validateClaimIdentityRefs(claim, context);
    if (claim.lifecycle.status === 'released' &&
        ((0, primitives_1.compareCanonicalTimestamps)(claim.lifecycle.releasedAt, claim.createdAt) < 0 ||
            (0, primitives_1.compareCanonicalTimestamps)(claim.lifecycle.releasedAt, claim.updatedAt) > 0)) {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'releasedAt'],
            message: 'releasedAt must fall within record chronology',
        });
    }
    if (claim.lifecycle.status === 'frozen' &&
        ((0, primitives_1.compareCanonicalTimestamps)(claim.lifecycle.frozenAt, claim.createdAt) < 0 ||
            (0, primitives_1.compareCanonicalTimestamps)(claim.lifecycle.frozenAt, claim.updatedAt) > 0)) {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'frozenAt'],
            message: 'frozenAt must fall within record chronology',
        });
    }
});
exports.ResourceClaimGuardEntrySchema = zod_1.z
    .object({
    claimId: identifiers_1.ResourceClaimIdSchema,
    ownerKind: zod_1.z.enum(exports.RESOURCE_OWNER_KINDS),
    ownerId: zod_1.z.string().min(1).max(128),
    occurrenceId: identifiers_1.OccurrenceIdSchema,
    interval: primitives_1.TimeIntervalSchema,
    lifecycleStatus: zod_1.z.enum(exports.RESOURCE_CLAIM_LIFECYCLE_STATUSES),
})
    .strict();
exports.ResourceClaimGuardSchema = zod_1.z
    .object({
    guardId: identifiers_1.ResourceClaimGuardIdSchema,
    strategyVersion: zod_1.z.literal(exports.RESOURCE_GUARD_STRATEGY_VERSION),
    bucketKey: zod_1.z.string().min(1).max(128),
    resourceKind: zod_1.z.enum(exports.RESOURCE_KINDS),
    resourceId: zod_1.z.string().min(1).max(128),
    bucketStartAt: primitives_1.CanonicalTimestampSchema,
    entries: zod_1.z.array(exports.ResourceClaimGuardEntrySchema).max(256),
    revision: PersistedAggregateRevisionSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    lastChangedByCommandId: identifiers_1.CommandIdSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
})
    .strict()
    .superRefine((guard, context) => {
    const resourceIdChecks = {
        instructor: identifiers_1.InstructorIdSchema,
        participant: identifiers_1.ParticipantIdSchema,
        course: identifiers_1.CourseIdSchema,
        administrative_block: AdministrativeAvailabilityBlockIdSchema,
    };
    if (!resourceIdChecks[guard.resourceKind].safeParse(guard.resourceId).success) {
        context.addIssue({
            code: 'custom',
            path: ['resourceId'],
            message: 'resourceId must be a canonical ID for the declared resourceKind',
        });
    }
    const expectedBucketKey = resourceClaimGuardBucketKeyFromIdentity({
        strategyVersion: exports.RESOURCE_GUARD_STRATEGY_VERSION,
        resourceKind: guard.resourceKind,
        resourceId: guard.resourceId,
        bucketStartSeconds: guard.bucketStartAt.seconds,
    });
    if (guard.bucketKey !== expectedBucketKey) {
        context.addIssue({
            code: 'custom',
            path: ['bucketKey'],
            message: 'bucketKey must match deterministic guard identity inputs',
        });
    }
});
exports.LegacyAvailabilityShapeSchema = zod_1.z
    .object({
    availability_slots: zod_1.z.unknown().optional(),
    availability_hour_locks: zod_1.z.unknown().optional(),
    hourLock: zod_1.z.unknown().optional(),
    availabilitySlot: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of [
        'availability_slots',
        'availability_hour_locks',
        'hourLock',
        'availabilitySlot',
    ]) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'Legacy availability representation is not canonical',
            });
        }
    }
});
function containsLegacyAvailabilityFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    return ['availability_slots', 'availability_hour_locks', 'hourLock', 'availabilitySlot'].some((field) => record[field] !== undefined);
}
function intervalsConflict(left, right) {
    return ((0, primitives_1.compareCanonicalTimestamps)(left.startsAt, right.endsAt) < 0 &&
        (0, primitives_1.compareCanonicalTimestamps)(right.startsAt, left.endsAt) < 0);
}
function buildResourceClaimIdentityInput(claim) {
    return exports.ResourceClaimIdentityInputSchema.parse({
        strategyVersion: exports.RESOURCE_CLAIM_STRATEGY_VERSION,
        claimKind: claim.claimKind,
        resourceKind: claim.resourceKind,
        resourceId: claim.resourceId,
        ownerKind: claim.ownerKind,
        ownerId: claim.ownerId,
        occurrenceId: claim.occurrenceId,
    });
}
