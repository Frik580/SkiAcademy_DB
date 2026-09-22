import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  TestSessionIdSchema,
  accountCommandActor,
  deriveCommandKey,
  encodeCommandActorScope,
  participantManagementIdFromSelfProvisioning,
  selfParticipantIdFromAccountId,
  testCanonicalExecutionScope,
  timestampFromDate,
  type CommandEnvelope,
  type TestSessionStatus,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import {
  resolveCanonicalExecutionScope,
  type CanonicalExecutionScopeStore,
} from '../testSessions/canonicalExecutionScopeResolver';
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

function commands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  scope?: ReturnType<typeof testCanonicalExecutionScope>
) {
  return createProductionCanonicalCommands(
    {
      clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
      ...(scope ? { scope } : {}),
    },
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
      dataScope: 'live',
      lifecycle: { status: 'active' },
      displayName: 'Existing Client',
      role: 'user',
    });
    expect(snapshot.docs.get(`participants/${participantId}`)?.data).toMatchObject({
      participantId,
      dataScope: 'live',
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
    expect(snapshot.docs.get(`users/${accountId}`)?.data.dataScope).toBe('live');
    expect(snapshot.docs.get(`participants/${participantId}`)?.data.dataScope).toBe('live');
    expect(snapshot.docs.get(`users/${accountId}`)?.data.testSessionId).toBeUndefined();
    expect(snapshot.docs.get(`participants/${participantId}`)?.data.testSessionId).toBeUndefined();
  });

  it('repairs a stale-client Account missing scope when self identity already exists', async () => {
    const seeded = seedExistingSelf({ displayName: 'Existing Self' });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);

    expect((await commands(executor).execute(envelope('provision-stale-account-01'))).status).toBe(
      'success'
    );
    const account = executor.snapshot().docs.get(`users/${accountId}`)?.data;
    expect(account?.dataScope).toBe('live');
    expect(account?.testSessionId).toBeUndefined();
    expect(account?.revision).toBe(2);
  });

  it('leaves an explicitly LIVE Account unchanged when its mirror is aligned', async () => {
    const seeded = seedExistingSelf({ displayName: 'Existing Self' });
    seeded.docs[`users/${accountId}`]!.dataScope = 'live';
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const before = executor.snapshot().docs.get(`users/${accountId}`)?.data;

    expect((await commands(executor).execute(envelope('provision-explicit-live-01'))).status).toBe(
      'success'
    );
    expect(executor.snapshot().docs.get(`users/${accountId}`)?.data).toEqual(before);
  });

  it('never reclassifies an explicitly TEST Account from a LIVE request', async () => {
    const seeded = seedExistingSelf({ displayName: 'Test Self' });
    seeded.docs[`users/${accountId}`]!.dataScope = 'test';
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const before = executor.snapshot().docs.get(`users/${accountId}`)?.data;

    expect(await commands(executor).execute(envelope('provision-test-as-live-01'))).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden' },
    });
    expect(executor.snapshot().docs.get(`users/${accountId}`)?.data).toEqual(before);
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
    seeded.docs[`users/${accountId}`]!.dataScope = 'live';
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
    seeded.docs[`users/${accountId}`]!.dataScope = 'live';
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

const testSessionId = TestSessionIdSchema.parse('test_provision_self_01');
const otherSessionId = TestSessionIdSchema.parse('test_provision_self_02');
const testScope = testCanonicalExecutionScope(testSessionId);
const scopeCommandId = CommandIdSchema.parse('command_provision_test_scope_01');
const dependentParticipantId = ParticipantIdSchema.parse('participant_test_dependent_unit');
const dependentManagementId = ParticipantManagementIdSchema.parse('management_test_dependent_unit');

function identityDocuments(
  snapshot: ReturnType<ReturnType<typeof createInMemoryCanonicalTransactionExecutor>['snapshot']>
) {
  return [...snapshot.docs.entries()]
    .filter(
      ([path]) =>
        path.startsWith('users/') ||
        path.startsWith('participants/') ||
        path.startsWith('participant_management/') ||
        path.startsWith('participant_management_active_owner/')
    )
    .map(([path, document]) => [path, document.data] as const);
}

