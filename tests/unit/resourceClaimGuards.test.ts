import { describe, expect, it } from 'vitest';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ResourceClaimIdentityInputSchema,
  TimeIntervalSchema,
  expandUtcGuardBuckets,
  estimateGuardMutationBytes,
  findGuardIntervalConflict,
  guardEntryParticipatesInConflict,
  intervalsConflict,
  mergeGuardEntries,
  normalizeFirestoreDocument,
  normalizeFirestoreRecord,
  removeGuardEntryByClaimId,
  resourceClaimGuardIdFromBucketIdentity,
  shouldIgnoreGuardEntry,
  timestampFromDate,
  utcBucketStartSecondsForInstant,
  RESOURCE_GUARD_BUCKET_SECONDS,
  RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET,
  TRANSACTION_SAFETY_BUDGET,
} from '@ski-academy/shared-domain';

const correlationId = CorrelationIdSchema.parse('correlation_guard_test_01');

function interval(startIso: string, endIso: string) {
  return TimeIntervalSchema.parse({
    startsAt: timestampFromDate(new Date(startIso)),
    endsAt: timestampFromDate(new Date(endIso)),
  });
}

describe('exact interval conflict semantics', () => {
  it('treats adjacent half-open intervals as non-conflicting', () => {
    const left = interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z');
    const right = interval('2026-01-15T10:00:00.000Z', '2026-01-15T11:00:00.000Z');
    expect(intervalsConflict(left, right)).toBe(false);
  });

  it('detects partial overlap conflicts', () => {
    const left = interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z');
    const right = interval('2026-01-15T09:59:00.000Z', '2026-01-15T11:00:00.000Z');
    expect(intervalsConflict(left, right)).toBe(true);
  });

  it('detects containment and identical intervals', () => {
    const outer = interval('2026-01-15T08:00:00.000Z', '2026-01-15T12:00:00.000Z');
    const inner = interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z');
    const identical = interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z');
    expect(intervalsConflict(outer, inner)).toBe(true);
    expect(intervalsConflict(inner, identical)).toBe(true);
  });

  it('rejects zero-length intervals via canonical primitives', () => {
    expect(
      TimeIntervalSchema.safeParse({
        startsAt: timestampFromDate(new Date('2026-01-15T09:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-01-15T09:00:00.000Z')),
      }).success
    ).toBe(false);
  });

  it('allows same-bucket non-overlapping intervals', () => {
    const instructorId = InstructorIdSchema.parse('instructor_guard_test_01');
    const first = interval('2026-01-15T04:00:00.000Z', '2026-01-15T05:00:00.000Z');
    const second = interval('2026-01-15T06:00:00.000Z', '2026-01-15T07:00:00.000Z');
    const firstBuckets = expandUtcGuardBuckets('instructor', instructorId, first);
    const secondBuckets = expandUtcGuardBuckets('instructor', instructorId, second);
    expect(firstBuckets[0]?.bucketKey).toBe(secondBuckets[0]?.bucketKey);
    expect(intervalsConflict(first, second)).toBe(false);
  });
});

describe('guard bucket expansion', () => {
  it('expands intervals across every touched 12-hour UTC bucket', () => {
    const instructorId = InstructorIdSchema.parse('instructor_guard_test_02');
    const spanning = interval('2026-01-15T10:00:00.000Z', '2026-01-15T14:00:00.000Z');
    const buckets = expandUtcGuardBuckets('instructor', instructorId, spanning);
    expect(buckets.length).toBe(2);
    expect(buckets[0]?.bucketStartSeconds).toBe(
      utcBucketStartSecondsForInstant(spanning.startsAt.seconds)
    );
    expect(buckets[1]?.bucketStartSeconds).toBe(
      buckets[0]!.bucketStartSeconds + RESOURCE_GUARD_BUCKET_SECONDS
    );
  });

  it('derives stable guard IDs from bucket identity', () => {
    const instructorId = InstructorIdSchema.parse('instructor_guard_test_03');
    const buckets = expandUtcGuardBuckets(
      'instructor',
      instructorId,
      interval('2026-01-15T04:00:00.000Z', '2026-01-15T05:00:00.000Z')
    );
    const guardId = resourceClaimGuardIdFromBucketIdentity(buckets[0]!.bucketIdentity);
    expect(guardId).toBe(resourceClaimGuardIdFromBucketIdentity(buckets[0]!.bucketIdentity));
  });
});

