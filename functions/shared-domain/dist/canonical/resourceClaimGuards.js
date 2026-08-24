"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActiveCourseEnrollmentGuardSchema = exports.RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET = exports.RESOURCE_CLAIM_PLANNING_ESTIMATES = exports.RESOURCE_GUARD_BUCKET_SECONDS = void 0;
exports.utcBucketStartSecondsForInstant = utcBucketStartSecondsForInstant;
exports.canonicalTimestampForUtcBucketStart = canonicalTimestampForUtcBucketStart;
exports.expandUtcGuardBuckets = expandUtcGuardBuckets;
exports.resourceClaimGuardIdFromBucketKey = resourceClaimGuardIdFromBucketKey;
exports.resourceClaimGuardIdFromBucketIdentity = resourceClaimGuardIdFromBucketIdentity;
exports.guardEntryParticipatesInConflict = guardEntryParticipatesInConflict;
exports.shouldIgnoreGuardEntry = shouldIgnoreGuardEntry;
exports.findGuardIntervalConflict = findGuardIntervalConflict;
exports.conflictErrorCodeForResourceKind = conflictErrorCodeForResourceKind;
exports.estimateGuardMutationBytes = estimateGuardMutationBytes;
exports.assertGuardBucketEntryCapacity = assertGuardBucketEntryCapacity;
exports.mergeGuardEntries = mergeGuardEntries;
exports.removeGuardEntryByClaimId = removeGuardEntryByClaimId;
exports.buildActiveCourseEnrollmentGuard = buildActiveCourseEnrollmentGuard;
exports.assertDistinctActiveCourseEnrollmentGuard = assertDistinctActiveCourseEnrollmentGuard;
exports.activeCourseEnrollmentGuardKeyMatches = activeCourseEnrollmentGuardKeyMatches;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const deterministicIdentity_1 = require("./deterministicIdentity");
const errors_1 = require("./errors");
const primitives_1 = require("./primitives");
const resourceClaims_1 = require("./resourceClaims");
const PersistedAggregateRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 1, 'Persisted aggregate revision must be at least one');
exports.RESOURCE_GUARD_BUCKET_SECONDS = resourceClaims_1.RESOURCE_GUARD_BUCKET_HOURS * 60 * 60;
exports.RESOURCE_CLAIM_PLANNING_ESTIMATES = {
    claimDocumentBytes: 512,
    guardDocumentBaseBytes: 256,
    guardEntryBytes: 192,
    activeEnrollmentGuardBytes: 384,
    activeOwnerGuardBytes: 320,
};
exports.RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET = 256;
function utcBucketStartSecondsForInstant(seconds) {
    if (!Number.isFinite(seconds)) {
        throw new RangeError('seconds must be finite');
    }
    const floored = Math.floor(seconds);
    return Math.floor(floored / exports.RESOURCE_GUARD_BUCKET_SECONDS) * exports.RESOURCE_GUARD_BUCKET_SECONDS;
}
function canonicalTimestampForUtcBucketStart(bucketStartSeconds) {
    return primitives_1.CanonicalTimestampSchema.parse({
        seconds: bucketStartSeconds,
        nanoseconds: 0,
    });
}
function expandUtcGuardBuckets(resourceKind, resourceId, interval) {
    primitives_1.TimeIntervalSchema.parse(interval);
    const buckets = [];
    let bucketStartSeconds = utcBucketStartSecondsForInstant(interval.startsAt.seconds);
    while ((0, primitives_1.compareCanonicalTimestamps)(canonicalTimestampForUtcBucketStart(bucketStartSeconds), interval.endsAt) < 0) {
        const bucketIdentity = resourceClaims_1.ResourceClaimGuardBucketIdentityInputSchema.parse({
            strategyVersion: resourceClaims_1.RESOURCE_GUARD_STRATEGY_VERSION,
            resourceKind,
            resourceId,
            bucketStartSeconds,
        });
        buckets.push({
            bucketStartSeconds,
            bucketStartAt: canonicalTimestampForUtcBucketStart(bucketStartSeconds),
            bucketKey: (0, resourceClaims_1.resourceClaimGuardBucketKeyFromIdentity)(bucketIdentity),
            bucketIdentity,
        });
        bucketStartSeconds += exports.RESOURCE_GUARD_BUCKET_SECONDS;
    }
    return buckets;
}
function resourceClaimGuardIdFromBucketKey(bucketKey) {
    return identifiers_1.ResourceClaimGuardIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)(['resource_claim_guard:v1', bucketKey]));
}
function resourceClaimGuardIdFromBucketIdentity(input) {
    const bucketKey = (0, resourceClaims_1.resourceClaimGuardBucketKeyFromIdentity)(input);
    return resourceClaimGuardIdFromBucketKey(bucketKey);
}
function guardEntryParticipatesInConflict(entry) {
    return entry.lifecycleStatus === 'active' || entry.lifecycleStatus === 'frozen';
}
function shouldIgnoreGuardEntry(entry, ignore) {
    if (!ignore) {
        return false;
    }
    if (ignore.claimId !== undefined && entry.claimId === ignore.claimId) {
        return true;
    }
    if (ignore.ownerKind !== undefined &&
        ignore.ownerId !== undefined &&
        ignore.occurrenceId !== undefined &&
        entry.ownerKind === ignore.ownerKind &&
        entry.ownerId === ignore.ownerId &&
        entry.occurrenceId === ignore.occurrenceId) {
        return true;
    }
    return false;
}
function findGuardIntervalConflict(candidate, entries, ignore) {
    primitives_1.TimeIntervalSchema.parse(candidate);
    for (const entry of entries) {
        if (!guardEntryParticipatesInConflict(entry)) {
            continue;
        }
        if (shouldIgnoreGuardEntry(entry, ignore)) {
            continue;
        }
        if ((0, resourceClaims_1.intervalsConflict)(candidate, entry.interval)) {
            return entry;
        }
    }
    return undefined;
}
function conflictErrorCodeForResourceKind(resourceKind) {
    if (resourceKind === 'instructor') {
        return 'instructor_conflict';
    }
    if (resourceKind === 'participant') {
        return 'participant_conflict';
    }
    return 'resource_conflict';
}
function estimateGuardMutationBytes(entryCount) {
    return (exports.RESOURCE_CLAIM_PLANNING_ESTIMATES.guardDocumentBaseBytes +
        entryCount * exports.RESOURCE_CLAIM_PLANNING_ESTIMATES.guardEntryBytes);
}
function assertGuardBucketEntryCapacity(correlationId, entryCount) {
    if (entryCount > exports.RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET) {
        throw new errors_1.CanonicalCommandError('operation_too_large', {
            correlationId,
            details: { reason: 'out_of_range' },
        });
    }
}
function mergeGuardEntries(existing, incoming, correlationId) {
    const withoutIncoming = existing.filter((entry) => entry.claimId !== incoming.claimId);
    const merged = [...withoutIncoming, incoming];
    assertGuardBucketEntryCapacity(correlationId, merged.length);
    return merged;
}
function removeGuardEntryByClaimId(existing, claimId) {
    return existing.filter((entry) => entry.claimId !== claimId);
}
exports.ActiveCourseEnrollmentGuardSchema = zod_1.z
    .object({
    guardKey: zod_1.z.string(),
    participantId: identifiers_1.ParticipantIdSchema,
    courseId: identifiers_1.CourseIdSchema,
    courseEnrollmentId: identifiers_1.CourseEnrollmentIdSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    lastChangedByCommandId: identifiers_1.CommandIdSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
})
    .strict()
    .superRefine((guard, context) => {
    const expectedKey = (0, identifiers_1.activeCourseEnrollmentGuardKey)(guard.participantId, guard.courseId);
    if (guard.guardKey !== expectedKey) {
        context.addIssue({
            code: 'custom',
            path: ['guardKey'],
            message: 'guardKey must match deterministic participant and course inputs',
        });
    }
    if ((0, primitives_1.compareCanonicalTimestamps)(guard.updatedAt, guard.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
});
function buildActiveCourseEnrollmentGuard(input) {
    const guardKey = (0, identifiers_1.activeCourseEnrollmentGuardKey)(input.participantId, input.courseId);
    return exports.ActiveCourseEnrollmentGuardSchema.parse({
        guardKey,
        participantId: input.participantId,
        courseId: input.courseId,
        courseEnrollmentId: input.courseEnrollmentId,
        revision: input.revision,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        lastChangedByCommandId: input.lastChangedByCommandId,
        correlationId: input.correlationId,
    });
}
function assertDistinctActiveCourseEnrollmentGuard(correlationId, existing, expectedEnrollmentId) {
    if (existing === undefined) {
        return;
    }
    if (existing.courseEnrollmentId === expectedEnrollmentId) {
        return;
    }
    throw new errors_1.CanonicalCommandError('duplicate_active_enrollment', { correlationId });
}
function activeCourseEnrollmentGuardKeyMatches(guardKey, participantId, courseId) {
    return guardKey === (0, identifiers_1.activeCourseEnrollmentGuardKey)(participantId, courseId);
}
