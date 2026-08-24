import { z } from 'zod';
import { CommandIdSchema, CorrelationIdSchema, type CourseEnrollmentId, type CourseId, type ParticipantId, type ResourceClaimGuardId, type ResourceClaimId, type ActiveCourseEnrollmentGuardKey } from './identifiers';
import { type CanonicalTimestamp, type TimeInterval } from './primitives';
import { ResourceClaimGuardBucketIdentityInputSchema, type ResourceClaimGuardEntry, type ResourceClaimGuardBucketIdentityInput, type ResourceKind } from './resourceClaims';
export declare const RESOURCE_GUARD_BUCKET_SECONDS: number;
export declare const RESOURCE_CLAIM_PLANNING_ESTIMATES: {
    readonly claimDocumentBytes: 512;
    readonly guardDocumentBaseBytes: 256;
    readonly guardEntryBytes: 192;
    readonly activeEnrollmentGuardBytes: 384;
    readonly activeOwnerGuardBytes: 320;
};
export declare const RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET: 256;
export interface ResourceClaimReplacementIgnore {
    readonly claimId?: ResourceClaimId;
    readonly ownerKind?: ResourceClaimGuardEntry['ownerKind'];
    readonly ownerId?: string;
    readonly occurrenceId?: ResourceClaimGuardEntry['occurrenceId'];
}
export interface UtcGuardBucket {
    readonly bucketStartSeconds: number;
    readonly bucketStartAt: CanonicalTimestamp;
    readonly bucketKey: string;
    readonly bucketIdentity: z.output<typeof ResourceClaimGuardBucketIdentityInputSchema>;
}
export declare function utcBucketStartSecondsForInstant(seconds: number): number;
export declare function canonicalTimestampForUtcBucketStart(bucketStartSeconds: number): CanonicalTimestamp;
export declare function expandUtcGuardBuckets(resourceKind: ResourceKind, resourceId: string, interval: TimeInterval): readonly UtcGuardBucket[];
export declare function resourceClaimGuardIdFromBucketKey(bucketKey: string): ResourceClaimGuardId;
export declare function resourceClaimGuardIdFromBucketIdentity(input: ResourceClaimGuardBucketIdentityInput): ResourceClaimGuardId;
export declare function guardEntryParticipatesInConflict(entry: ResourceClaimGuardEntry): boolean;
export declare function shouldIgnoreGuardEntry(entry: ResourceClaimGuardEntry, ignore: ResourceClaimReplacementIgnore | undefined): boolean;
export declare function findGuardIntervalConflict(candidate: TimeInterval, entries: readonly ResourceClaimGuardEntry[], ignore: ResourceClaimReplacementIgnore | undefined): ResourceClaimGuardEntry | undefined;
export declare function conflictErrorCodeForResourceKind(resourceKind: ResourceKind): 'instructor_conflict' | 'participant_conflict' | 'resource_conflict';
export declare function estimateGuardMutationBytes(entryCount: number): number;
export declare function mergeGuardEntries(existing: readonly ResourceClaimGuardEntry[], incoming: ResourceClaimGuardEntry): ResourceClaimGuardEntry[];
export declare function removeGuardEntryByClaimId(existing: readonly ResourceClaimGuardEntry[], claimId: ResourceClaimId): ResourceClaimGuardEntry[];
export declare const ActiveCourseEnrollmentGuardSchema: z.ZodObject<{
    guardKey: z.ZodString;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    courseEnrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
}, z.core.$strict>;
export type ActiveCourseEnrollmentGuard = Readonly<z.output<typeof ActiveCourseEnrollmentGuardSchema>>;
export declare function buildActiveCourseEnrollmentGuard(input: {
    readonly participantId: ParticipantId;
    readonly courseId: CourseId;
    readonly courseEnrollmentId: CourseEnrollmentId;
    readonly revision: number;
    readonly createdAt: CanonicalTimestamp;
    readonly updatedAt: CanonicalTimestamp;
    readonly lastChangedByCommandId: z.output<typeof CommandIdSchema>;
    readonly correlationId: z.output<typeof CorrelationIdSchema>;
}): ActiveCourseEnrollmentGuard;
export declare function assertDistinctActiveCourseEnrollmentGuard(correlationId: z.output<typeof CorrelationIdSchema>, existing: ActiveCourseEnrollmentGuard | undefined, expectedEnrollmentId: CourseEnrollmentId): void;
export declare function activeCourseEnrollmentGuardKeyMatches(guardKey: ActiveCourseEnrollmentGuardKey, participantId: ParticipantId, courseId: CourseId): boolean;