describe('replacement ignore semantics', () => {
  const candidate = interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z');
  const identity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'participant_booking_occurrence',
    resourceKind: 'participant',
    resourceId: ParticipantIdSchema.parse('participant_guard_test_01'),
    ownerKind: 'booking',
    ownerId: 'booking_guard_test_01',
    occurrenceId: OccurrenceIdSchema.parse('occurrence_guard_test_01'),
  });

  it('ignores only the exact replaced claim occurrence', () => {
    const entry = {
      claimId: 'resource_claim_replaced_01',
      ownerKind: 'booking' as const,
      ownerId: 'booking_guard_test_01',
      occurrenceId: identity.occurrenceId,
      interval: candidate,
      lifecycleStatus: 'active' as const,
    };
    const otherParticipantEntry = {
      ...entry,
      claimId: 'resource_claim_other_01',
      ownerId: 'booking_guard_test_02',
      occurrenceId: OccurrenceIdSchema.parse('occurrence_guard_test_02'),
    };

    expect(
      findGuardIntervalConflict(candidate, [entry], {
        ownerKind: entry.ownerKind,
        ownerId: entry.ownerId,
        occurrenceId: entry.occurrenceId,
      })
    ).toBeUndefined();
    expect(
      findGuardIntervalConflict(candidate, [entry, otherParticipantEntry], {
        ownerKind: entry.ownerKind,
        ownerId: entry.ownerId,
        occurrenceId: entry.occurrenceId,
      })
    ).toBe(otherParticipantEntry);
  });

  it('does not ignore a different occurrence for the same owner', () => {
    const entry = {
      claimId: 'resource_claim_owner_01',
      ownerKind: 'booking' as const,
      ownerId: 'booking_guard_test_01',
      occurrenceId: OccurrenceIdSchema.parse('occurrence_guard_test_01'),
      interval: candidate,
      lifecycleStatus: 'active' as const,
    };
    expect(
      shouldIgnoreGuardEntry(entry, {
        ownerKind: 'booking',
        ownerId: 'booking_guard_test_01',
        occurrenceId: OccurrenceIdSchema.parse('occurrence_guard_test_99'),
      })
    ).toBe(false);
  });
});

function guardEntryForCapacityTest(index: number) {
  const startMinute = 4 * 60 + index;
  const startHour = Math.floor(startMinute / 60);
  const startMin = startMinute % 60;
  const endMinute = startMinute + 1;
  const endHour = Math.floor(endMinute / 60);
  const endMin = endMinute % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    claimId: `resource_claim_capacity_${String(index).padStart(3, '0')}`,
    ownerKind: 'booking' as const,
    ownerId: `booking_capacity_${index}`,
    occurrenceId: OccurrenceIdSchema.parse(`occurrence_capacity_${String(index).padStart(3, '0')}`),
    interval: interval(
      `2026-01-15T${pad(startHour)}:${pad(startMin)}:00.000Z`,
      `2026-01-15T${pad(endHour)}:${pad(endMin)}:00.000Z`
    ),
    lifecycleStatus: 'active' as const,
  };
}

describe('guard bucket capacity and planning', () => {
  it('allows exactly RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET entries in one bucket', () => {
    const existing = Array.from({ length: RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET - 1 }, (_, index) =>
      guardEntryForCapacityTest(index)
    );
    const incoming = guardEntryForCapacityTest(RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET - 1);
    expect(mergeGuardEntries(existing, incoming, correlationId)).toHaveLength(
      RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET
    );
  });

  it('rejects guard bucket saturation before writes with operation_too_large', () => {
    const existing = Array.from({ length: RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET }, (_, index) =>
      guardEntryForCapacityTest(index)
    );
    const incoming = guardEntryForCapacityTest(RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET);
    expect(() => mergeGuardEntries(existing, incoming, correlationId)).toThrow(
      expect.objectContaining({ code: 'operation_too_large' })
    );
  });

  it('includes guard occupancy in T07 payload estimates', () => {
    const saturatedBytes = estimateGuardMutationBytes(RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET);
    expect(saturatedBytes).toBe(256 + RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET * 192);
    expect(saturatedBytes).toBeLessThan(TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes);
  });
});