function seedProvisionedTestIdentity(input: {
  readonly participantSessionId?: string;
  readonly omitParticipantSession?: boolean;
  readonly includeDependent?: boolean;
  readonly profileDisplayName?: string;
  readonly omitSelf?: boolean;
} = {}) {
  const seeded = seedExistingSelf({
    displayName: 'Provisioned Self',
    profileDisplayName: input.profileDisplayName ?? 'Provisioned Self',
    ...(input.includeDependent
      ? {
          dependent: {
            participantId: dependentParticipantId,
            managementId: dependentManagementId,
            displayName: 'Provisioned Dependent',
          },
        }
      : {}),
  });
  const account = seeded.docs[`users/${accountId}`]!;
  account.dataScope = 'test';
  delete account.testSessionId;

  if (input.omitSelf) {
    delete seeded.docs[`participants/${seeded.existingParticipantId}`];
    delete seeded.docs[`participant_management/${seeded.existingManagementId}`];
    delete seeded.docs[`participant_management_active_owner/${seeded.existingParticipantId}`];
  } else {
    const participant = seeded.docs[`participants/${seeded.existingParticipantId}`]!;
    participant.dataScope = 'test';
    if (input.omitParticipantSession) {
      delete participant.testSessionId;
    } else {
      participant.testSessionId = input.participantSessionId ?? testSessionId;
    }
  }

  if (input.includeDependent) {
    const dependent = seeded.docs[`participants/${dependentParticipantId}`]!;
    dependent.dataScope = 'test';
    dependent.testSessionId = testSessionId;
  }

  return seeded;
}

function scopeStore(input: {
  readonly actor?: boolean;
  readonly assignment?: boolean;
  readonly status?: TestSessionStatus;
}): CanonicalExecutionScopeStore {
  const audit = {
    createdByCommandId: scopeCommandId,
    lastChangedByCommandId: scopeCommandId,
    correlationId,
  };
  return {
    async readTestActor() {
      if (!input.actor) return undefined;
      return {
        accountId,
        participantIds: [ParticipantIdSchema.parse('participant_existing_self_unit')],
        kind: 'test_parent',
        allowed: true,
        dataScope: 'test',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      };
    },
    async readTestActorAssignment() {
      if (!input.assignment) return undefined;
      return {
        accountId,
        activeTestSessionId: testSessionId,
        revision: 1,
        updatedAt: decidedAt,
        audit,
      };
    },
    async readTestSession() {
      return {
        testSessionId,
        schemaVersion: 1,
        status: input.status ?? 'active',
        label: 'Provision fixture',
        createdByAccountId: accountId,
        config: { startingBalanceKzt: 0, clonedCourseIds: [] },
        inventoryRevision: 0,
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      };
    },
  };
}

