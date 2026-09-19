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
import { buildSelfIdentityProjectionRepair } from './selfParticipantProvisioningCommands';

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

function seedCanonicalAccount(extra: Record<string, unknown> = {}) {
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
  return {
    ...account,
    uid: accountId,
    role: 'user',
    ...extra,
  };
}

function seedExistingSelf(input: {
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly profileDisplayName?: string;
  readonly profileAvatarUrl?: string;
  readonly dependent?: {
    readonly participantId: string;
    readonly managementId: string;
    readonly displayName: string;
  };
}) {
  const existingParticipantId = ParticipantIdSchema.parse('participant_existing_self_unit');
  const existingManagementId = ParticipantManagementIdSchema.parse(
    'management_existing_self_unit'
  );
  const docs: Record<string, Record<string, unknown>> = {
    [`users/${accountId}`]: seedCanonicalAccount({
      displayName: input.profileDisplayName ?? input.displayName,
      ...(input.profileAvatarUrl !== undefined ? { avatarUrl: input.profileAvatarUrl } : {}),
    }),
    [`participants/${existingParticipantId}`]: {
      participantId: existingParticipantId,
      displayName: input.displayName,
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
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
  };

  if (input.dependent) {
    docs[`participants/${input.dependent.participantId}`] = {
      participantId: input.dependent.participantId,
      displayName: input.dependent.displayName,
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'beginner',
      discipline: 'snowboard',
      management: {
        kind: 'managed',
        participantManagementId: input.dependent.managementId,
      },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_dependent',
        lastChangedByCommandId: 'command_seed_dependent',
        correlationId,
      },
    };
    docs[`participant_management/${input.dependent.managementId}`] = {
      participantManagementId: input.dependent.managementId,
      accountId,
      participantId: input.dependent.participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_dependent_mgmt',
        lastChangedByCommandId: 'command_seed_dependent_mgmt',
        correlationId,
      },
    };
    docs[`participant_management_active_owner/${input.dependent.participantId}`] = {
      participantId: input.dependent.participantId,
      accountId,
      participantManagementId: input.dependent.managementId,
      managementRevision: 1,
      updatedAt: decidedAt,
      lastChangedByCommandId: 'command_seed_dependent_mgmt',
      correlationId,
    };
  }

  return {
    docs,
    existingParticipantId,
    existingManagementId,
  };
}

