import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountCommandActor,
  participantManagementIdFromSelfProvisioning,
  selfParticipantIdFromAccountId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const accountId = AccountIdSchema.parse('account_self_provisioning_unit');
const correlationId = CorrelationIdSchema.parse('correlation_self_provisioning_unit');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function envelope(idempotencyKey: string): CommandEnvelope<'provision_self_participant'> {
  return {
    kind: 'provision_self_participant',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
    },
    intent: {},
  };
}

function commands(executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>) {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
    executor
  );
}

describe('canonical self Participant provisioning', () => {
  it('initializes a legacy Account and atomically creates one self Participant and management', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: {
        uid: accountId,
        email: 'client@example.com',
        displayName: 'Existing Client',
        role: 'user',
        isClientActive: true,
      },
    });

    const result = await commands(executor).execute(envelope('provision-self-unit-01'));
    expect(result.status).toBe('success');

    const participantId = selfParticipantIdFromAccountId(accountId);
    const managementId = participantManagementIdFromSelfProvisioning(accountId);
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${accountId}`)?.data).toMatchObject({
      accountId,
      lifecycle: { status: 'active' },
      displayName: 'Existing Client',
      role: 'user',
    });
    expect(snapshot.docs.get(`participants/${participantId}`)?.data).toMatchObject({
      participantId,
      displayName: 'Existing Client',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
    });
    expect(snapshot.docs.get(`participant_management/${managementId}`)?.data).toMatchObject({
      participantManagementId: managementId,
      participantId,
      accountId,
      authority: 'self',
      status: 'active',
    });
    expect(
      snapshot.docs.get(`participant_management_active_owner/${participantId}`)?.data
    ).toMatchObject({ participantId, accountId, participantManagementId: managementId });
  });

  it('is replay-safe and semantically idempotent across different retries', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      {
        [`users/${accountId}`]: {
          uid: accountId,
          displayName: 'Retry Client',
          role: 'user',
        },
      },
      { simulateRetry: true }
    );
    const runtime = commands(executor);

    const first = await runtime.execute(envelope('provision-self-retry-01'));
    const replay = await runtime.execute(envelope('provision-self-retry-01'));
    const semanticRetry = await runtime.execute(envelope('provision-self-retry-02'));
    expect([first.status, replay.status, semanticRetry.status]).toEqual([
      'success',
      'success',
      'success',
    ]);

    const snapshot = executor.snapshot();
    const participantDocs = [...snapshot.docs.keys()].filter((path) =>
      path.startsWith('participants/')
    );
    const managementDocs = [...snapshot.docs.keys()].filter((path) =>
      path.startsWith('participant_management/')
    );
    expect(participantDocs).toHaveLength(1);
    expect(managementDocs).toHaveLength(1);
  });

  it('reuses an existing valid self Participant instead of creating a deterministic duplicate', async () => {
    const existingParticipantId = ParticipantIdSchema.parse('participant_existing_self_unit');
    const existingManagementId = ParticipantManagementIdSchema.parse(
      'management_existing_self_unit'
    );
    const account = AccountSchema.parse({
      accountId,
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
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: {
        ...account,
        uid: accountId,
        displayName: 'Already Linked',
        role: 'user',
      },
      [`participants/${existingParticipantId}`]: {
        participantId: existingParticipantId,
        displayName: 'Already Linked',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: existingManagementId },
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
      [`participant_management/${existingManagementId}`]: {
        participantManagementId: existingManagementId,
        accountId,
        participantId: existingParticipantId,
        role: 'owner',
        authority: 'self',
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
      [`participant_management_active_owner/${existingParticipantId}`]: {
        participantId: existingParticipantId,
        accountId,
        participantManagementId: existingManagementId,
        managementRevision: 1,
        updatedAt: decidedAt,
        lastChangedByCommandId: 'command_seed_management',
        correlationId,
      },
    });

    const result = await commands(executor).execute(envelope('provision-existing-self-01'));
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`participants/${existingParticipantId}`)).toBe(true);
    expect(snapshot.docs.has(`participants/${selfParticipantIdFromAccountId(accountId)}`)).toBe(
      false
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('participants/'))
    ).toHaveLength(1);
  });
});