describe('TestActor provision_self_participant existing identity', () => {
  it('resolves an assigned TestActor with a provisioned TEST self Participant and does not mutate identity', async () => {
    const seeded = seedProvisionedTestIdentity({ includeDependent: true, profileDisplayName: 'Drifted Name' });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const before = identityDocuments(executor.snapshot());

    const scope = await resolveCanonicalExecutionScope(
      scopeStore({ actor: true, assignment: true, status: 'active' }),
      { accountId, accountLifecycleStatus: 'active', isAdministrator: false }
    );
    expect(scope).toEqual(testScope);

    const result = await commands(executor, testScope).execute(
      envelope('provision-self-participant-v2')
    );
    expect(result).toMatchObject({ status: 'success' });
    expect(result).not.toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden' },
    });
    expect(identityDocuments(executor.snapshot())).toEqual(before);
    expect(
      executor.snapshot().docs.get(`participants/${seeded.existingParticipantId}`)?.data
    ).toMatchObject({
      dataScope: 'test',
      testSessionId,
      displayName: 'Provisioned Self',
    });
    expect(executor.snapshot().docs.get(`users/${accountId}`)?.data).toMatchObject({
      dataScope: 'test',
      displayName: 'Drifted Name',
    });
    expect(executor.snapshot().docs.get(`users/${accountId}`)?.data.testSessionId).toBeUndefined();
    expect(
      executor.snapshot().docs.get(`participants/${dependentParticipantId}`)?.data.displayName
    ).toBe('Provisioned Dependent');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('participants/'))
    ).toHaveLength(2);
  });

  it('fails closed when the assigned TestActor has no self Participant', async () => {
    const seeded = seedProvisionedTestIdentity({ omitSelf: true });
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const result = await commands(executor, testScope).execute(envelope('provision-test-missing-01'));
    expect(result).toMatchObject({
      status: 'error',
      error: {
        code: 'blocked_relationship',
        details: { resourceKind: 'participant', reason: 'conflict' },
      },
    });
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('participants/'))
    ).toHaveLength(0);
  });

  it('fails closed when the self Participant is missing its session or belongs to another session', async () => {
    const malformed = seedProvisionedTestIdentity({ omitParticipantSession: true });
    const malformedExecutor = createInMemoryCanonicalTransactionExecutor(malformed.docs);
    const malformedResult = await commands(malformedExecutor, testScope).execute(
      envelope('provision-test-malformed-01')
    );
    expect(malformedResult).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'malformed' } },
    });

    const crossSession = seedProvisionedTestIdentity({ participantSessionId: otherSessionId });
    const crossExecutor = createInMemoryCanonicalTransactionExecutor(crossSession.docs);
    const crossResult = await commands(crossExecutor, testScope).execute(
      envelope('provision-test-cross-session-01')
    );
    expect(crossResult).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'conflict' } },
    });
    expect(crossExecutor.snapshot().docs.get(`users/${accountId}`)?.data.dataScope).toBe('test');
    expect(
      crossExecutor.snapshot().docs.get(`participants/${crossSession.existingParticipantId}`)?.data
        .testSessionId
    ).toBe(otherSessionId);
  });

  it('does not reach provisioning when the TestActor has no assignment or an inactive session', async () => {
    await expect(
      resolveCanonicalExecutionScope(scopeStore({ actor: true, assignment: false }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'TEST_ACTOR_NO_SESSION' }));

    await expect(
      resolveCanonicalExecutionScope(
        scopeStore({ actor: true, assignment: true, status: 'locked' }),
        { accountId, accountLifecycleStatus: 'active', isAdministrator: false }
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'TEST_SESSION_NOT_ACTIVE' }));
  });

  it('keeps the public idempotency key in separate LIVE and TEST namespaces', () => {
    const actorScope = encodeCommandActorScope(accountCommandActor(accountId));
    const publicKey = 'provision-self-participant-v2';
    expect(deriveCommandKey(actorScope, publicKey, { dataScope: 'live' })).not.toBe(
      deriveCommandKey(actorScope, publicKey, testScope)
    );
  });

  it('follows login order: assigned scope, existing identity, then starter-credit no-op', async () => {
    const seeded = seedProvisionedTestIdentity({ includeDependent: true });
    const wallet = {
      accountId,
      dataScope: 'test',
      testSessionId,
      currency: 'KZT',
      balance: 100_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    };
    const marker = { granted: true, amountKzt: 0 };
    seeded.docs[`users/${accountId}/wallet/state`] = wallet;
    seeded.docs[`users/${accountId}/wallet/starter_credit_grant`] = marker;
    seeded.docs['monetary_events/monetary_event_login_seed'] = { eventKind: 'wallet_credit' };
    seeded.docs['settings/starter_credit'] = { amountKzt: 250 };
    const executor = createInMemoryCanonicalTransactionExecutor(seeded.docs);
    const scope = await resolveCanonicalExecutionScope(
      scopeStore({ actor: true, assignment: true, status: 'active' }),
      { accountId, accountLifecycleStatus: 'active', isAdministrator: false }
    );
    expect(scope).toEqual({ dataScope: 'test', testSessionId });

    const provision = await commands(executor, testScope).execute(
      envelope('provision-self-participant-v2')
    );
    expect(provision.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`participants/${seeded.existingParticipantId}`)?.data
    ).toMatchObject({ dataScope: 'test', testSessionId, displayName: 'Provisioned Self' });

    const grant = await commands(executor, testScope).execute({
      kind: 'grant_starter_credit',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'grant-starter-credit-v1',
        correlationId,
        source: 'client_callable',
      },
      intent: {},
    });
    expect(grant).toMatchObject({ status: 'success' });
    expect(executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data).toEqual(wallet);
    expect(
      executor.snapshot().docs.get(`users/${accountId}/wallet/starter_credit_grant`)?.data
    ).toEqual(marker);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/'))
    ).toEqual(['monetary_events/monetary_event_login_seed']);
    expect(executor.snapshot().docs.get('settings/starter_credit')?.data).toEqual({
      amountKzt: 250,
    });
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('participants/'))
    ).toHaveLength(2);
  });
});
