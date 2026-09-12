import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  ParticipantAchievementsReadDeniedError,
  queryParticipantAchievementsReadModels,
} from './participantAchievementsReadModels';

const accountId = AccountIdSchema.parse('account_achievements_read_01');
const otherAccountId = AccountIdSchema.parse('account_achievements_read_02');
const selfParticipantId = ParticipantIdSchema.parse('participant_achievements_read_self');
const childParticipantId = ParticipantIdSchema.parse('participant_achievements_read_child');
const otherParticipantId = ParticipantIdSchema.parse('participant_achievements_read_other');
const selfManagementId = ParticipantManagementIdSchema.parse('management_achievements_read_self');
const childManagementId = ParticipantManagementIdSchema.parse('management_achievements_read_child');
const otherManagementId = ParticipantManagementIdSchema.parse('management_achievements_read_other');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const earnedAt = timestampFromDate(new Date('2026-01-10T12:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_achievements_read_fixture',
    lastChangedByCommandId: 'command_achievements_read_fixture',
    correlationId: 'correlation_achievements_read_fixture',
  },
};

function createFixtureFirestore(
  options: Readonly<{ omitAchievements?: boolean }> = {}
): Firestore {
  const docs = new Map<string, Record<string, unknown>>([
    [`users/${accountId}`, { accountId, lifecycle: { status: 'active' }, ...metadata }],
    [
      `users/${otherAccountId}`,
      { accountId: otherAccountId, lifecycle: { status: 'active' }, ...metadata },
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
      `participant_achievements/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        earned: {
          first_lesson: { earnedAt, source: 'participant_attendance' },
        },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: metadata.audit,
      },
    ],
    [
      `participant_achievements/${childParticipantId}`,
      {
        participantId: childParticipantId,
        earned: {
          homework_done: { earnedAt, source: 'participant_lesson_feedback' },
        },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: metadata.audit,
      },
    ],
  ]);

  if (options.omitAchievements) {
    docs.delete(`participant_achievements/${selfParticipantId}`);
    docs.delete(`participant_achievements/${childParticipantId}`);
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

describe('participant achievements read models', () => {
  it('returns self Participant achievements for the managing Account', async () => {
    const result = await queryParticipantAchievementsReadModels(
      createFixtureFirestore(),
      { scope: 'managed', participantIds: [selfParticipantId] },
      { accountId }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      participantId: selfParticipantId,
      revision: 2,
      earned: { first_lesson: { source: 'participant_attendance' } },
    });
  });

  it('keeps child achievements separate from self', async () => {
    const result = await queryParticipantAchievementsReadModels(
      createFixtureFirestore(),
      { scope: 'managed' },
      { accountId }
    );
    const self = result.items.find((item) => item.participantId === selfParticipantId);
    const child = result.items.find((item) => item.participantId === childParticipantId);
    expect(self?.earned.first_lesson).toBeDefined();
    expect(child?.earned.homework_done).toBeDefined();
    expect(self?.earned.homework_done).toBeUndefined();
    expect(child?.earned.first_lesson).toBeUndefined();
  });

  it('denies an unrelated Account', async () => {
    await expect(
      queryParticipantAchievementsReadModels(
        createFixtureFirestore(),
        { scope: 'managed', participantIds: [selfParticipantId] },
        { accountId: otherAccountId }
      )
    ).rejects.toBeInstanceOf(ParticipantAchievementsReadDeniedError);
  });

  it('projects missing canonical docs as empty and does not invent account-wide badges', async () => {
    const result = await queryParticipantAchievementsReadModels(
      createFixtureFirestore({ omitAchievements: true }),
      { scope: 'managed' },
      { accountId }
    );
    for (const item of result.items) {
      expect(item.earned).toEqual({});
      expect(item.revision).toBe(0);
    }
  });
});
