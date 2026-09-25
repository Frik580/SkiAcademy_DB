import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  TestSessionIdSchema,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
  testCanonicalReadScope,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { queryParticipantInstructorAccessReadModels } from './participantInstructorAccessReadModels';

const accountId = AccountIdSchema.parse('account_pia_01');
const otherAccountId = AccountIdSchema.parse('account_pia_02');
const instructorAccountId = AccountIdSchema.parse('account_pia_instructor_01');
const participantId = ParticipantIdSchema.parse('participant_pia_01');
const siblingParticipantId = ParticipantIdSchema.parse('participant_pia_02');
const thirdParticipantId = ParticipantIdSchema.parse('participant_pia_03');
const unmanagedParticipantId = ParticipantIdSchema.parse('participant_pia_unmanaged');
const managementId = ParticipantManagementIdSchema.parse('management_pia_01');
const siblingManagementId = ParticipantManagementIdSchema.parse('management_pia_02');
const thirdManagementId = ParticipantManagementIdSchema.parse('management_pia_03');
const instructorId = InstructorIdSchema.parse('instructor_pia_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_pia_02');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const expiresAt = timestampFromDate(new Date('2027-01-01T00:00:00.000Z'));
const now = new Date('2026-06-01T00:00:00.000Z');

const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_pia_fixture',
    lastChangedByCommandId: 'command_pia_fixture',
    correlationId: 'correlation_pia_fixture',
  },
};

type SeedOptions = Readonly<{
  readonly extraDocs?: ReadonlyArray<readonly [string, Record<string, unknown>]>;
  readonly relationshipStatus?: 'active' | 'revoked' | 'expired' | 'absent';
  readonly managerBlockStatus?: 'active' | 'removed' | 'absent';
  readonly instructorBlockStatus?: 'active' | 'removed' | 'absent';
  readonly includeSiblingParticipants?: boolean;
  readonly includeThirdParticipant?: boolean;
  readonly endedManagementHistoryCount?: number;
  readonly omitTargetManagement?: boolean;
  readonly endTargetManagement?: boolean;
  readonly omitParticipant?: boolean;
  readonly omitInstructor?: boolean;
  readonly inactiveAccount?: boolean;
}>;