describe('buildSelfIdentityProjectionRepair', () => {
  it('repairs displayName and avatarUrl from canonical self Participant only', () => {
    expect(
      buildSelfIdentityProjectionRepair(
        { displayName: 'Old Name', avatarUrl: 'https://cdn.example.com/old.jpg' },
        {
          displayName: 'Canonical Name',
          avatarUrl: 'https://cdn.example.com/canonical.jpg',
        }
      )
    ).toEqual({
      displayName: 'Canonical Name',
      avatarUrl: 'https://cdn.example.com/canonical.jpg',
    });
  });

  it('does not clear legacy avatar when Participant has no avatarUrl', () => {
    expect(
      buildSelfIdentityProjectionRepair(
        { displayName: 'Same', avatarUrl: 'https://cdn.example.com/legacy.jpg' },
        { displayName: 'Same' }
      )
    ).toBeUndefined();
  });
});

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
    expect(result).toMatchObject({
      status: 'success',
      payload: { adminPeopleRevision: 1 },
    });

    const participantId = selfParticipantIdFromAccountId(accountId);
    const managementId = participantManagementIdFromSelfProvisioning(accountId);
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get('admin_runtime/admin_people')?.data.revision).toBe(1);
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

  it('keeps new self Participant.displayName equal to UserProfile.displayName at create time', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: {
        uid: accountId,
        displayName: 'Fresh Client',
        role: 'user',
      },
    });

    expect((await commands(executor).execute(envelope('provision-self-aligned-01'))).status).toBe(
      'success'
    );
    const participantId = selfParticipantIdFromAccountId(accountId);
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`participants/${participantId}`)?.data.displayName).toBe(
      'Fresh Client'
    );
    expect(snapshot.docs.get(`users/${accountId}`)?.data.displayName).toBe('Fresh Client');
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
    const seeded = seedExistingSelf({ displayName: 'Already Linked' });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);

    const result = await commands(executor).execute(envelope('provision-existing-self-01'));
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`participants/${seeded.existingParticipantId}`)).toBe(true);
    expect(snapshot.docs.has(`participants/${selfParticipantIdFromAccountId(accountId)}`)).toBe(
      false
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('participants/'))
    ).toHaveLength(1);
  });

  it('repairs UserProfile.displayName from existing self Participant on reconcile', async () => {
    const seeded = seedExistingSelf({
      displayName: 'Canonical Name',
      profileDisplayName: 'Old Name',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);

    expect((await commands(executor).execute(envelope('provision-repair-name-01'))).status).toBe(
      'success'
    );

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${accountId}`)?.data.displayName).toBe('Canonical Name');
    expect(
      snapshot.docs.get(`participants/${seeded.existingParticipantId}`)?.data.displayName
    ).toBe('Canonical Name');
    expect(snapshot.docs.get(`users/${accountId}`)?.data.revision).toBe(2);
  });

  it('does not write UserProfile projection when names and avatars already match', async () => {
    const seeded = seedExistingSelf({
      displayName: 'Aligned Name',
      avatarUrl: 'https://cdn.example.com/aligned.jpg',
      profileDisplayName: 'Aligned Name',
      profileAvatarUrl: 'https://cdn.example.com/aligned.jpg',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const before = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    const writesBefore = executor.snapshot().writesAttempted;

    expect((await commands(executor).execute(envelope('provision-aligned-01'))).status).toBe(
      'success'
    );

    const after = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    expect(after).toEqual(before);
    // Idempotency + audit may write, but users/{uid} projection must be untouched.
    expect(after?.revision).toBe(1);
    expect(after?.displayName).toBe('Aligned Name');
    expect(after?.avatarUrl).toBe('https://cdn.example.com/aligned.jpg');
    expect(executor.snapshot().writesAttempted).toBeGreaterThan(writesBefore);
  });

  it('repairs UserProfile.avatarUrl when self Participant.avatarUrl is set', async () => {
    const seeded = seedExistingSelf({
      displayName: 'Same Name',
      avatarUrl: 'https://cdn.example.com/canonical.jpg',
      profileDisplayName: 'Same Name',
      profileAvatarUrl: 'https://cdn.example.com/old.jpg',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);

    expect((await commands(executor).execute(envelope('provision-repair-avatar-01'))).status).toBe(
      'success'
    );

    expect(executor.snapshot().docs.get(`users/${accountId}`)?.data.avatarUrl).toBe(
      'https://cdn.example.com/canonical.jpg'
    );
  });

  it('does not destroy legacy UserProfile.avatarUrl when Participant has no avatarUrl', async () => {
    const seeded = seedExistingSelf({
      displayName: 'Same Name',
      profileDisplayName: 'Same Name',
      profileAvatarUrl: 'https://cdn.example.com/legacy.jpg',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);

    expect(
      (await commands(executor).execute(envelope('provision-preserve-legacy-avatar-01'))).status
    ).toBe('success');

    const users = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    expect(users?.avatarUrl).toBe('https://cdn.example.com/legacy.jpg');
    expect(users?.revision).toBe(1);
    expect(
      executor.snapshot().docs.get(`participants/${seeded.existingParticipantId}`)?.data.avatarUrl
    ).toBeUndefined();
  });

  it('never uses dependent Participant identity to repair UserProfile', async () => {
    const dependentId = ParticipantIdSchema.parse('participant_dependent_unit');
    const dependentManagementId = ParticipantManagementIdSchema.parse(
      'management_dependent_unit'
    );
    const seeded = seedExistingSelf({
      displayName: 'Self Canonical',
      profileDisplayName: 'Stale Profile',
      dependent: {
        participantId: dependentId,
        managementId: dependentManagementId,
        displayName: 'Dependent Name',
      },
    });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);

    expect(
      (await commands(executor).execute(envelope('provision-ignore-dependent-01'))).status
    ).toBe('success');

    const users = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    expect(users?.displayName).toBe('Self Canonical');
    expect(users?.displayName).not.toBe('Dependent Name');
    expect(executor.snapshot().docs.get(`participants/${dependentId}`)?.data.displayName).toBe(
      'Dependent Name'
    );
  });

  it('repeated provisioning after repair remains idempotent and does not re-write projection', async () => {
    const seeded = seedExistingSelf({
      displayName: 'Canonical Name',
      profileDisplayName: 'Old Name',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const runtime = commands(executor);

    expect((await runtime.execute(envelope('provision-repair-once-01'))).status).toBe('success');
    const afterRepair = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    expect(afterRepair?.displayName).toBe('Canonical Name');
    expect(afterRepair?.revision).toBe(2);

    expect((await runtime.execute(envelope('provision-repair-once-02'))).status).toBe('success');
    const afterSecond = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    expect(afterSecond?.displayName).toBe('Canonical Name');
    expect(afterSecond?.revision).toBe(2);
    expect(afterSecond?.updatedAt).toEqual(afterRepair?.updatedAt);
  });
});
