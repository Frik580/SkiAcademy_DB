import { z } from 'zod';
import {
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ResourceClaimGuardIdSchema,
  ResourceClaimIdSchema,
} from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  TimeIntervalSchema,
  compareCanonicalTimestamps,
} from './primitives';
import {
  ResourceClaimIdentityInputSchema,
  resourceClaimGuardBucketKeyFromIdentity,
  resourceClaimIdFromIdentity,
  validateDeterministicIdentityInputs,
} from './deterministicIdentity';

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const RESOURCE_CLAIM_STRATEGY_VERSION = 'claim:v1' as const;
export const RESOURCE_GUARD_STRATEGY_VERSION = 'guard:v1' as const;
export const RESOURCE_GUARD_BUCKET_HOURS = 12 as const;

export const RESOURCE_CLAIM_KINDS = [
  'instructor_booking_occurrence',
  'participant_booking_occurrence',
  'instructor_course_day',
  'participant_course_day_enrollment',
  'course_seat_pre_start',
  'administrative_availability_block',
] as const;
export type ResourceClaimKind = (typeof RESOURCE_CLAIM_KINDS)[number];

export const RESOURCE_KINDS = [
  'instructor',
  'participant',
  'course',
  'administrative_block',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_OWNER_KINDS = [
  'booking',
  'course_enrollment',
  'course_day',
  'administrative_block',
] as const;
export type ResourceOwnerKind = (typeof RESOURCE_OWNER_KINDS)[number];

export const RESOURCE_CLAIM_LIFECYCLE_STATUSES = ['active', 'released', 'frozen'] as const;
export type ResourceClaimLifecycleStatus = (typeof RESOURCE_CLAIM_LIFECYCLE_STATUSES)[number];

export const ResourceClaimOwnerRefSchema = z.discriminatedUnion('ownerKind', [
  z.object({ ownerKind: z.literal('booking'), ownerId: BookingIdSchema }).strict(),
  z
    .object({ ownerKind: z.literal('course_enrollment'), ownerId: CourseEnrollmentIdSchema })
    .strict(),
  z
    .object({
      ownerKind: z.literal('course_day'),
      ownerId: CourseDayIdSchema,
      courseId: CourseIdSchema,
    })
    .strict(),
  z
    .object({ ownerKind: z.literal('administrative_block'), ownerId: z.string().min(1).max(128) })
    .strict(),
]);

export type ResourceClaimOwnerRef = z.output<typeof ResourceClaimOwnerRefSchema>;

export const ResourceClaimResourceRefSchema = z.discriminatedUnion('resourceKind', [
  z.object({ resourceKind: z.literal('instructor'), resourceId: InstructorIdSchema }).strict(),
  z.object({ resourceKind: z.literal('participant'), resourceId: ParticipantIdSchema }).strict(),
  z.object({ resourceKind: z.literal('course'), resourceId: CourseIdSchema }).strict(),
  z
    .object({
      resourceKind: z.literal('administrative_block'),
      resourceId: z.string().min(1).max(128),
    })
    .strict(),
]);

export type ResourceClaimResourceRef = z.output<typeof ResourceClaimResourceRefSchema>;

export const ResourceClaimSchema = z
  .object({
    claimId: ResourceClaimIdSchema,
    strategyVersion: z.literal(RESOURCE_CLAIM_STRATEGY_VERSION),
    claimKind: z.enum(RESOURCE_CLAIM_KINDS),
    resourceKind: z.enum(RESOURCE_KINDS),
    resourceId: z.string().min(1).max(128),
    ownerKind: z.enum(RESOURCE_OWNER_KINDS),
    ownerId: z.string().min(1).max(128),
    occurrenceId: OccurrenceIdSchema,
    interval: TimeIntervalSchema,
    lifecycle: z.discriminatedUnion('status', [
      z.object({ status: z.literal('active') }).strict(),
      z
        .object({
          status: z.literal('released'),
          releasedAt: CanonicalTimestampSchema,
        })
        .strict(),
      z
        .object({
          status: z.literal('frozen'),
          frozenAt: CanonicalTimestampSchema,
        })
        .strict(),
    ]),
    revision: PersistedAggregateRevisionSchema,
    correlationId: CorrelationIdSchema,
    lastChangedByCommandId: CommandIdSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((claim, context) => {
    if (compareCanonicalTimestamps(claim.updatedAt, claim.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }

    const expectedClaimId = resourceClaimIdFromIdentity({
      strategyVersion: RESOURCE_CLAIM_STRATEGY_VERSION,
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

    if (
      claim.lifecycle.status === 'released' &&
      (compareCanonicalTimestamps(claim.lifecycle.releasedAt, claim.createdAt) < 0 ||
        compareCanonicalTimestamps(claim.lifecycle.releasedAt, claim.updatedAt) > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lifecycle', 'releasedAt'],
        message: 'releasedAt must fall within record chronology',
      });
    }

    if (
      claim.lifecycle.status === 'frozen' &&
      (compareCanonicalTimestamps(claim.lifecycle.frozenAt, claim.createdAt) < 0 ||
        compareCanonicalTimestamps(claim.lifecycle.frozenAt, claim.updatedAt) > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lifecycle', 'frozenAt'],
        message: 'frozenAt must fall within record chronology',
      });
    }
  });

export type ResourceClaim = Readonly<z.output<typeof ResourceClaimSchema>>;

export const ResourceClaimGuardEntrySchema = z
  .object({
    claimId: ResourceClaimIdSchema,
    ownerKind: z.enum(RESOURCE_OWNER_KINDS),
    ownerId: z.string().min(1).max(128),
    occurrenceId: OccurrenceIdSchema,
    interval: TimeIntervalSchema,
    lifecycleStatus: z.enum(RESOURCE_CLAIM_LIFECYCLE_STATUSES),
  })
  .strict();

export type ResourceClaimGuardEntry = z.output<typeof ResourceClaimGuardEntrySchema>;

export const ResourceClaimGuardSchema = z
  .object({
    guardId: ResourceClaimGuardIdSchema,
    strategyVersion: z.literal(RESOURCE_GUARD_STRATEGY_VERSION),
    bucketKey: z.string().min(1).max(128),
    resourceKind: z.enum(RESOURCE_KINDS),
    resourceId: z.string().min(1).max(128),
    bucketStartAt: CanonicalTimestampSchema,
    entries: z.array(ResourceClaimGuardEntrySchema).max(256),
    revision: PersistedAggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict()
  .superRefine((guard, context) => {
    validateDeterministicIdentityInputs(
      {
        resourceKind: guard.resourceKind,
        resourceId: guard.resourceId,
      },
      context
    );

    const expectedBucketKey = resourceClaimGuardBucketKeyFromIdentity({
      strategyVersion: RESOURCE_GUARD_STRATEGY_VERSION,
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

export type ResourceClaimGuard = Readonly<z.output<typeof ResourceClaimGuardSchema>>;

export const LegacyAvailabilityShapeSchema = z
  .object({
    availability_slots: z.unknown().optional(),
    availability_hour_locks: z.unknown().optional(),
    hourLock: z.unknown().optional(),
    availabilitySlot: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of [
      'availability_slots',
      'availability_hour_locks',
      'hourLock',
      'availabilitySlot',
    ] as const) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Legacy availability representation is not canonical',
        });
      }
    }
  });

export function containsLegacyAvailabilityFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  return ['availability_slots', 'availability_hour_locks', 'hourLock', 'availabilitySlot'].some(
    (field) => record[field] !== undefined
  );
}

export function intervalsConflict(
  left: z.output<typeof TimeIntervalSchema>,
  right: z.output<typeof TimeIntervalSchema>
): boolean {
  return (
    compareCanonicalTimestamps(left.startsAt, right.endsAt) < 0 &&
    compareCanonicalTimestamps(right.startsAt, left.endsAt) < 0
  );
}

export function buildResourceClaimIdentityInput(
  claim: Pick<
    ResourceClaim,
    'claimKind' | 'resourceKind' | 'resourceId' | 'ownerKind' | 'ownerId' | 'occurrenceId'
  >
): z.output<typeof ResourceClaimIdentityInputSchema> {
  return ResourceClaimIdentityInputSchema.parse({
    strategyVersion: RESOURCE_CLAIM_STRATEGY_VERSION,
    claimKind: claim.claimKind,
    resourceKind: claim.resourceKind,
    resourceId: claim.resourceId,
    ownerKind: claim.ownerKind,
    ownerId: claim.ownerId,
    occurrenceId: claim.occurrenceId,
  });
}
