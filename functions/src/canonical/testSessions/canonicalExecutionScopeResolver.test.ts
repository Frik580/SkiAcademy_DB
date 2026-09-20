import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CommandIdSchema,
  ParticipantIdSchema,
  TestSessionIdSchema,
  timestampFromDate,
  type AccountId,
  type TestSessionId,
  type TestSessionStatus,
} from '@ski-academy/shared-domain';
import {
  CanonicalExecutionScopeError,
  resolveCanonicalExecutionScope,
  type CanonicalExecutionScopeStore,
} from './canonicalExecutionScopeResolver';

const at = timestampFromDate(new Date('2026-09-20T00:00:00.000Z'));
const accountId = AccountIdSchema.parse('account_scope_resolver_01');
const testSessionId = TestSessionIdSchema.parse('test_scope_resolver_01');
const commandId = CommandIdSchema.parse('command_scope_resolver_01');
const audit = {
  createdByCommandId: commandId,
  lastChangedByCommandId: commandId,
  correlationId: 'correlation_scope_resolver_01',
};

function session(id: TestSessionId, status: TestSessionStatus): Record<string, unknown> {
  return {
    testSessionId: id,
    schemaVersion: 1,
    status,
    label: 'Resolver fixture',
    createdByAccountId: accountId,
    config: { startingBalanceKzt: 0, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit,
  };
}

function actor(id: AccountId, allowed = true): Record<string, unknown> {
  return {
    accountId: id,
    participantIds: [ParticipantIdSchema.parse(`participant_${id}`)],
    kind: 'test_parent',
    allowed,
    dataScope: 'test',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit,
  };
}

function assignment(id: AccountId, activeTestSessionId: TestSessionId | null) {
  return { accountId: id, activeTestSessionId, revision: 1, updatedAt: at, audit };
}

function store(
  input: {
    actor?: Record<string, unknown>;
    assignment?: Record<string, unknown>;
    session?: Record<string, unknown>;
  } = {}
): CanonicalExecutionScopeStore {
  return {
    async readTestActor() {
      return input.actor;
    },
    async readTestActorAssignment() {
      return input.assignment;
    },
    async readTestSession() {
      return input.session;
    },
  };
}

async function expectScopeError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toEqual(
    expect.objectContaining({ name: expect.any(String), code })
  );
}

describe('resolveCanonicalExecutionScope', () => {
  it('resolves an ordinary live user to LIVE without using email as authority', async () => {
    const syntheticAccount = {
      accountId,
      email: 'person@test.ru',
      accountLifecycleStatus: 'active' as const,
      isAdministrator: false,
    };
    await expect(resolveCanonicalExecutionScope(store(), syntheticAccount)).resolves.toEqual({
      dataScope: 'live',
    });
  });

  it('resolves a live admin without requested context to LIVE', async () => {
    await expect(
      resolveCanonicalExecutionScope(store(), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
      })
    ).resolves.toEqual({ dataScope: 'live' });
  });

  it('allows an active live admin to request an active TestSession', async () => {
    await expect(
      resolveCanonicalExecutionScope(store({ session: session(testSessionId, 'active') }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
        requestedTestSessionId: testSessionId,
      })
    ).resolves.toEqual({ dataScope: 'test', testSessionId });
  });

  it.each(['closed', 'resetting', 'deleting'] as const)(
    'rejects a live admin request for a %s TestSession',
    async (status) => {
      await expectScopeError(
        resolveCanonicalExecutionScope(store({ session: session(testSessionId, status) }), {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: true,
          requestedTestSessionId: testSessionId,
        }),
        'TEST_SESSION_NOT_ACTIVE'
      );
    }
  );

  it('forbids an ordinary live customer from requesting Test context', async () => {
    await expectScopeError(
      resolveCanonicalExecutionScope(store(), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
        requestedTestSessionId: testSessionId,
      }),
      'TEST_SESSION_FORBIDDEN'
    );
  });

  it('resolves a registry-backed actor with a normal email through assignment', async () => {
    const syntheticAccount = {
      accountId,
      email: 'person@example.com',
      accountLifecycleStatus: 'active' as const,
      isAdministrator: false,
    };
    await expect(
      resolveCanonicalExecutionScope(
        store({
          actor: actor(accountId),
          assignment: assignment(accountId, testSessionId),
          session: session(testSessionId, 'active'),
        }),
        syntheticAccount
      )
    ).resolves.toEqual({ dataScope: 'test', testSessionId });
  });

  it('rejects a TestActor without assignment instead of falling back to LIVE', async () => {
    await expectScopeError(
      resolveCanonicalExecutionScope(store({ actor: actor(accountId) }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
      }),
      'TEST_ACTOR_NO_SESSION'
    );
  });

  it('rejects a TestActor assigned to an inactive session', async () => {
    await expectScopeError(
      resolveCanonicalExecutionScope(
        store({
          actor: actor(accountId),
          assignment: assignment(accountId, testSessionId),
          session: session(testSessionId, 'locked'),
        }),
        { accountId, accountLifecycleStatus: 'active', isAdministrator: false }
      ),
      'TEST_SESSION_NOT_ACTIVE'
    );
  });

  it('rejects malformed requestedTestSessionId', async () => {
    await expectScopeError(
      resolveCanonicalExecutionScope(store(), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
        requestedTestSessionId: 'bad/session',
      }),
      'TEST_SESSION_ID_INVALID'
    );
  });

  it('fails closed for a disabled registry-backed TestActor', async () => {
    await expectScopeError(
      resolveCanonicalExecutionScope(store({ actor: actor(accountId, false) }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
      }),
      'TEST_ACTOR_DISABLED'
    );
  });

  it('does not let a TestActor override its server-owned assignment', async () => {
    await expectScopeError(
      resolveCanonicalExecutionScope(store({ actor: actor(accountId) }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
        requestedTestSessionId: testSessionId,
      }),
      'TEST_ACTOR_REQUEST_FORBIDDEN'
    );
  });

  it('exports a stable typed scope error', () => {
    expect(new CanonicalExecutionScopeError('TEST_ACTOR_NO_SESSION').code).toBe(
      'TEST_ACTOR_NO_SESSION'
    );
  });
});