function createAccessFirestore(options: SeedOptions = {}): {
  readonly firestore: Firestore;
  readonly reads: Map<string, number>;
} {
  const docs = new Map<string, Record<string, unknown>>();
  const reads = new Map<string, number>();

  const recordRead = (key: string) => {
    reads.set(key, (reads.get(key) ?? 0) + 1);
  };

  const seed = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
  };

  seed(`users/${accountId}`, {
    accountId,
    lifecycle: options.inactiveAccount
      ? { status: 'disabled', disabledAt: decidedAt }
      : { status: 'active' },
    ...metadata,
  });
  seed(`users/${otherAccountId}`, {
    accountId: otherAccountId,
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`users/${instructorAccountId}`, {
    accountId: instructorAccountId,
    lifecycle: { status: 'active' },
    instructorId,
    isInstructor: true,
    ...metadata,
  });

  if (!options.omitTargetManagement) {
    seed(`participant_management/${managementId}`, {
      participantManagementId: managementId,
      accountId,
      participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: options.endTargetManagement ? 'ended' : 'active',
      ...(options.endTargetManagement ? { endedAt: decidedAt } : {}),
      ...metadata,
    });
  }

  if (!options.omitParticipant) {
    seed(`participants/${participantId}`, {
      participantId,
      displayName: 'PIA Student',
      age: { kind: 'age_years', years: 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
      ...metadata,
    });
  }

  if (options.includeSiblingParticipants !== false) {
    seed(`participant_management/${siblingManagementId}`, {
      participantManagementId: siblingManagementId,
      accountId,
      participantId: siblingParticipantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    seed(`participants/${siblingParticipantId}`, {
      participantId: siblingParticipantId,
      displayName: 'PIA Sibling',
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: siblingManagementId },
      lifecycle: { status: 'active' },
      ...metadata,
    });
  }

  if (options.includeThirdParticipant) {
    seed(`participant_management/${thirdManagementId}`, {
      participantManagementId: thirdManagementId,
      accountId,
      participantId: thirdParticipantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    seed(`participants/${thirdParticipantId}`, {
      participantId: thirdParticipantId,
      displayName: 'PIA Third',
      age: { kind: 'age_years', years: 8 },
      skillLevel: 'beginner',
      discipline: 'snowboard',
      management: { kind: 'managed', participantManagementId: thirdManagementId },
      lifecycle: { status: 'active' },
      ...metadata,
    });
  }

  seed(`participants/${unmanagedParticipantId}`, {
    participantId: unmanagedParticipantId,
    displayName: 'Unmanaged',
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'advanced',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    ...metadata,
  });

  if (!options.omitInstructor) {
    seed(`instructors/${instructorId}`, {
      id: instructorId,
      name: 'PIA Instructor',
      pricePerHourKZT: 10_000,
      isAvailable: true,
    });
  }
  seed(`instructors/${otherInstructorId}`, {
    id: otherInstructorId,
    name: 'Other Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });

  const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
  if (options.relationshipStatus === 'active' || options.relationshipStatus === undefined) {
    seed(`instructor_relationships/${relationshipId}`, {
      instructorRelationshipId: relationshipId,
      participantId,
      instructorId,
      basis: {
        kind: 'guardian_permission',
        participantManagementId: managementId,
        grantedByAccountId: accountId,
      },
      validFrom: decidedAt,
      expiresAt,
      status: 'active',
      ...metadata,
    });
  } else if (options.relationshipStatus === 'revoked') {
    seed(`instructor_relationships/${relationshipId}`, {
      instructorRelationshipId: relationshipId,
      participantId,
      instructorId,
      basis: {
        kind: 'guardian_permission',
        participantManagementId: managementId,
        grantedByAccountId: accountId,
      },
      validFrom: decidedAt,
      expiresAt,
      status: 'revoked',
      revokedAt: decidedAt,
      revokedBy: {
        kind: 'participant_manager',
        accountId,
        participantManagementId: managementId,
      },
      ...metadata,
    });
  } else if (options.relationshipStatus === 'expired') {
    seed(`instructor_relationships/${relationshipId}`, {
      instructorRelationshipId: relationshipId,
      participantId,
      instructorId,
      basis: {
        kind: 'guardian_permission',
        participantManagementId: managementId,
        grantedByAccountId: accountId,
      },
      validFrom: decidedAt,
      expiresAt,
      status: 'expired',
      expiredAt: expiresAt,
      revision: 1,
      createdAt: decidedAt,
      updatedAt: expiresAt,
      audit: metadata.audit,
    });
  }

  const managerBlockId = participantBlockIdFromDirection({
    participantId,
    instructorId,
    createdByKind: 'participant_manager',
  });
  const managerCreatedBy = {
    kind: 'participant_manager' as const,
    accountId,
    participantManagementId: managementId,
  };
  if (options.managerBlockStatus === 'active') {
    seed(`participant_blocks/${managerBlockId}`, {
      participantBlockId: managerBlockId,
      participantId,
      instructorId,
      createdBy: managerCreatedBy,
      reason: 'Manager block reason',
      status: 'active',
      ...metadata,
    });
  } else if (options.managerBlockStatus === 'removed') {
    seed(`participant_blocks/${managerBlockId}`, {
      participantBlockId: managerBlockId,
      participantId,
      instructorId,
      createdBy: managerCreatedBy,
      reason: 'Manager block reason',
      status: 'removed',
      removedAt: decidedAt,
      removedBy: managerCreatedBy,
      ...metadata,
    });
  }

  const instructorBlockId = participantBlockIdFromDirection({
    participantId,
    instructorId,
    createdByKind: 'instructor',
  });
  const instructorCreatedBy = {
    kind: 'instructor' as const,
    instructorId,
  };
  if (options.instructorBlockStatus === 'active') {
    seed(`participant_blocks/${instructorBlockId}`, {
      participantBlockId: instructorBlockId,
      participantId,
      instructorId,
      createdBy: instructorCreatedBy,
      reason: 'Instructor block reason',
      status: 'active',
      ...metadata,
    });
  } else if (options.instructorBlockStatus === 'removed') {
    seed(`participant_blocks/${instructorBlockId}`, {
      participantBlockId: instructorBlockId,
      participantId,
      instructorId,
      createdBy: instructorCreatedBy,
      reason: 'Instructor block reason',
      status: 'removed',
      removedAt: decidedAt,
      removedBy: instructorCreatedBy,
      ...metadata,
    });
  }

  const historyCount = options.endedManagementHistoryCount ?? 0;
  for (let index = 0; index < historyCount; index += 1) {
    const historyId = ParticipantManagementIdSchema.parse(
      `management_pia_history_${String(index).padStart(3, '0')}`
    );
    seed(`participant_management/${historyId}`, {
      participantManagementId: historyId,
      accountId,
      participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'ended',
      endedAt: decidedAt,
      ...metadata,
      revision: index + 2,
    });
  }

  for (const [path, data] of options.extraDocs ?? []) {
    seed(path, data);
  }

  const getNestedField = (data: Record<string, unknown>, field: string): unknown => {
    if (field in data) {
      return data[field];
    }
    const parts = field.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  const getDoc = async (path: string) => {
    recordRead(`doc:${path}`);
    const data = docs.get(path);
    return {
      exists: data !== undefined,
      data: () => data,
    };
  };

  type FixtureDocument = { id: string; data: Record<string, unknown> };
  const query = (
    collectionName: string,
    documents: readonly FixtureDocument[],
    maximum?: number
  ): Record<string, unknown> => ({
    where: (field: string, op: string, value: unknown) => {
      if (op !== '==') {
        throw new Error(`Unsupported fixture operator: ${op}`);
      }
      return query(
        collectionName,
        documents.filter(({ data }) => getNestedField(data, field) === value),
        maximum
      );
    },
    limit: (value: number) => query(collectionName, documents, value),
    get: async () => {
      const selected = documents.slice(0, maximum);
      recordRead(`query:${collectionName}:${selected.length}`);
      for (const document of selected) {
        recordRead(`doc:${collectionName}/${document.id}`);
      }
      return {
        docs: selected.map(({ id, data }) => ({ id, data: () => data })),
      };
    },
  });

  return {
    reads,
    firestore: {
      collection: (name: string) => ({
        ...query(
          name,
          [...docs.entries()]
            .filter(([path]) => path.startsWith(`${name}/`))
            .map(([path, data]) => ({ id: path.slice(name.length + 1), data }))
        ),
        doc: (id: string) => ({
          get: async () => getDoc(`${name}/${id}`),
        }),
      }),
      doc: (path: string) => ({
        get: async () => getDoc(path.startsWith('/') ? path.slice(1) : path),
      }),
    } as unknown as Firestore,
  };
}

function documentReadPaths(reads: Map<string, number>): string[] {
  return [...reads.keys()].filter((key) => key.startsWith('doc:')).sort();
}

function documentReadCount(reads: Map<string, number>): number {
  return [...reads.entries()]
    .filter(([key]) => key.startsWith('doc:'))
    .reduce((sum, [, count]) => sum + count, 0);
}

describe('queryParticipantInstructorAccessReadModels account_manager bounded auth', () => {
  it('does not expose a LIVE instructor relationship to a TEST participant', async () => {
    const testSessionId = TestSessionIdSchema.parse('test_pia_session_01');
    const { firestore } = createAccessFirestore({
      extraDocs: [
        [`users/${accountId}`, {
          accountId,
          dataScope: 'test',
          lifecycle: { status: 'active' },
          ...metadata,
        }],
        [`participants/${participantId}`, {
          participantId,
          dataScope: 'test',
          testSessionId,
          displayName: 'Test Student',
          age: { kind: 'age_years', years: 12 },
          skillLevel: 'beginner',
          discipline: 'ski',
          management: { kind: 'managed', participantManagementId: managementId },
          lifecycle: { status: 'active' },
          ...metadata,
        }],
        [`instructors/${instructorId}`, {
          id: instructorId,
          dataScope: 'live',
          name: 'Unrelated LIVE Instructor',
          pricePerHourKZT: 10_000,
          isAvailable: true,
        }],
      ],
    });

    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now, readScope: testCanonicalReadScope(testSessionId) }
    );
    expect(result).toEqual({ scope: 'account_manager' });
  });

  it('ignores an unscoped relationship whose authority pair does not match its path', async () => {
    const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
    const { firestore } = createAccessFirestore({
      extraDocs: [[`instructor_relationships/${relationshipId}`, {
        instructorRelationshipId: relationshipId,
        participantId: siblingParticipantId,
        instructorId,
        basis: {
          kind: 'guardian_permission',
          participantManagementId: siblingManagementId,
          grantedByAccountId: accountId,
        },
        validFrom: decidedAt,
        expiresAt,
        status: 'active',
        ...metadata,
      }]],
    });

    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );
    expect(result.item?.relationship).toBeUndefined();
  });

  it('A: P=1 authorized account_manager returns unchanged shape with bounded reads', async () => {
    const { firestore, reads } = createAccessFirestore({ includeSiblingParticipants: false });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result).toEqual({
      scope: 'account_manager',
      item: {
        participantId,
        instructorId,
        participantDisplayName: 'PIA Student',
        instructorDisplayName: 'PIA Instructor',
        relationship: {
          instructorRelationshipId: instructorRelationshipIdFromPair({
            participantId,
            instructorId,
          }),
          revision: 1,
          status: 'active',
          validFrom: decidedAt,
          expiresAt,
        },
        managerBlock: undefined,
        instructorBlock: undefined,
        authorizedActions: {
          canCreateRelationship: false,
          canRevokeRelationship: true,
          canBlock: true,
          canUnblock: false,
        },
      },
    });

    expect(documentReadCount(reads)).toBe(7);
    expect(documentReadPaths(reads)).toEqual([
      `doc:instructor_relationships/${instructorRelationshipIdFromPair({
        participantId,
        instructorId,
      })}`,
      `doc:instructors/${instructorId}`,
      `doc:participant_blocks/${participantBlockIdFromDirection({
        participantId,
        instructorId,
        createdByKind: 'participant_manager',
      })}`,
      `doc:participant_blocks/${participantBlockIdFromDirection({
        participantId,
        instructorId,
        createdByKind: 'instructor',
      })}`,
      `doc:participant_management/${managementId}`,
      `doc:participants/${participantId}`,
      `doc:users/${accountId}`,
    ]);
    expect(reads.get(`doc:users/${accountId}`)).toBe(1);
    expect(reads.get(`doc:participants/${participantId}`)).toBe(1);
    expect(reads.get(`doc:participant_management/${managementId}`)).toBe(1);
  });

  it('B: family with unrelated managed participants does not read sibling participant docs', async () => {
    const { firestore, reads } = createAccessFirestore({
      includeSiblingParticipants: true,
      includeThirdParticipant: true,
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.participantId).toBe(participantId);
    expect(reads.has(`doc:participants/${siblingParticipantId}`)).toBe(false);
    expect(reads.has(`doc:participants/${thirdParticipantId}`)).toBe(false);
    expect(reads.has(`doc:participant_management/${siblingManagementId}`)).toBe(false);
    expect(reads.has(`doc:participant_management/${thirdManagementId}`)).toBe(false);
    expect(documentReadCount(reads)).toBe(7);
  });

  it('C: >50 ended/history management rows cannot starve the active target', async () => {
    const { firestore, reads } = createAccessFirestore({
      includeSiblingParticipants: false,
      endedManagementHistoryCount: 60,
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.authorizedActions.canRevokeRelationship).toBe(true);
    expect(reads.get(`doc:participant_management/${managementId}`)).toBe(1);
    expect(documentReadCount(reads)).toBe(7);
    for (let index = 0; index < 60; index += 1) {
      const historyId = `management_pia_history_${String(index).padStart(3, '0')}`;
      expect(reads.has(`doc:participant_management/${historyId}`)).toBe(false);
    }
  });

  it('D: revoked relationship retains canCreateRelationship=true', async () => {
    const { firestore } = createAccessFirestore({
      includeSiblingParticipants: false,
      relationshipStatus: 'revoked',
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.relationship?.status).toBe('revoked');
    expect(result.item?.authorizedActions).toEqual({
      canCreateRelationship: true,
      canRevokeRelationship: false,
      canBlock: true,
      canUnblock: false,
    });
  });

  it('E: active relationship retains revoke/create actions', async () => {
    const { firestore } = createAccessFirestore({ includeSiblingParticipants: false });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.relationship?.status).toBe('active');
    expect(result.item?.authorizedActions.canCreateRelationship).toBe(false);
    expect(result.item?.authorizedActions.canRevokeRelationship).toBe(true);
  });

  it('F: absent relationship retains canCreateRelationship=true', async () => {
    const { firestore } = createAccessFirestore({
      includeSiblingParticipants: false,
      relationshipStatus: 'absent',
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.relationship).toBeUndefined();
    expect(result.item?.authorizedActions.canCreateRelationship).toBe(true);
    expect(result.item?.authorizedActions.canRevokeRelationship).toBe(false);
  });

  it('expired relationship is projected and allows recreate', async () => {
    const { firestore } = createAccessFirestore({
      includeSiblingParticipants: false,
      relationshipStatus: 'expired',
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.relationship?.status).toBe('expired');
    expect(result.item?.authorizedActions.canCreateRelationship).toBe(true);
  });

  it('G: manager block projection and actions are preserved', async () => {
    const { firestore } = createAccessFirestore({
      includeSiblingParticipants: false,
      managerBlockStatus: 'active',
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.managerBlock).toEqual({
      participantBlockId: participantBlockIdFromDirection({
        participantId,
        instructorId,
        createdByKind: 'participant_manager',
      }),
      revision: 1,
      status: 'active',
      reason: 'Manager block reason',
    });
    expect(result.item?.authorizedActions.canBlock).toBe(false);
    expect(result.item?.authorizedActions.canUnblock).toBe(true);
  });

  it('H: instructor block projection for account_manager sanitizes foreign reason', async () => {
    const { firestore } = createAccessFirestore({
      includeSiblingParticipants: false,
      instructorBlockStatus: 'active',
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result.item?.instructorBlock).toEqual({
      participantBlockId: participantBlockIdFromDirection({
        participantId,
        instructorId,
        createdByKind: 'instructor',
      }),
      revision: 1,
      status: 'active',
    });
    expect(result.item?.authorizedActions.canBlock).toBe(true);
    expect(result.item?.authorizedActions.canUnblock).toBe(false);
  });

  it('I: unauthorized participant stays optional-item and target-bounded', async () => {
    const { firestore, reads } = createAccessFirestore({
      includeSiblingParticipants: true,
      includeThirdParticipant: true,
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      {
        scope: 'account_manager',
        participantId: unmanagedParticipantId,
        instructorId,
      },
      { accountId, now }
    );

    expect(result).toEqual({ scope: 'account_manager' });
    expect(reads.has(`doc:participants/${unmanagedParticipantId}`)).toBe(false);
    expect(reads.has(`doc:participants/${siblingParticipantId}`)).toBe(false);
    expect(reads.has(`doc:participants/${participantId}`)).toBe(false);
    expect(reads.has(`doc:instructors/${instructorId}`)).toBe(false);
    expect(documentReadCount(reads)).toBe(1);
    expect(reads.get(`doc:users/${accountId}`)).toBe(1);
  });

  it('inactive/ended management is unauthorized without builder fan-out', async () => {
    const { firestore, reads } = createAccessFirestore({
      includeSiblingParticipants: false,
      endTargetManagement: true,
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result).toEqual({ scope: 'account_manager' });
    expect(reads.has(`doc:participants/${participantId}`)).toBe(false);
    expect(reads.has(`doc:instructors/${instructorId}`)).toBe(false);
  });

  it('account mismatch / other account cannot read managed participant', async () => {
    const { firestore, reads } = createAccessFirestore({ includeSiblingParticipants: false });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId: otherAccountId, now }
    );

    expect(result).toEqual({ scope: 'account_manager' });
    expect(reads.has(`doc:participants/${participantId}`)).toBe(false);
  });

  it('nonexistent participant with no management is unauthorized and bounded', async () => {
    const missingParticipantId = ParticipantIdSchema.parse('participant_pia_missing');
    const { firestore, reads } = createAccessFirestore({ includeSiblingParticipants: false });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId: missingParticipantId, instructorId },
      { accountId, now }
    );

    expect(result).toEqual({ scope: 'account_manager' });
    expect(reads.has(`doc:participants/${missingParticipantId}`)).toBe(false);
    expect(documentReadCount(reads)).toBe(1);
  });

  it('J: missing instructor returns optional-item without relationship/block early extras beyond instructor get', async () => {
    const { firestore, reads } = createAccessFirestore({
      includeSiblingParticipants: false,
      omitInstructor: true,
    });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(result).toEqual({ scope: 'account_manager' });
    expect(reads.get(`doc:instructors/${instructorId}`)).toBe(1);
    expect(
      reads.has(
        `doc:instructor_relationships/${instructorRelationshipIdFromPair({
          participantId,
          instructorId,
        })}`
      )
    ).toBe(false);
    expect(documentReadCount(reads)).toBe(4);
  });

  it('K: instructor scope mismatch still denies without reading pair docs', async () => {
    const { firestore, reads } = createAccessFirestore({ includeSiblingParticipants: false });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'instructor', participantId, instructorId: otherInstructorId },
      { accountId: instructorAccountId, instructorId, now }
    );

    expect(result).toEqual({ scope: 'instructor' });
    expect(documentReadCount(reads)).toBe(0);
  });

  it('K: instructor scope authorized path still builds item', async () => {
    const { firestore, reads } = createAccessFirestore({ includeSiblingParticipants: false });
    const result = await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'instructor', participantId, instructorId },
      { accountId: instructorAccountId, instructorId, now }
    );

    expect(result.item?.participantId).toBe(participantId);
    expect(result.item?.authorizedActions).toEqual({
      canCreateRelationship: false,
      canRevokeRelationship: false,
      canBlock: true,
      canUnblock: false,
    });
    expect(reads.has(`doc:users/${accountId}`)).toBe(false);
    expect(reads.has(`doc:participant_management/${managementId}`)).toBe(false);
    expect(documentReadCount(reads)).toBe(5);
  });

  it('L: account/participant/management are not reread after auth', async () => {
    const { firestore, reads } = createAccessFirestore({
      includeSiblingParticipants: true,
      includeThirdParticipant: true,
      endedManagementHistoryCount: 5,
    });
    await queryParticipantInstructorAccessReadModels(
      firestore,
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now }
    );

    expect(reads.get(`doc:users/${accountId}`)).toBe(1);
    expect(reads.get(`doc:participants/${participantId}`)).toBe(1);
    expect(reads.get(`doc:participant_management/${managementId}`)).toBe(1);
    expect(reads.get(`query:participant_management:1`)).toBe(1);
  });
});
