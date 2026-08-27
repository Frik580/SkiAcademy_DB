import { describe, expect, it } from 'vitest';
import { canonicalParticipantAccessFixtures } from '@ski-academy/shared-domain/testing';
import {
  AccountSchema,
  BookingScopedParticipantAccessEvidenceSchema,
  InstructorRelationshipSchema,
  ParticipantAccessTopologySchema,
  ParticipantManagementActiveOwnerGuardSchema,
  ParticipantBlockSchema,
  ParticipantManagementSchema,
  ParticipantSchema,
  evaluateInstructorParticipantAccess,
  evaluateParticipantManagementAccess,
  timestampFromDate,
} from '@ski-academy/shared-domain';

const timestamp = (value: string) => timestampFromDate(new Date(value));

const audit = {
  createdByCommandId: 'command_create_01',
  lastChangedByCommandId: 'command_create_01',
  correlationId: 'correlation_create_01',
};

const metadata = {
  revision: 1,
  createdAt: timestamp('2026-01-01T00:00:00.000Z'),
  updatedAt: timestamp('2026-01-01T00:00:00.000Z'),
  audit,
};

function managedRecords(suffix: string, authority: 'self' | 'parent_guardian' = 'parent_guardian') {
  const account = AccountSchema.parse({
    accountId: `account_${suffix}`,
    lifecycle: { status: 'active' },
    ...metadata,
  });
  const participant = ParticipantSchema.parse({
    participantId: `participant_${suffix}`,
    displayName: 'Fixture Participant',
    age: { kind: 'age_years', years: 15 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: `management_${suffix}` },
    lifecycle: { status: 'active' },
    ...metadata,
  });
  const management = ParticipantManagementSchema.parse({
    participantManagementId: `management_${suffix}`,
    accountId: account.accountId,
    participantId: participant.participantId,
    role: 'owner',
    authority,
    status: 'active',
    ...metadata,
  });
  const guard = ParticipantManagementActiveOwnerGuardSchema.parse({
    participantId: participant.participantId,
    accountId: account.accountId,
    participantManagementId: management.participantManagementId,
    managementRevision: management.revision,
    updatedAt: metadata.updatedAt,
    lastChangedByCommandId: audit.lastChangedByCommandId,
    correlationId: audit.correlationId,
  });
  return { account, participant, management, guard };
}

