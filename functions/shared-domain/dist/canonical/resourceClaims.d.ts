import { z } from 'zod';
import { type ResourceClaimId } from './identifiers';
import { TimeIntervalSchema } from './primitives';
export declare const RESOURCE_CLAIM_STRATEGY_VERSION: "claim:v1";
export declare const RESOURCE_GUARD_STRATEGY_VERSION: "guard:v1";
export declare const RESOURCE_GUARD_BUCKET_HOURS: 12;
export declare const RESOURCE_CLAIM_KINDS: readonly ["instructor_booking_occurrence", "participant_booking_occurrence", "instructor_course_day", "participant_course_day_enrollment", "course_seat_pre_start", "administrative_availability_block"];
export type ResourceClaimKind = (typeof RESOURCE_CLAIM_KINDS)[number];
export declare const ADMINISTRATIVE_AVAILABILITY_BLOCK_CLAIM_KIND: "administrative_availability_block";
export declare const RESOURCE_KINDS: readonly ["instructor", "participant", "course", "administrative_block"];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export declare const RESOURCE_OWNER_KINDS: readonly ["booking", "course_enrollment", "course_day", "administrative_block"];
export type ResourceOwnerKind = (typeof RESOURCE_OWNER_KINDS)[number];
export declare const RESOURCE_CLAIM_LIFECYCLE_STATUSES: readonly ["active", "released", "frozen"];
export type ResourceClaimLifecycleStatus = (typeof RESOURCE_CLAIM_LIFECYCLE_STATUSES)[number];
export declare const ResourceClaimIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"claim:v1">;
    claimKind: z.ZodEnum<{
        instructor_booking_occurrence: "instructor_booking_occurrence";
        participant_booking_occurrence: "participant_booking_occurrence";
        instructor_course_day: "instructor_course_day";
        participant_course_day_enrollment: "participant_course_day_enrollment";
        course_seat_pre_start: "course_seat_pre_start";
        administrative_availability_block: "administrative_availability_block";
    }>;
    resourceKind: z.ZodEnum<{
        instructor: "instructor";
        participant: "participant";
        course: "course";
        administrative_block: "administrative_block";
    }>;
    resourceId: z.ZodString;
    ownerKind: z.ZodEnum<{
        booking: "booking";
        course_day: "course_day";
        course_enrollment: "course_enrollment";
        administrative_block: "administrative_block";
    }>;
    ownerId: z.ZodString;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
}, z.core.$strict>;
export type ResourceClaimIdentityInput = z.output<typeof ResourceClaimIdentityInputSchema>;
export declare function resourceClaimIdFromIdentity(input: ResourceClaimIdentityInput): ResourceClaimId;
export declare const ResourceClaimGuardBucketIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"guard:v1">;
    resourceKind: z.ZodEnum<{
        instructor: "instructor";
        participant: "participant";
        course: "course";
        administrative_block: "administrative_block";
    }>;
    resourceId: z.ZodString;
    bucketStartSeconds: z.ZodNumber;
}, z.core.$strict>;
export type ResourceClaimGuardBucketIdentityInput = z.output<typeof ResourceClaimGuardBucketIdentityInputSchema>;
export declare function resourceClaimGuardBucketKeyFromIdentity(input: ResourceClaimGuardBucketIdentityInput): string;
export declare const ResourceClaimOwnerRefSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    ownerKind: z.ZodLiteral<"booking">;
    ownerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
}, z.core.$strict>, z.ZodObject<{
    ownerKind: z.ZodLiteral<"course_enrollment">;
    ownerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
}, z.core.$strict>, z.ZodObject<{
    ownerKind: z.ZodLiteral<"course_day">;
    ownerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
}, z.core.$strict>, z.ZodObject<{
    ownerKind: z.ZodLiteral<"administrative_block">;
    ownerId: z.ZodString;
}, z.core.$strict>], "ownerKind">;
export type ResourceClaimOwnerRef = z.output<typeof ResourceClaimOwnerRefSchema>;
export declare const ResourceClaimResourceRefSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    resourceKind: z.ZodLiteral<"instructor">;
    resourceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
}, z.core.$strict>, z.ZodObject<{
    resourceKind: z.ZodLiteral<"participant">;
    resourceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
}, z.core.$strict>, z.ZodObject<{
    resourceKind: z.ZodLiteral<"course">;
    resourceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
}, z.core.$strict>, z.ZodObject<{
    resourceKind: z.ZodLiteral<"administrative_block">;
    resourceId: z.ZodString;
}, z.core.$strict>], "resourceKind">;
export type ResourceClaimResourceRef = z.output<typeof ResourceClaimResourceRefSchema>;
export declare const ResourceClaimSchema: z.ZodObject<{
    claimId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"resource_claim">, string>>;
    strategyVersion: z.ZodLiteral<"claim:v1">;
    claimKind: z.ZodEnum<{
        instructor_booking_occurrence: "instructor_booking_occurrence";
        participant_booking_occurrence: "participant_booking_occurrence";
        instructor_course_day: "instructor_course_day";
        participant_course_day_enrollment: "participant_course_day_enrollment";
        course_seat_pre_start: "course_seat_pre_start";
        administrative_availability_block: "administrative_availability_block";
    }>;
    resourceKind: z.ZodEnum<{
        instructor: "instructor";
        participant: "participant";
        course: "course";
        administrative_block: "administrative_block";
    }>;
    resourceId: z.ZodString;
    ownerKind: z.ZodEnum<{
        booking: "booking";
        course_day: "course_day";
        course_enrollment: "course_enrollment";
        administrative_block: "administrative_block";
    }>;
    ownerId: z.ZodString;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    interval: z.ZodObject<{
        startsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        endsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"active">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"released">;
        releasedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"frozen">;
        frozenAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type ResourceClaim = Readonly<z.output<typeof ResourceClaimSchema>>;
export declare const ResourceClaimGuardEntrySchema: z.ZodObject<{
    claimId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"resource_claim">, string>>;
    ownerKind: z.ZodEnum<{
        booking: "booking";
        course_day: "course_day";
        course_enrollment: "course_enrollment";
        administrative_block: "administrative_block";
    }>;
    ownerId: z.ZodString;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    interval: z.ZodObject<{
        startsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        endsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    lifecycleStatus: z.ZodEnum<{
        active: "active";
        released: "released";
        frozen: "frozen";
    }>;
}, z.core.$strict>;
export type ResourceClaimGuardEntry = z.output<typeof ResourceClaimGuardEntrySchema>;
export declare const ResourceClaimGuardSchema: z.ZodObject<{
    guardId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"resource_claim_guard">, string>>;
    strategyVersion: z.ZodLiteral<"guard:v1">;
    bucketKey: z.ZodString;
    resourceKind: z.ZodEnum<{
        instructor: "instructor";
        participant: "participant";
        course: "course";
        administrative_block: "administrative_block";
    }>;
    resourceId: z.ZodString;
    bucketStartAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    entries: z.ZodArray<z.ZodObject<{
        claimId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"resource_claim">, string>>;
        ownerKind: z.ZodEnum<{
            booking: "booking";
            course_day: "course_day";
            course_enrollment: "course_enrollment";
            administrative_block: "administrative_block";
        }>;
        ownerId: z.ZodString;
        occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
        interval: z.ZodObject<{
            startsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
            endsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>;
        lifecycleStatus: z.ZodEnum<{
            active: "active";
            released: "released";
            frozen: "frozen";
        }>;
    }, z.core.$strict>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
}, z.core.$strict>;
export type ResourceClaimGuard = Readonly<z.output<typeof ResourceClaimGuardSchema>>;
export declare const LegacyAvailabilityShapeSchema: z.ZodObject<{
    availability_slots: z.ZodOptional<z.ZodUnknown>;
    availability_hour_locks: z.ZodOptional<z.ZodUnknown>;
    hourLock: z.ZodOptional<z.ZodUnknown>;
    availabilitySlot: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare function containsLegacyAvailabilityFields(input: unknown): boolean;
export declare function intervalsConflict(left: z.output<typeof TimeIntervalSchema>, right: z.output<typeof TimeIntervalSchema>): boolean;
export declare function buildResourceClaimIdentityInput(claim: Pick<ResourceClaim, 'claimKind' | 'resourceKind' | 'resourceId' | 'ownerKind' | 'ownerId' | 'occurrenceId'>): z.output<typeof ResourceClaimIdentityInputSchema>;
