import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingProposalIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  ParticipantAccessTopologySchema,
  activityLogIdFromCommandId,
  evaluateInstructorParticipantAccess,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  isParticipantInstructorPairBlockedForNewService,
  participantBlockIdFromDirection,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { bookingProposalOpenIndexPath } from '../bookings/bookingProposalOpenIndex';
import { accountCommandActor } from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_participant_cmd_01');
const accountId = AccountIdSchema.parse('account_participant_cmd_01');
const otherAccountId = AccountIdSchema.parse('account_participant_cmd_02');
const participantId = ParticipantIdSchema.parse('participant_participant_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_participant_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_participant_cmd_01');
const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
const proposalId = BookingProposalIdSchema.parse('booking_proposal_participant_block_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(
  capability: 'account_owner' | 'parent_guardian' | 'administrator' | 'instructor',
  actorAccountId = accountId
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey: `idem-${Math.random().toString(36).slice(2, 10)}`,
    correlationId,
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
  };
}

function seedAccount(account = accountId) {
  return AccountSchema.parse({
    accountId: account,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    },
  });
}

async function runCommand<Kind extends CommandEnvelope['kind']>(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  envelope: CommandEnvelope<Kind>
) {
  const commands = createProductionCanonicalCommands(environment(), executor);
  return commands.execute(envelope);
}

