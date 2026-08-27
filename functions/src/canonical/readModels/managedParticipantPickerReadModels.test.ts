import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  QueryManagedParticipantPickerReadModelsInputSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { queryManagedParticipantPickerReadModels } from './managedParticipantPickerReadModels';

const accountId = AccountIdSchema.parse('account_picker_owner_01');
const otherAccountId = AccountIdSchema.parse('account_picker_other_01');
const participantId = ParticipantIdSchema.parse('participant_picker_01');
const otherParticipantId = ParticipantIdSchema.parse('participant_picker_02');
const managementId = ParticipantManagementIdSchema.parse('management_picker_01');
const otherManagementId = ParticipantManagementIdSchema.parse('management_picker_02');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_picker_fixture',
    lastChangedByCommandId: 'command_picker_fixture',
    correlationId: 'correlation_picker_fixture',
  },
};

function createFixtureFirestore(): Firestore {
  const docs = new Map<string, Record<string, unknown>>([
    [
      `users/${accountId}`,
      {
        accountId,
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `users/${otherAccountId}`,
      {
        accountId: otherAccountId,
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participant_management/${managementId}`,
      {
        participantManagementId: managementId,
        accountId,
        participantId,
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
      `participants/${participantId}`,
      {
        participantId,
        displayName: 'Picker Child',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${otherParticipantId}`,
      {
        participantId: otherParticipantId,
        displayName: 'Other Account Participant',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'advanced',
        discipline: 'snowboard',
        management: { kind: 'managed', participantManagementId: otherManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
  ]);

  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = docs.get(`${name}/${id}`);
          return {
            exists: data !== undefined,
            data: () => data,
          };
        },
      }),
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

describe('managed participant picker read models', () => {
  it('accepts callable transport idempotency keys on the read-model input seam', () => {
    const parsed = QueryManagedParticipantPickerReadModelsInputSchema.safeParse({
      idempotencyKey: 'read:managed_participant_picker',
    });
    expect(parsed.success).toBe(true);
  });

  it('returns only participants managed by the authenticated account', async () => {
    const result = await queryManagedParticipantPickerReadModels(
      createFixtureFirestore(),
      accountId
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      participantId,
      displayName: 'Picker Child',
      discipline: 'ski',
      skillLevel: 'beginner',
      age: { kind: 'age_years', years: 12 },
      authority: 'parent_guardian',
    });
  });

  it('does not enumerate another account managed participants', async () => {
    const result = await queryManagedParticipantPickerReadModels(
      createFixtureFirestore(),
      otherAccountId
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.participantId).toBe(otherParticipantId);
    expect(result.items.some((item) => item.participantId === participantId)).toBe(false);
  });
});
