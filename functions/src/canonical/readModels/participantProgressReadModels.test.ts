import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  ParticipantProgressReadDeniedError,
  queryParticipantProgressReadModels,
} from './participantProgressReadModels';

const accountId = AccountIdSchema.parse('account_progress_read_01');
const otherAccountId = AccountIdSchema.parse('account_progress_read_02');
const instructorAccountId = AccountIdSchema.parse('account_progress_read_instructor');
const selfParticipantId = ParticipantIdSchema.parse('participant_progress_read_self');
const childParticipantId = ParticipantIdSchema.parse('participant_progress_read_child');
const otherParticipantId = ParticipantIdSchema.parse('participant_progress_read_other');
const selfManagementId = ParticipantManagementIdSchema.parse('management_progress_read_self');
const childManagementId = ParticipantManagementIdSchema.parse('management_progress_read_child');
const otherManagementId = ParticipantManagementIdSchema.parse('management_progress_read_other');
const instructorId = InstructorIdSchema.parse('instructor_progress_read_01');
const relationshipId = instructorRelationshipIdFromPair({
  participantId: selfParticipantId,
  instructorId,
});
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_progress_read_fixture',
    lastChangedByCommandId: 'command_progress_read_fixture',
    correlationId: 'correlation_progress_read_fixture',
  },
};

function createFixtureFirestore(
  options: Readonly<{
    omitProgress?: boolean;
    leftoverUserProgress?: boolean;
  }> = {}
): Firestore {
  const leftoverProgress = options.leftoverUserProgress
    ? {
        level: 3,
        skillScores: { carving: 99 },
        skillComments: { carving: 'Legacy leftover' },
      }
    : {};
  const docs = new Map<string, Record<string, unknown>>([
    [
      `users/${accountId}`,
      { accountId, lifecycle: { status: 'active' }, ...metadata, ...leftoverProgress },
    ],
    [`users/${otherAccountId}`, { accountId: otherAccountId, lifecycle: { status: 'active' }, ...metadata }],
    [
      `users/${instructorAccountId}`,
      { accountId: instructorAccountId, lifecycle: { status: 'active' }, instructorId, ...metadata },
    ],
    [
      `participants/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        displayName: 'Self',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: selfManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${childParticipantId}`,
      {
        participantId: childParticipantId,
        displayName: 'Child',
        age: { kind: 'age_years', years: 8 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: childManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${otherParticipantId}`,
      {
        participantId: otherParticipantId,
        displayName: 'Other',
        age: { kind: 'age_years', years: 22 },
        skillLevel: 'advanced',
        discipline: 'snowboard',
        management: { kind: 'managed', participantManagementId: otherManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participant_management/${selfManagementId}`,
      {
        participantManagementId: selfManagementId,
        accountId,
        participantId: selfParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_management/${childManagementId}`,
      {
        participantManagementId: childManagementId,
        accountId,
        participantId: childParticipantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_management/${otherManagementId}`,
      {
        participantManagementId: otherManagementId,
        accountId: otherAccountId,
        participantId: otherParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_progress/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        level: 3,
        skillScores: { carving: 12 },
        skillComments: { carving: 'Self note' },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: metadata.audit,
      },
    ],
    [
      `participant_progress/${childParticipantId}`,
      {
        participantId: childParticipantId,
        level: 2,
        skillScores: { skating: 6 },
        skillComments: {},
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: metadata.audit,
      },
    ],
    [
      `instructor_relationships/${relationshipId}`,
      {
        instructorRelationshipId: relationshipId,
        participantId: selfParticipantId,
        instructorId,
        basis: {
          kind: 'guardian_permission',
          participantManagementId: selfManagementId,
          grantedByAccountId: accountId,
        },
        validFrom: decidedAt,
        expiresAt: instructorRelationshipExpiresAt(decidedAt),
        status: 'active',
        ...metadata,
      },
    ],
  ]);

  if (options.omitProgress) {
    docs.delete(`participant_progress/${selfParticipantId}`);
    docs.delete(`participant_progress/${childParticipantId}`);
  }

  const documentRef = (path: string) => ({
    get: async () => {
      const data = docs.get(path);
      return {
        exists: data !== undefined,
        data: () => data,
      };
    },
  });

  return {
    getAll: async (...documentRefs: Array<{ get: () => Promise<unknown> }>) =>
      Promise.all(documentRefs.map((documentRefItem) => documentRefItem.get())),
    doc: (path: string) => documentRef(path),
    collection: (name: string) => ({
      doc: (id: string) => documentRef(`${name}/${id}`),
      where: (field: string, _op: string, value: unknown) => ({
        limit: () => ({
          get: async () => ({
            docs: [...docs.entries()]
              .filter(([path]) => path.startsWith(`${name}/`))
              .map(([, data]) => data)
              .filter((data) => data[field] === value)
              .map((data) => ({
                data: () => data,
              })),
          }),
        }),
      }),
    }),
  } as unknown as Firestore;
}

describe('participant progress read models', () => {
  it('returns self Participant progress for the managing Account', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore(),
      { scope: 'managed', participantIds: [selfParticipantId] },
      { accountId }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      participantId: selfParticipantId,
      level: 3,
      skillScores: { carving: 12 },
    });
  });

  it('returns child Participant progress to the guardian Account separately from self', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore(),
      { scope: 'managed' },
      { accountId }
    );
    expect(result.items.map((item) => item.participantId).sort()).toEqual(
      [childParticipantId, selfParticipantId].sort()
    );
    const self = result.items.find((item) => item.participantId === selfParticipantId);
    const child = result.items.find((item) => item.participantId === childParticipantId);
    expect(self?.level).toBe(3);
    expect(child?.level).toBe(2);
    expect(self?.skillScores).not.toEqual(child?.skillScores);
  });

  it('denies an unrelated Account', async () => {
    await expect(
      queryParticipantProgressReadModels(
        createFixtureFirestore(),
        { scope: 'managed', participantIds: [selfParticipantId] },
        { accountId: otherAccountId }
      )
    ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
  });

  it('lets an instructor with relationship authority read only that Participant', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore(),
      { scope: 'instructor', participantIds: [selfParticipantId, childParticipantId] },
      { accountId: instructorAccountId, instructorId }
    );
    expect(result.items.map((item) => item.participantId)).toEqual([selfParticipantId]);
    expect(result.items[0]?.level).toBe(3);
  });

  it('denies an instructor with no authorized Participants', async () => {
    await expect(
      queryParticipantProgressReadModels(
        createFixtureFirestore(),
        { scope: 'instructor', participantIds: [childParticipantId] },
        { accountId: instructorAccountId, instructorId }
      )
    ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
  });

  it('projects missing canonical docs as empty start and ignores leftover /users progress', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore({ omitProgress: true, leftoverUserProgress: true }),
      { scope: 'managed' },
      { accountId }
    );
    const self = result.items.find((item) => item.participantId === selfParticipantId);
    const child = result.items.find((item) => item.participantId === childParticipantId);
    expect(self).toMatchObject({
      participantId: selfParticipantId,
      level: 1,
      skillScores: {},
      skillComments: {},
      revision: 0,
    });
    expect(child).toMatchObject({
      participantId: childParticipantId,
      level: 1,
      skillScores: {},
      skillComments: {},
      revision: 0,
    });
    expect(self?.level).not.toBe(3);
    expect(self?.skillScores).not.toEqual({ carving: 99 });
    expect(child?.skillComments).not.toEqual({ carving: 'Legacy leftover' });
  });
});