describe('guard entry lifecycle semantics', () => {
  const activeEntry = {
    claimId: 'resource_claim_lifecycle_01',
    ownerKind: 'booking' as const,
    ownerId: 'booking_lifecycle_01',
    occurrenceId: OccurrenceIdSchema.parse('occurrence_lifecycle_01'),
    interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    lifecycleStatus: 'active' as const,
  };

  it('treats frozen entries as conflict participants', () => {
    const frozenEntry = { ...activeEntry, lifecycleStatus: 'frozen' as const };
    expect(guardEntryParticipatesInConflict(frozenEntry)).toBe(true);
    expect(
      findGuardIntervalConflict(
        interval('2026-01-15T09:30:00.000Z', '2026-01-15T10:30:00.000Z'),
        [frozenEntry],
        undefined
      )
    ).toBe(frozenEntry);
  });

  it('ignores released entries for exact interval conflict checks', () => {
    const releasedEntry = { ...activeEntry, lifecycleStatus: 'released' as const };
    expect(guardEntryParticipatesInConflict(releasedEntry)).toBe(false);
    expect(
      findGuardIntervalConflict(
        interval('2026-01-15T09:30:00.000Z', '2026-01-15T10:30:00.000Z'),
        [releasedEntry],
        undefined
      )
    ).toBeUndefined();
  });

  it('removes guard occupancy by claimId on release', () => {
    const secondEntry = {
      ...activeEntry,
      claimId: 'resource_claim_lifecycle_02',
      occurrenceId: OccurrenceIdSchema.parse('occurrence_lifecycle_02'),
      interval: interval('2026-01-15T10:00:00.000Z', '2026-01-15T11:00:00.000Z'),
    };
    expect(removeGuardEntryByClaimId([activeEntry, secondEntry], activeEntry.claimId)).toEqual([
      secondEntry,
    ]);
  });
});

function firestoreTimestamp(date: Date) {
  const millis = date.getTime();
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: (millis % 1000) * 1_000_000,
  };
}

describe('Firestore timestamp normalization', () => {
  it('normalizes Firestore Timestamp instances for canonical Zod parsing', () => {
    const timestamp = firestoreTimestamp(new Date('2026-01-15T05:00:00.000Z'));
    const normalized = normalizeFirestoreRecord(timestamp);
    expect(
      TimeIntervalSchema.safeParse({
        startsAt: timestampFromDate(new Date('2026-01-15T04:00:00.000Z')),
        endsAt: normalized,
      }).success
    ).toBe(true);
  });

  it('preserves exact half-open semantics after normalization', () => {
    const left = {
      startsAt: normalizeFirestoreRecord(firestoreTimestamp(new Date('2026-01-15T09:00:00.000Z'))),
      endsAt: normalizeFirestoreRecord(firestoreTimestamp(new Date('2026-01-15T10:00:00.000Z'))),
    };
    const right = {
      startsAt: normalizeFirestoreRecord(firestoreTimestamp(new Date('2026-01-15T10:00:00.000Z'))),
      endsAt: normalizeFirestoreRecord(firestoreTimestamp(new Date('2026-01-15T11:00:00.000Z'))),
    };
    expect(intervalsConflict(left, right)).toBe(false);
  });

  it('normalizes guard documents read from Firestore-shaped payloads', () => {
    const startsAt = firestoreTimestamp(new Date('2026-01-15T04:00:00.000Z'));
    const endsAt = firestoreTimestamp(new Date('2026-01-15T05:00:00.000Z'));
    const doc = normalizeFirestoreDocument({
      guardId: 'guard_test',
      bucket: { startsAt, endsAt },
      entries: [
        {
          claimId: 'claim_test',
          resourceId: 'instructor_test',
          occurrenceId: 'occurrence_test',
          startsAt,
          endsAt,
        },
      ],
      revision: 1,
    });
    expect(doc?.entries).toHaveLength(1);
    expect(doc?.entries?.[0]?.startsAt).toEqual(startsAt);
  });
});

describe('administrative availability separation', () => {
  it('models administrative availability blocks as schedule claims, not participant blocks', () => {
    const identity = ResourceClaimIdentityInputSchema.parse({
      strategyVersion: 'claim:v1',
      claimKind: 'administrative_availability_block',
      resourceKind: 'administrative_block',
      resourceId: 'admin_block_guard_test_01',
      ownerKind: 'administrative_block',
      ownerId: 'admin_block_guard_test_01',
      occurrenceId: OccurrenceIdSchema.parse('occurrence_admin_block_01'),
    });
    expect(identity.claimKind).toBe('administrative_availability_block');
    expect(identity.resourceKind).toBe('administrative_block');
  });
});

void correlationId;