describe('participant access commands', () => {
  it('creates a participant and assigns self management with active owner guard', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
    });

    const createEnvelope: CommandEnvelope<'create_participant'> = {
      kind: 'create_participant',
      context: accountContext('account_owner'),
      intent: {
        participantId,
        displayName: 'Self Participant',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
      },
    };

    const created = await runCommand(executor, createEnvelope);
    expect(created.status).toBe('success');

    const assignEnvelope: CommandEnvelope<'assign_participant_management'> = {
      kind: 'assign_participant_management',
      context: {
        ...accountContext('account_owner'),
        idempotencyKey: 'assign-self-01',
      },
      intent: {
        participantManagementId: managementId,
        participantId,
        authority: 'self',
      },
    };

    const assigned = await runCommand(executor, assignEnvelope);
    expect(assigned.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(
      snapshot.docs.get(`participants/${participantId}`)?.data.initialManagementEligibleAccountId
    ).toBeUndefined();
    expect(snapshot.docs.get(`participants/${participantId}`)?.data.management).toEqual({
      kind: 'managed',
      participantManagementId: managementId,
    });
    expect(snapshot.docs.has(`participant_management_active_owner/${participantId}`)).toBe(true);

    const identity = resolveCommandIdempotencyIdentity(assignEnvelope);
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
  });

  it('rejects a second account acquiring active ownership concurrently', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${otherAccountId}`]: seedAccount(otherAccountId),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Dependent',
        age: { kind: 'age_years', years: 10 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'unmanaged_guest' },
        initialManagementEligibleAccountId: accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_seed_participant',
          correlationId,
        },
      },
    });

    const firstEnvelope: CommandEnvelope<'assign_participant_management'> = {
      kind: 'assign_participant_management',
      context: {
        ...accountContext('parent_guardian'),
        idempotencyKey: 'assign-owner-a',
      },
      intent: {
        participantManagementId: managementId,
        participantId,
        authority: 'parent_guardian',
      },
    };

    const secondEnvelope: CommandEnvelope<'assign_participant_management'> = {
      kind: 'assign_participant_management',
      context: {
        ...accountContext('parent_guardian', otherAccountId),
        idempotencyKey: 'assign-owner-b',
      },
      intent: {
        participantManagementId: ParticipantManagementIdSchema.parse('management_participant_cmd_02'),
        participantId,
        authority: 'parent_guardian',
      },
    };

    const first = await runCommand(executor, firstEnvelope);
    const second = await runCommand(executor, secondEnvelope);

    const successes = [first, second].filter((result) => result.status === 'success');
    const denied = [first, second].filter((result) => result.status === 'error');
    expect(successes).toHaveLength(1);
    expect(denied).toHaveLength(1);
    if (denied[0]?.status === 'error') {
      expect(['forbidden', 'blocked_relationship']).toContain(denied[0].error.code);
    }
  });

  it('rejects an unrelated account claiming an orphan participant without eligibility', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${otherAccountId}`]: seedAccount(otherAccountId),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Orphan Participant',
        age: { kind: 'age_years', years: 9 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'unmanaged_guest' },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_seed_participant',
          correlationId,
        },
      },
    });

    const claimEnvelope: CommandEnvelope<'assign_participant_management'> = {
      kind: 'assign_participant_management',
      context: {
        ...accountContext('parent_guardian', otherAccountId),
        idempotencyKey: 'orphan-claim-01',
      },
      intent: {
        participantManagementId: ParticipantManagementIdSchema.parse('management_participant_cmd_02'),
        participantId,
        authority: 'parent_guardian',
      },
    };

    const result = await runCommand(executor, claimEnvelope);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }

    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`participant_management/management_participant_cmd_02`)).toBe(false);
    expect(snapshot.docs.has(`participant_management_active_owner/${participantId}`)).toBe(false);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('activity_logs/'))
    ).toHaveLength(0);
  });

  it('rejects reassignment after management revocation without an approved transfer path', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Revoked Participant',
        age: { kind: 'age_years', years: 11 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'unmanaged_guest' },
        lifecycle: { status: 'active' },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_revoke_management',
          correlationId,
        },
      },
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'ended',
        endedAt: decidedAt,
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_management',
          lastChangedByCommandId: 'command_revoke_management',
          correlationId,
        },
      },
    });

    const reclaimEnvelope: CommandEnvelope<'assign_participant_management'> = {
      kind: 'assign_participant_management',
      context: {
        ...accountContext('parent_guardian'),
        idempotencyKey: 'reclaim-after-revoke-01',
      },
      intent: {
        participantManagementId: ParticipantManagementIdSchema.parse('management_participant_cmd_03'),
        participantId,
        authority: 'parent_guardian',
      },
    };

    const result = await runCommand(executor, reclaimEnvelope);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('creates opposite-direction blocks and removes only the creator block', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Blocked Participant',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_seed_participant',
          correlationId,
        },
      },
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_management',
          lastChangedByCommandId: 'command_seed_management',
          correlationId,
        },
      },
      [`participant_management_active_owner/${participantId}`]: {
        participantId,
        accountId,
        participantManagementId: managementId,
        managementRevision: 1,
        updatedAt: decidedAt,
        lastChangedByCommandId: 'command_seed_management',
        correlationId,
      },
    });

    const managerBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const instructorBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'instructor',
    });

    const managerBlockEnvelope: CommandEnvelope<'block_participant'> = {
      kind: 'block_participant',
      context: { ...accountContext('parent_guardian'), idempotencyKey: 'block-manager-01' },
      intent: {
        participantBlockId: managerBlockId,
        participantId,
        instructorId,
        reason: 'Manager block',
      },
    };
    const instructorBlockEnvelope: CommandEnvelope<'block_participant'> = {
      kind: 'block_participant',
      context: {
        ...accountContext('instructor'),
        idempotencyKey: 'block-instructor-01',
        transportMetadata: { instructor_id: instructorId },
      },
      intent: {
        participantBlockId: instructorBlockId,
        participantId,
        instructorId,
        reason: 'Instructor block',
      },
    };

    expect((await runCommand(executor, managerBlockEnvelope)).status).toBe('success');
    expect((await runCommand(executor, instructorBlockEnvelope)).status).toBe('success');

    const unblockManagerEnvelope: CommandEnvelope<'unblock_participant'> = {
      kind: 'unblock_participant',
      context: {
        ...accountContext('parent_guardian'),
        idempotencyKey: 'unblock-manager-01',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { participantBlockId: managerBlockId },
    };

    expect((await runCommand(executor, unblockManagerEnvelope)).status).toBe('success');
    expect(executor.snapshot().docs.get(`participant_blocks/${managerBlockId}`)?.data.status).toBe(
      'removed'
    );
    expect(executor.snapshot().docs.get(`participant_blocks/${instructorBlockId}`)?.data.status).toBe(
      'active'
    );
  });

  it('cancels open booking proposals when a parent/guardian block is created', async () => {
    const managerBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Blocked Participant',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_seed_participant',
          correlationId,
        },
      },
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_management',
          lastChangedByCommandId: 'command_seed_management',
          correlationId,
        },
      },
      [`booking_proposals/${proposalId}`]: {
        proposalId,
        participantId,
        instructorId,
        proposedService: {
          interval: {
            startsAt: timestampFromDate(new Date('2026-01-15T09:00:00.000Z')),
            endsAt: timestampFromDate(new Date('2026-01-15T10:00:00.000Z')),
          },
          timeZone: 'Asia/Almaty',
        },
        lifecycle: { status: 'open' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_proposal',
          lastChangedByCommandId: 'command_seed_proposal',
          correlationId,
        },
      },
      [bookingProposalOpenIndexPath({ participantId, instructorId })]: {
        participantId,
        instructorId,
        openProposalIds: [proposalId],
        revision: 1,
        updatedAt: decidedAt,
      },
    });

    const blockEnvelope: CommandEnvelope<'block_participant'> = {
      kind: 'block_participant',
      context: { ...accountContext('parent_guardian'), idempotencyKey: 'block-cancel-proposals-01' },
      intent: {
        participantBlockId: managerBlockId,
        participantId,
        instructorId,
        reason: 'Owner block cancels proposals',
      },
    };

    expect((await runCommand(executor, blockEnvelope)).status).toBe('success');

    const proposal = executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data;
    expect(proposal?.lifecycle).toEqual({
      status: 'cancelled',
      cancelledAt: expect.anything(),
      reasonCode: 'instructor_blocked_by_owner',
    });
    expect(
      executor.snapshot().docs.has(bookingProposalOpenIndexPath({ participantId, instructorId }))
    ).toBe(false);
  });

  it('rejects administrator block removal and stale profile revisions', async () => {
    const managerBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Managed Participant',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_seed_participant',
          correlationId,
        },
      },
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_management',
          lastChangedByCommandId: 'command_seed_management',
          correlationId,
        },
      },
      [`participant_blocks/${managerBlockId}`]: {
        participantBlockId: managerBlockId,
        participantId,
        instructorId,
        createdBy: {
          kind: 'participant_manager',
          accountId,
          participantManagementId: managementId,
        },
        reason: 'Blocked',
        status: 'active',
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_block',
          lastChangedByCommandId: 'command_seed_block',
          correlationId,
        },
      },
    });

    const adminUnblock: CommandEnvelope<'unblock_participant'> = {
      kind: 'unblock_participant',
      context: {
        ...accountContext('administrator'),
        idempotencyKey: 'admin-unblock-01',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { participantBlockId: managerBlockId },
    };
    const adminResult = await runCommand(executor, adminUnblock);
    expect(adminResult.status).toBe('error');
    if (adminResult.status === 'error') {
      expect(adminResult.error.code).toBe('forbidden');
    }

    const staleUpdate: CommandEnvelope<'update_participant_profile'> = {
      kind: 'update_participant_profile',
      context: {
        ...accountContext('parent_guardian'),
        idempotencyKey: 'stale-update-01',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { participantId, displayName: 'Updated Name' },
    };
    const staleResult = await runCommand(executor, staleUpdate);
    expect(staleResult.status).toBe('error');
    if (staleResult.status === 'error') {
      expect(staleResult.error.code).toBe('stale_version');
      expect(staleResult.error.currentRevision).toBe(2);
    }

    const staleUnblock: CommandEnvelope<'unblock_participant'> = {
      kind: 'unblock_participant',
      context: {
        ...accountContext('parent_guardian'),
        idempotencyKey: 'stale-unblock-01',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { participantBlockId: managerBlockId },
    };
    const staleUnblockResult = await runCommand(executor, staleUnblock);
    expect(staleUnblockResult.status).toBe('error');
    if (staleUnblockResult.status === 'error') {
      expect(staleUnblockResult.error.code).toBe('stale_version');
      expect(staleUnblockResult.error.currentRevision).toBe(2);
    }
  });

  it('grants guardian-permission relationships with twelve-month expiry and blocks new service', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Managed Participant',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_participant',
          lastChangedByCommandId: 'command_seed_participant',
          correlationId,
        },
      },
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_management',
          lastChangedByCommandId: 'command_seed_management',
          correlationId,
        },
      },
    });

    const relationshipEnvelope: CommandEnvelope<'create_instructor_relationship'> = {
      kind: 'create_instructor_relationship',
      context: { ...accountContext('parent_guardian'), idempotencyKey: 'relationship-01' },
      intent: {
        instructorRelationshipId: relationshipId,
        instructorId,
        participantId,
        basis: { kind: 'guardian_permission' },
      },
    };

    expect((await runCommand(executor, relationshipEnvelope)).status).toBe('success');
    const relationship = executor.snapshot().docs.get(`instructor_relationships/${relationshipId}`)
      ?.data;
    expect(relationship?.expiresAt).toEqual(instructorRelationshipExpiresAt(decidedAt));

    const managerBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const blockEnvelope: CommandEnvelope<'block_participant'> = {
      kind: 'block_participant',
      context: { ...accountContext('parent_guardian'), idempotencyKey: 'relationship-block-01' },
      intent: {
        participantBlockId: managerBlockId,
        participantId,
        instructorId,
        reason: 'No new bookings',
      },
    };
    expect((await runCommand(executor, blockEnvelope)).status).toBe('success');

    const topology = ParticipantAccessTopologySchema.parse({
      accounts: [seedAccount()],
      participants: [executor.snapshot().docs.get(`participants/${participantId}`)?.data],
      participantManagement: [
        executor.snapshot().docs.get(`participant_management/${managementId}`)?.data,
      ],
      activeOwnerGuards: [
        {
          participantId,
          accountId,
          participantManagementId: managementId,
          managementRevision: 1,
          updatedAt: decidedAt,
          lastChangedByCommandId: 'command_seed_management',
          correlationId,
        },
      ],
      instructorRelationships: [relationship],
      participantBlocks: [executor.snapshot().docs.get(`participant_blocks/${managerBlockId}`)?.data],
    });

    expect(
      isParticipantInstructorPairBlockedForNewService(topology, { participantId, instructorId })
    ).toBe(true);
    expect(
      evaluateInstructorParticipantAccess(topology, {
        instructorId,
        participantId,
        at: decidedAt,
        bookingScopedEvidence: [],
      }).allowed
    ).toBe(false);
  });

  it('replays successful commands without a second activity log', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
    });
    const envelope: CommandEnvelope<'create_participant'> = {
      kind: 'create_participant',
      context: { ...accountContext('parent_guardian'), idempotencyKey: 'replay-create-01' },
      intent: {
        participantId,
        displayName: 'Replay Participant',
        age: { kind: 'age_years', years: 8 },
        skillLevel: 'beginner',
        discipline: 'snowboard',
      },
    };

    await runCommand(executor, envelope);
    await runCommand(executor, envelope);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    const activityLogs = [...executor.snapshot().docs.keys()].filter((path) =>
      path.startsWith('activity_logs/')
    );
    expect(activityLogs).toEqual([`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`]);
  });
});