describe('Account and Participant contracts', () => {
  it('publishes canonical owned, relationship, and blocked fixtures', () => {
    expect(canonicalParticipantAccessFixtures.unblockedTopology.participantBlocks).toEqual([]);
    expect(canonicalParticipantAccessFixtures.blockedTopology.participantBlocks).toHaveLength(1);
    expect(canonicalParticipantAccessFixtures.management.authority).toBe('parent_guardian');
  });

  it('serializes distinct active Account and managed Participant identities', () => {
    const account = AccountSchema.parse({
      accountId: 'account_owner_01',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const participant = ParticipantSchema.parse({
      participantId: 'participant_self_01',
      displayName: 'Ari',
      age: { kind: 'birth_date', birthDate: '1990-05-12' },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: 'management_self_01' },
      lifecycle: { status: 'active' },
      ...metadata,
    });

    expect(account.accountId).toBe('account_owner_01');
    expect(participant.management.kind).toBe('managed');
    expect(AccountSchema.safeParse({ ...account, balanceUSD: 100 }).success).toBe(false);
    expect(ParticipantSchema.safeParse({ ...participant, userId: account.accountId }).success).toBe(
      false
    );
  });

  it('requires persisted revisions, ordered audit timestamps, and explicit lifecycle variants', () => {
    const activeAccount = {
      accountId: 'account_lifecycle_01',
      lifecycle: { status: 'active' },
      ...metadata,
    };
    const activeParticipant = {
      participantId: 'participant_lifecycle_01',
      displayName: 'Lifecycle Participant',
      age: { kind: 'birth_date', birthDate: '2012-02-29' },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      ...metadata,
    };

    expect(AccountSchema.safeParse({ ...activeAccount, revision: 0 }).success).toBe(false);
    expect(
      AccountSchema.safeParse({
        ...activeAccount,
        updatedAt: timestamp('2025-12-31T23:59:59.000Z'),
      }).success
    ).toBe(false);
    expect(
      AccountSchema.safeParse({ ...activeAccount, disabledAt: metadata.updatedAt }).success
    ).toBe(false);
    expect(
      ParticipantSchema.safeParse({ ...activeParticipant, userId: 'legacy_user' }).success
    ).toBe(false);
    expect(
      ParticipantSchema.safeParse({
        ...activeParticipant,
        age: { kind: 'birth_date', birthDate: '2011-02-29' },
      }).success
    ).toBe(false);
  });
});

describe('Participant management topology', () => {
  it('distinguishes self ownership from dependent management through active relationships', () => {
    const selfAccount = AccountSchema.parse({
      accountId: 'account_self_01',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const parentAccount = AccountSchema.parse({
      accountId: 'account_parent_01',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const selfParticipant = ParticipantSchema.parse({
      participantId: 'participant_self_01',
      displayName: 'Alex',
      age: { kind: 'age_years', years: 31 },
      skillLevel: 'advanced',
      discipline: 'snowboard',
      management: { kind: 'managed', participantManagementId: 'management_self_01' },
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const dependentParticipant = ParticipantSchema.parse({
      participantId: 'participant_dependent_01',
      displayName: 'Mika',
      age: { kind: 'age_years', years: 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: 'management_dependent_01' },
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const selfManagement = ParticipantManagementSchema.parse({
      participantManagementId: 'management_self_01',
      accountId: selfAccount.accountId,
      participantId: selfParticipant.participantId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      ...metadata,
    });
    const dependentManagement = ParticipantManagementSchema.parse({
      participantManagementId: 'management_dependent_01',
      accountId: parentAccount.accountId,
      participantId: dependentParticipant.participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    const topology = ParticipantAccessTopologySchema.parse({
      accounts: [selfAccount, parentAccount],
      participants: [selfParticipant, dependentParticipant],
      participantManagement: [selfManagement, dependentManagement],
      activeOwnerGuards: [
        ParticipantManagementActiveOwnerGuardSchema.parse({
          participantId: selfParticipant.participantId,
          accountId: selfAccount.accountId,
          participantManagementId: selfManagement.participantManagementId,
          managementRevision: selfManagement.revision,
          updatedAt: metadata.updatedAt,
          lastChangedByCommandId: audit.lastChangedByCommandId,
          correlationId: audit.correlationId,
        }),
        ParticipantManagementActiveOwnerGuardSchema.parse({
          participantId: dependentParticipant.participantId,
          accountId: parentAccount.accountId,
          participantManagementId: dependentManagement.participantManagementId,
          managementRevision: dependentManagement.revision,
          updatedAt: metadata.updatedAt,
          lastChangedByCommandId: audit.lastChangedByCommandId,
          correlationId: audit.correlationId,
        }),
      ],
      instructorRelationships: [],
      participantBlocks: [],
    });

    expect(
      evaluateParticipantManagementAccess(topology, {
        accountId: selfAccount.accountId,
        participantId: selfParticipant.participantId,
      })
    ).toEqual({
      allowed: true,
      authority: 'self',
      participantManagementId: selfManagement.participantManagementId,
    });
    expect(
      evaluateParticipantManagementAccess(topology, {
        accountId: parentAccount.accountId,
        participantId: dependentParticipant.participantId,
      })
    ).toEqual({
      allowed: true,
      authority: 'parent_guardian',
      participantManagementId: dependentManagement.participantManagementId,
    });
  });

  it('rejects lifecycle timestamps that are not covered by the record revision', () => {
    const records = managedRecords('ended_lifecycle');

    expect(
      ParticipantManagementSchema.safeParse({
        ...records.management,
        status: 'ended',
        endedAt: timestamp('2026-02-01T00:00:00.000Z'),
      }).success
    ).toBe(false);
  });

  it('accepts an explicitly unmanaged guest without inventing an owner', () => {
    const participant = ParticipantSchema.parse({
      participantId: 'participant_unmanaged_guest',
      displayName: 'Guest Participant',
      age: { kind: 'age_years', years: 28 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      ...metadata,
    });

    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [],
        participants: [participant],
        participantManagement: [],
        activeOwnerGuards: [],
        instructorRelationships: [],
        participantBlocks: [],
      }).success
    ).toBe(true);
  });

  it('rejects an orphan managed Participant and contradictory active managers', () => {
    const records = managedRecords('contradictory');
    const otherAccount = AccountSchema.parse({
      accountId: 'account_contradictory_other',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const otherManagement = ParticipantManagementSchema.parse({
      participantManagementId: 'management_contradictory_other',
      accountId: otherAccount.accountId,
      participantId: records.participant.participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });

    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [records.account],
        participants: [records.participant],
        participantManagement: [],
        activeOwnerGuards: [],
        instructorRelationships: [],
        participantBlocks: [],
      }).success
    ).toBe(false);
    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [records.account, otherAccount],
        participants: [records.participant],
        participantManagement: [records.management, otherManagement],
        activeOwnerGuards: [records.guard],
        instructorRelationships: [],
        participantBlocks: [],
      }).success
    ).toBe(false);
  });

  it('rejects a cross-Account active-owner guard', () => {
    const records = managedRecords('cross_account');
    const otherAccount = AccountSchema.parse({
      accountId: 'account_cross_account_other',
      lifecycle: { status: 'active' },
      ...metadata,
    });

    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [records.account, otherAccount],
        participants: [records.participant],
        participantManagement: [records.management],
        activeOwnerGuards: [{ ...records.guard, accountId: otherAccount.accountId }],
        instructorRelationships: [],
        participantBlocks: [],
      }).success
    ).toBe(false);
  });

  it('does not authorize an unrelated Account for a managed Participant', () => {
    const records = managedRecords('unauthorized');
    const otherAccount = AccountSchema.parse({
      accountId: 'account_unauthorized_other',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const topology = ParticipantAccessTopologySchema.parse({
      accounts: [records.account, otherAccount],
      participants: [records.participant],
      participantManagement: [records.management],
      activeOwnerGuards: [records.guard],
      instructorRelationships: [],
      participantBlocks: [],
    });

    expect(
      evaluateParticipantManagementAccess(topology, {
        accountId: otherAccount.accountId,
        participantId: records.participant.participantId,
      })
    ).toEqual({ allowed: false, reason: 'unauthorized' });
  });
});

describe('Instructor relationship access', () => {
  it('grants general access only through an explicit active relationship', () => {
    const account = AccountSchema.parse({
      accountId: 'account_parent_02',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const participant = ParticipantSchema.parse({
      participantId: 'participant_dependent_02',
      displayName: 'Noa',
      age: { kind: 'age_years', years: 14 },
      skillLevel: 'intermediate',
      discipline: 'snowboard',
      management: { kind: 'managed', participantManagementId: 'management_dependent_02' },
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const management = ParticipantManagementSchema.parse({
      participantManagementId: 'management_dependent_02',
      accountId: account.accountId,
      participantId: participant.participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    const relationship = InstructorRelationshipSchema.parse({
      instructorRelationshipId: 'instructor_relationship_02',
      participantId: participant.participantId,
      instructorId: 'instructor_02',
      basis: {
        kind: 'guardian_permission',
        participantManagementId: management.participantManagementId,
        grantedByAccountId: account.accountId,
      },
      validFrom: timestamp('2026-01-01T00:00:00.000Z'),
      expiresAt: timestamp('2027-01-01T00:00:00.000Z'),
      status: 'active',
      ...metadata,
    });
    const topology = ParticipantAccessTopologySchema.parse({
      accounts: [account],
      participants: [participant],
      participantManagement: [management],
      activeOwnerGuards: [
        {
          participantId: participant.participantId,
          accountId: account.accountId,
          participantManagementId: management.participantManagementId,
          managementRevision: management.revision,
          updatedAt: metadata.updatedAt,
          lastChangedByCommandId: audit.lastChangedByCommandId,
          correlationId: audit.correlationId,
        },
      ],
      instructorRelationships: [relationship],
      participantBlocks: [],
    });

    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId: relationship.instructorId,
        participantId: participant.participantId,
        at: timestamp('2026-06-01T00:00:00.000Z'),
        bookingScopedEvidence: [],
      })
    ).toEqual({ allowed: true, scope: 'relationship' });
    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId: 'instructor_unrelated',
        participantId: participant.participantId,
        at: timestamp('2026-06-01T00:00:00.000Z'),
        bookingScopedEvidence: [],
      })
    ).toEqual({ allowed: false, reason: 'unauthorized' });
  });

  it('denies general access while either explicit block direction is active', () => {
    const account = AccountSchema.parse({
      accountId: 'account_parent_block',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const participant = ParticipantSchema.parse({
      participantId: 'participant_blocked',
      displayName: 'Sam',
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: 'management_blocked' },
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const management = ParticipantManagementSchema.parse({
      participantManagementId: 'management_blocked',
      accountId: account.accountId,
      participantId: participant.participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    const relationship = InstructorRelationshipSchema.parse({
      instructorRelationshipId: 'instructor_relationship_blocked',
      participantId: participant.participantId,
      instructorId: 'instructor_blocked',
      basis: { kind: 'confirmed_booking', bookingId: 'booking_blocked' },
      validFrom: timestamp('2026-01-01T00:00:00.000Z'),
      expiresAt: timestamp('2027-01-01T00:00:00.000Z'),
      status: 'active',
      ...metadata,
    });
    const block = ParticipantBlockSchema.parse({
      participantBlockId: 'participant_block_parent',
      participantId: participant.participantId,
      instructorId: relationship.instructorId,
      createdBy: {
        kind: 'participant_manager',
        accountId: account.accountId,
        participantManagementId: management.participantManagementId,
      },
      reason: 'Do not allow new training.',
      status: 'active',
      ...metadata,
    });
    const topology = ParticipantAccessTopologySchema.parse({
      accounts: [account],
      participants: [participant],
      participantManagement: [management],
      activeOwnerGuards: [
        {
          participantId: participant.participantId,
          accountId: account.accountId,
          participantManagementId: management.participantManagementId,
          managementRevision: management.revision,
          updatedAt: metadata.updatedAt,
          lastChangedByCommandId: audit.lastChangedByCommandId,
          correlationId: audit.correlationId,
        },
      ],
      instructorRelationships: [relationship],
      participantBlocks: [block],
    });

    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId: relationship.instructorId,
        participantId: participant.participantId,
        at: timestamp('2026-06-01T00:00:00.000Z'),
        bookingScopedEvidence: [],
      })
    ).toEqual({ allowed: false, reason: 'blocked' });

    const bookingScopedEvidence = BookingScopedParticipantAccessEvidenceSchema.parse({
      source: { kind: 'booking', bookingId: 'booking_existing_confirmed' },
      participantId: participant.participantId,
      instructorId: relationship.instructorId,
      validFrom: timestamp('2026-01-01T00:00:00.000Z'),
      validUntil: timestamp('2026-12-31T00:00:00.000Z'),
    });
    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId: relationship.instructorId,
        participantId: participant.participantId,
        at: timestamp('2026-06-01T00:00:00.000Z'),
        bookingScopedEvidence: [bookingScopedEvidence],
      })
    ).toEqual({
      allowed: true,
      scope: 'booking_scoped',
      blockedForNewActivity: true,
      source: bookingScopedEvidence.source,
    });
  });

  it('keeps manager and Instructor block directions independent', () => {
    const records = managedRecords('block_directions');
    const instructorId = 'instructor_block_directions';
    const managerCreator = {
      kind: 'participant_manager' as const,
      accountId: records.account.accountId,
      participantManagementId: records.management.participantManagementId,
    };
    const managerBlock = ParticipantBlockSchema.parse({
      participantBlockId: 'block_direction_manager',
      participantId: records.participant.participantId,
      instructorId,
      createdBy: managerCreator,
      reason: 'Manager blocks new activity.',
      status: 'active',
      ...metadata,
    });
    const instructorBlock = ParticipantBlockSchema.parse({
      participantBlockId: 'block_direction_instructor',
      participantId: records.participant.participantId,
      instructorId,
      createdBy: { kind: 'instructor', instructorId },
      reason: 'Instructor blocks new activity.',
      status: 'active',
      ...metadata,
    });
    const baseTopology = {
      accounts: [records.account],
      participants: [records.participant],
      participantManagement: [records.management],
      activeOwnerGuards: [records.guard],
      instructorRelationships: [],
    };

    expect(
      ParticipantAccessTopologySchema.safeParse({
        ...baseTopology,
        participantBlocks: [managerBlock, instructorBlock],
      }).success
    ).toBe(true);

    const removedManagerBlock = ParticipantBlockSchema.parse({
      ...managerBlock,
      status: 'removed',
      removedAt: timestamp('2026-02-01T00:00:00.000Z'),
      removedBy: managerCreator,
      revision: 2,
      updatedAt: timestamp('2026-02-01T00:00:00.000Z'),
      audit: { ...audit, lastChangedByCommandId: 'command_remove_manager_block' },
    });
    const topology = ParticipantAccessTopologySchema.parse({
      ...baseTopology,
      participantBlocks: [removedManagerBlock, instructorBlock],
    });

    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId,
        participantId: records.participant.participantId,
        at: timestamp('2026-06-01T00:00:00.000Z'),
        bookingScopedEvidence: [],
      })
    ).toEqual({ allowed: false, reason: 'blocked' });
  });

  it('validates relationship lifecycle edges and denies access at expiry', () => {
    const records = managedRecords('relationship_lifecycle');
    const updatedMetadata = {
      ...metadata,
      revision: 2,
      updatedAt: timestamp('2027-01-01T00:00:00.000Z'),
      audit: {
        ...audit,
        lastChangedByCommandId: 'command_expire_relationship',
      },
    };
    const active = {
      instructorRelationshipId: 'relationship_lifecycle',
      participantId: records.participant.participantId,
      instructorId: 'instructor_lifecycle',
      basis: { kind: 'confirmed_booking', bookingId: 'booking_lifecycle' },
      validFrom: timestamp('2026-01-01T00:00:00.000Z'),
      expiresAt: timestamp('2027-01-01T00:00:00.000Z'),
      status: 'active',
      ...metadata,
    };

    expect(
      InstructorRelationshipSchema.safeParse({
        ...active,
        revokedAt: timestamp('2026-02-01T00:00:00.000Z'),
      }).success
    ).toBe(false);
    expect(
      InstructorRelationshipSchema.safeParse({
        ...active,
        ...updatedMetadata,
        status: 'expired',
        expiredAt: timestamp('2026-12-31T23:59:59.000Z'),
      }).success
    ).toBe(false);

    const relationship = InstructorRelationshipSchema.parse(active);
    const topology = ParticipantAccessTopologySchema.parse({
      accounts: [records.account],
      participants: [records.participant],
      participantManagement: [records.management],
      activeOwnerGuards: [records.guard],
      instructorRelationships: [relationship],
      participantBlocks: [],
    });
    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId: relationship.instructorId,
        participantId: relationship.participantId,
        at: relationship.expiresAt,
        bookingScopedEvidence: [],
      })
    ).toEqual({ allowed: false, reason: 'unauthorized' });

    const revoked = InstructorRelationshipSchema.parse({
      ...active,
      status: 'revoked',
      revokedAt: timestamp('2026-06-01T00:00:00.000Z'),
      revokedBy: {
        kind: 'participant_manager',
        accountId: records.account.accountId,
        participantManagementId: records.management.participantManagementId,
      },
      revision: 2,
      updatedAt: timestamp('2026-06-01T00:00:00.000Z'),
      audit: { ...audit, lastChangedByCommandId: 'command_revoke_relationship' },
    });
    const expired = InstructorRelationshipSchema.parse({
      ...active,
      status: 'expired',
      expiredAt: active.expiresAt,
      ...updatedMetadata,
    });

    expect(InstructorRelationshipSchema.parse(JSON.parse(JSON.stringify(revoked)))).toEqual(
      revoked
    );
    expect(InstructorRelationshipSchema.parse(JSON.parse(JSON.stringify(expired)))).toEqual(
      expired
    );

    const revokedTopology = ParticipantAccessTopologySchema.parse({
      accounts: [records.account],
      participants: [records.participant],
      participantManagement: [records.management],
      activeOwnerGuards: [records.guard],
      instructorRelationships: [revoked],
      participantBlocks: [],
    });
    expect(
      evaluateInstructorParticipantAccess(revokedTopology, {
        instructorId: revoked.instructorId,
        participantId: revoked.participantId,
        at: timestamp('2026-06-02T00:00:00.000Z'),
        bookingScopedEvidence: [],
      })
    ).toEqual({ allowed: false, reason: 'unauthorized' });
  });

  it('allows only the exact block creator to serialize removal', () => {
    const records = managedRecords('block_removal');
    const creator = {
      kind: 'participant_manager' as const,
      accountId: records.account.accountId,
      participantManagementId: records.management.participantManagementId,
    };
    const removedBlock = {
      participantBlockId: 'block_removed',
      participantId: records.participant.participantId,
      instructorId: 'instructor_removed_block',
      createdBy: creator,
      reason: 'No new activity.',
      status: 'removed',
      removedAt: timestamp('2026-02-01T00:00:00.000Z'),
      removedBy: creator,
      ...metadata,
      revision: 2,
      updatedAt: timestamp('2026-02-01T00:00:00.000Z'),
      audit: { ...audit, lastChangedByCommandId: 'command_remove_block' },
    };

    expect(ParticipantBlockSchema.safeParse(removedBlock).success).toBe(true);
    expect(
      ParticipantBlockSchema.safeParse({
        ...removedBlock,
        removedBy: {
          ...creator,
          accountId: 'account_not_creator',
        },
      }).success
    ).toBe(false);
    expect(
      ParticipantBlockSchema.safeParse({
        ...removedBlock,
        createdBy: { kind: 'instructor', instructorId: 'instructor_other' },
        removedBy: { kind: 'instructor', instructorId: 'instructor_other' },
      }).success
    ).toBe(false);
  });

  it('rejects duplicate active blocks and cross-Account permission provenance', () => {
    const records = managedRecords('cross_permission');
    const otherAccount = AccountSchema.parse({
      accountId: 'account_cross_permission_other',
      lifecycle: { status: 'active' },
      ...metadata,
    });
    const relationship = InstructorRelationshipSchema.parse({
      instructorRelationshipId: 'relationship_cross_permission',
      participantId: records.participant.participantId,
      instructorId: 'instructor_cross_permission',
      basis: {
        kind: 'guardian_permission',
        participantManagementId: records.management.participantManagementId,
        grantedByAccountId: otherAccount.accountId,
      },
      validFrom: metadata.createdAt,
      expiresAt: timestamp('2027-01-01T00:00:00.000Z'),
      status: 'active',
      ...metadata,
    });
    const block = ParticipantBlockSchema.parse({
      participantBlockId: 'block_duplicate_01',
      participantId: records.participant.participantId,
      instructorId: relationship.instructorId,
      createdBy: {
        kind: 'participant_manager',
        accountId: records.account.accountId,
        participantManagementId: records.management.participantManagementId,
      },
      reason: 'No new activity.',
      status: 'active',
      ...metadata,
    });

    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [records.account, otherAccount],
        participants: [records.participant],
        participantManagement: [records.management],
        activeOwnerGuards: [records.guard],
        instructorRelationships: [relationship],
        participantBlocks: [],
      }).success
    ).toBe(false);
    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [records.account],
        participants: [records.participant],
        participantManagement: [records.management],
        activeOwnerGuards: [records.guard],
        instructorRelationships: [],
        participantBlocks: [block, { ...block, participantBlockId: 'block_duplicate_02' }],
      }).success
    ).toBe(false);
  });

  it('rejects relationship actors that are absent from the Account topology', () => {
    const records = managedRecords('unknown_relationship_actor');
    const relationship = InstructorRelationshipSchema.parse({
      instructorRelationshipId: 'relationship_unknown_actor',
      participantId: records.participant.participantId,
      instructorId: 'instructor_unknown_actor',
      basis: {
        kind: 'administration_assignment',
        assignedByAccountId: 'account_missing_administrator',
      },
      validFrom: metadata.createdAt,
      expiresAt: timestamp('2027-01-01T00:00:00.000Z'),
      status: 'active',
      ...metadata,
    });

    expect(
      ParticipantAccessTopologySchema.safeParse({
        accounts: [records.account],
        participants: [records.participant],
        participantManagement: [records.management],
        activeOwnerGuards: [records.guard],
        instructorRelationships: [relationship],
        participantBlocks: [],
      }).success
    ).toBe(false);
  });
});

describe('parseAccountDocument', () => {
  it('parses canonical account fields from a dual-purpose user profile document', async () => {
    const { parseAccountDocument } = await import('@ski-academy/shared-domain');
    const account = parseAccountDocument({
      uid: 'account_dual_01',
      email: 'student@example.com',
      displayName: 'Student',
      role: 'user',
      avatarUrl: '',
      balanceUSD: 500,
      accountId: 'account_dual_01',
      lifecycle: { status: 'active' },
      ...metadata,
    });

    expect(account).toEqual(
      AccountSchema.parse({
        accountId: 'account_dual_01',
        lifecycle: { status: 'active' },
        ...metadata,
      })
    );
  });
});
