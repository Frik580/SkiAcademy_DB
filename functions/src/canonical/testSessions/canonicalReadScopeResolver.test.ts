import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CommandIdSchema,
  LIVE_CANONICAL_READ_SCOPE,
  ParticipantIdSchema,
  TestSessionIdSchema,
  timestampFromDate,
  type AccountId,
  type TestSessionId,
  type TestSessionStatus,
} from '@ski-academy/shared-domain';
import {
  CanonicalExecutionScopeError,
  type CanonicalExecutionScopeStore,
} from './canonicalExecutionScopeResolver';
import { resolveCanonicalReadScope } from './canonicalReadScopeResolver';

const at = timestampFromDate(new Date('2026-09-21T00:00:00.000Z'));
const accountId = AccountIdSchema.parse('account_read_scope_01');
const testSessionId = TestSessionIdSchema.parse('test_read_scope_01');
const otherSessionId = TestSessionIdSchema.parse('test_read_scope_02');
const commandId = CommandIdSchema.parse('command_read_scope_01');
const audit = {
  createdByCommandId: commandId,
  lastChangedByCommandId: commandId,
  correlationId: 'correlation_read_scope_01',
};

function session(id: TestSessionId, status: TestSessionStatus): Record<string, unknown> {
  return {
    testSessionId: id,
    schemaVersion: 1,
    status,
    label: 'Read scope fixture',
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

describe('resolveCanonicalReadScope', () => {
  it('resolves an ordinary customer to LIVE without using email', async () => {
    await expect(
      resolveCanonicalReadScope(store(), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
      })
    ).resolves.toEqual(LIVE_CANONICAL_READ_SCOPE);
  });

  it('resolves a live admin without Test context to LIVE', async () => {
    await expect(
      resolveCanonicalReadScope(store(), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
      })
    ).resolves.toEqual(LIVE_CANONICAL_READ_SCOPE);
  });

  it('resolves a live admin with a validated active TestSession to product TEST', async () => {
    await expect(
      resolveCanonicalReadScope(store({ session: session(testSessionId, 'active') }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
        requestedTestSessionId: testSessionId,
      })
    ).resolves.toEqual({
      dataScope: 'test',
      testSessionId,
      purpose: 'product_test',
    });
  });

  it('rejects a TestActor whose assigned session is not active', async () => {
    await expect(
      resolveCanonicalReadScope(
        store({
          actor: actor(accountId),
          assignment: assignment(accountId, testSessionId),
          session: session(testSessionId, 'closed'),
        }),
        {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
        }
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'TEST_SESSION_NOT_ACTIVE' }));
  });

  it('resolves a TestActor assignment to TEST and ignores email', async () => {
    await expect(
      resolveCanonicalReadScope(
        store({
          actor: actor(accountId),
          assignment: assignment(accountId, testSessionId),
          session: session(testSessionId, 'active'),
        }),
        {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
        }
      )
    ).resolves.toEqual({
      dataScope: 'test',
      testSessionId,
      purpose: 'product_test',
    });
  });

  it('fails closed for a TestActor without assignment', async () => {
    await expectScopeError(
      resolveCanonicalReadScope(store({ actor: actor(accountId) }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
      }),
      'TEST_ACTOR_NO_SESSION'
    );
  });

  it('does not let a TestActor request another session', async () => {
    await expectScopeError(
      resolveCanonicalReadScope(
        store({
          actor: actor(accountId),
          assignment: assignment(accountId, testSessionId),
          session: session(testSessionId, 'active'),
        }),
        {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
          requestedTestSessionId: otherSessionId,
        }
      ),
      'TEST_ACTOR_REQUEST_FORBIDDEN'
    );
  });

  it('resolves guest/public callers to LIVE', async () => {
    await expect(
      resolveCanonicalReadScope(store(), {
        isAdministrator: false,
      })
    ).resolves.toEqual(LIVE_CANONICAL_READ_SCOPE);
  });

  it('forbids guest/public callers from requesting a TestSession', async () => {
    await expectScopeError(
      resolveCanonicalReadScope(store(), {
        isAdministrator: false,
        requestedTestSessionId: testSessionId,
      }),
      'TEST_SESSION_FORBIDDEN'
    );
  });

  it('allows maintenance admin reads of a non-active session', async () => {
    await expect(
      resolveCanonicalReadScope(store({ session: session(testSessionId, 'resetting') }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
        requestedTestSessionId: testSessionId,
        purpose: 'maintenance',
      })
    ).resolves.toEqual({
      dataScope: 'test',
      testSessionId,
      purpose: 'maintenance_test',
    });
  });

  it('rejects product reads of a resetting session', async () => {
    await expect(
      resolveCanonicalReadScope(store({ session: session(testSessionId, 'resetting') }), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
        requestedTestSessionId: testSessionId,
        purpose: 'product',
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'TEST_SESSION_NOT_ACTIVE' }));
  });

  it('forbids ordinary customers from requesting Test context', async () => {
    await expectScopeError(
      resolveCanonicalReadScope(store(), {
        accountId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
        requestedTestSessionId: testSessionId,
      }),
      'TEST_SESSION_FORBIDDEN'
    );
  });
});

describe('CanonicalExecutionScopeError remains the read-scope error type', () => {
  it('stays a typed error', () => {
    expect(new CanonicalExecutionScopeError('TEST_SESSION_FORBIDDEN').name).toBe(
      'CanonicalExecutionScopeError'
    );
  });
});
