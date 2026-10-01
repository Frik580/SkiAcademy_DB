import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type CompositeIndexField = {
  fieldPath: string;
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
};

type CompositeIndex = {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: CompositeIndexField[];
};

const firestoreIndexesPath = resolve(process.cwd(), 'firestore.indexes.json');
const firestoreIndexes = JSON.parse(readFileSync(firestoreIndexesPath, 'utf8')) as {
  indexes: CompositeIndex[];
};

function canonicalIndex(index: CompositeIndex): string {
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: index.fields.map((field) => ({
      fieldPath: field.fieldPath,
      ...(field.order !== undefined ? { order: field.order } : {}),
      ...(field.arrayConfig !== undefined ? { arrayConfig: field.arrayConfig } : {}),
    })),
  });
}

function hasExactCompositeIndex(indexes: CompositeIndex[], expected: CompositeIndex): boolean {
  const expectedCanonical = canonicalIndex(expected);
  return indexes.some((index) => canonicalIndex(index) === expectedCanonical);
}

function expectCompositeIndex(indexes: CompositeIndex[], expected: CompositeIndex): void {
  expect(
    hasExactCompositeIndex(indexes, expected),
    `Missing Firestore composite index: ${canonicalIndex(expected)}`
  ).toBe(true);
}

const occupancyDaysIndex: CompositeIndex = {
  collectionGroup: 'days',
  queryScope: 'COLLECTION_GROUP',
  fields: [
    { fieldPath: 'actualInstructorIds', arrayConfig: 'CONTAINS' },
    { fieldPath: 'interval.startsAt.seconds', order: 'ASCENDING' },
  ],
};

const assignmentDaysIndex: CompositeIndex = {
  collectionGroup: 'days',
  queryScope: 'COLLECTION_GROUP',
  fields: [
    { fieldPath: 'actualInstructorIds', arrayConfig: 'CONTAINS' },
    { fieldPath: 'interval.startsAt.seconds', order: 'ASCENDING' },
    { fieldPath: 'interval.startsAt.nanoseconds', order: 'ASCENDING' },
  ],
};

const criticalIndexContracts: Array<{ name: string; index: CompositeIndex }> = [
  {
    name: 'instructor occupancy course days',
    index: occupancyDaysIndex,
  },
  {
    name: 'instructor course assignment day discovery pagination',
    index: assignmentDaysIndex,
  },
  {
    name: 'instructor course assignment roster discovery',
    index: {
      collectionGroup: 'courses',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'instructorRosterIds', arrayConfig: 'CONTAINS' },
        { fieldPath: 'lifecycle', order: 'ASCENDING' },
        { fieldPath: 'title', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'instructor booking occupancy',
    index: {
      collectionGroup: 'bookings',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'occurrence.instructorId', order: 'ASCENDING' },
        { fieldPath: 'occurrence.interval.startsAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox due retries',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'deliverySemantics', order: 'ASCENDING' },
        { fieldPath: 'delivery.nextAttemptAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox pending by creation',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'deliverySemantics', order: 'ASCENDING' },
        { fieldPath: 'createdAt.seconds', order: 'DESCENDING' },
        { fieldPath: 'createdAt.nanoseconds', order: 'DESCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox stale leases',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'deliverySemantics', order: 'ASCENDING' },
        { fieldPath: 'delivery.leaseExpiresAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox non-email due retries',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'deliverySemantics', order: 'ASCENDING' },
        { fieldPath: 'channel', order: 'ASCENDING' },
        { fieldPath: 'delivery.nextAttemptAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox non-email pending by creation',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'deliverySemantics', order: 'ASCENDING' },
        { fieldPath: 'channel', order: 'ASCENDING' },
        { fieldPath: 'createdAt.seconds', order: 'DESCENDING' },
        { fieldPath: 'createdAt.nanoseconds', order: 'DESCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox non-email stale leases',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'deliverySemantics', order: 'ASCENDING' },
        { fieldPath: 'channel', order: 'ASCENDING' },
        { fieldPath: 'delivery.leaseExpiresAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox delivered retention',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'delivery.deliveredAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox dead letter retention',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'delivery.deadLetteredAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
  {
    name: 'domain outbox dead letter visibility',
    index: {
      collectionGroup: 'domain_outbox',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'delivery.status', order: 'ASCENDING' },
        { fieldPath: 'delivery.deadLetteredAt.seconds', order: 'DESCENDING' },
      ],
    },
  },
  {
    name: 'instructor administrative availability blocks',
    index: {
      collectionGroup: 'administrative_availability_blocks',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'instructorId', order: 'ASCENDING' },
        { fieldPath: 'interval.startsAt.seconds', order: 'ASCENDING' },
      ],
    },
  },
];

describe('Firestore composite index contracts', () => {
  it.each(criticalIndexContracts)('includes $name', ({ index }) => {
    expectCompositeIndex(firestoreIndexes.indexes, index);
  });

  it('does not treat the 3-field days index as satisfying the 2-field occupancy contract', () => {
    expect(hasExactCompositeIndex([assignmentDaysIndex], occupancyDaysIndex)).toBe(false);
    expect(hasExactCompositeIndex([assignmentDaysIndex], assignmentDaysIndex)).toBe(true);
    expect(() => expectCompositeIndex([assignmentDaysIndex], occupancyDaysIndex)).toThrow();
  });
});
