import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  ParticipantIdSchema,
  TestActorAssignmentSchema,
  TestActorSchema,
  TestSessionIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  testCanonicalExecutionScope,
  timestampFromDate,
  type Account,
  type AccountId,
  type TestSessionId,
} from '@ski-academy/shared-domain';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { scopeCanonicalTransactionSession } from '../transactions/scopedCanonicalTransaction';
import {
  CanonicalExecutionScopeError,
  resolveCanonicalExecutionScope,
  type CanonicalExecutionScopeStore,
} from './canonicalExecutionScopeResolver';
import { assertPayerAccountAuthority } from './persistentTestAccountAuthority';

const correlationId = CorrelationIdSchema.parse('correlation_payer_authority_01');
const accountId = AccountIdSchema.parse('account_payer_authority_01');
const sessionId = TestSessionIdSchema.parse('test_payer_authority_a01');
const otherSessionId = TestSessionIdSchema.parse('test_payer_authority_b01');
const participantId = ParticipantIdSchema.parse('participant_payer_authority_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const commandId = CommandIdSchema.parse('command_payer_authority_01');
const audit = {
  createdByCommandId: commandId,
  lastChangedByCommandId: commandId,
  correlationId,
};

function account(scope?: { dataScope: 'test' | 'live'; testSessionId?: TestSessionId }): Account {
  return AccountSchema.parse({
    accountId,
    ...(scope ?? {}),
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
  });
}

function actor(allowed = true) {
  return TestActorSchema.parse({
    accountId,
    participantIds: [participantId],
    kind: 'test_parent',
    allowed,
    dataScope: 'test',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
  });
}

function assignment(activeTestSessionId: TestSessionId | null) {
  return TestActorAssignmentSchema.parse({
    accountId,
    activeTestSessionId,
    revision: 1,
    updatedAt: decidedAt,
    audit,
  });
}

async function assertAuthority(
  persisted: Account,
  docs: Record<string, Record<string, unknown>> = {},
  scope = testCanonicalExecutionScope(sessionId)
): Promise<void> {
  const executor = createInMemoryCanonicalTransactionExecutor(docs);
  await executor.runAtomic({
    correlationId,
    run: async (baseSession) => {
      const session = scopeCanonicalTransactionSession(baseSession, scope);
      await assertPayerAccountAuthority({
        session,
        correlationId,
        accountId,
        account: persisted,
      });
    },
  });
}

async function expectConflict(
  persisted: Account,
  docs: Record<string, Record<string, unknown>> = {}
): Promise<void> {
  await expect(assertAuthority(persisted, docs)).rejects.toEqual(
    expect.objectContaining({
      name: 'CanonicalCommandError',
      code: 'cross_scope_forbidden',
      details: { reason: 'conflict' },
    })
  );
}

describe('assertPayerAccountAuthority', () => {
  it('accepts a sessionless TEST account when the registry and assignment match', async () => {
    const persisted = account({ dataScope: 'test' });
    expect(persisted.testSessionId).toBeUndefined();
    await assertAuthority(persisted, {
      [`test_actors/${accountId}`]: actor(),
      [`test_actor_assignments/${accountId}`]: assignment(sessionId),
    });
  });

  it('rejects a sessionless TEST account with no TestActor registry', async () => {
    await expectConflict(account({ dataScope: 'test' }), {
      [`test_actor_assignments/${accountId}`]: assignment(sessionId),
    });
  });

  it('rejects a TestActor with allowed=false', async () => {
    await expectConflict(account({ dataScope: 'test' }), {
      [`test_actors/${accountId}`]: actor(false),
      [`test_actor_assignments/${accountId}`]: assignment(sessionId),
    });
  });

  it('rejects an assignment to another session', async () => {
    await expectConflict(account({ dataScope: 'test' }), {
      [`test_actors/${accountId}`]: actor(),
      [`test_actor_assignments/${accountId}`]: assignment(otherSessionId),
    });
  });

  it('rejects an unassigned TestActor', async () => {
    await expectConflict(account({ dataScope: 'test' }), {
      [`test_actors/${accountId}`]: actor(),
      [`test_actor_assignments/${accountId}`]: assignment(null),
    });
  });

  it('keeps a stamped testSessionId on the strict path', async () => {
    const matching = account({ dataScope: 'test', testSessionId: sessionId });
    await assertAuthority(matching);
    expect(matching.testSessionId).toBe(sessionId);

    const mismatched = account({ dataScope: 'test', testSessionId: otherSessionId });
    await expectConflict(mismatched, {
      [`test_actors/${accountId}`]: actor(),
      [`test_actor_assignments/${accountId}`]: assignment(sessionId),
    });
    expect(mismatched.testSessionId).toBe(otherSessionId);
  });

  it('accepts a LIVE account under LIVE scope without a TestActor lookup', async () => {
    await assertAuthority(account(), {}, LIVE_CANONICAL_EXECUTION_SCOPE);
    await assertAuthority(
      account({ dataScope: 'live' }),
      { [`test_actors/${accountId}`]: actor(false) },
      LIVE_CANONICAL_EXECUTION_SCOPE
    );
  });
});

describe('persistent TestActor command entry', () => {
  const resolverAccountId = AccountIdSchema.parse('account_payer_resolver_01');

  function store(input: {
    actor?: Record<string, unknown>;
    assignment?: Record<string, unknown>;
    session?: Record<string, unknown>;
  }): CanonicalExecutionScopeStore {
    return {
      async readTestActor(id: AccountId) {
        return id === resolverAccountId ? input.actor : undefined;
      },
      async readTestActorAssignment(id: AccountId) {
        return id === resolverAccountId ? input.assignment : undefined;
      },
      async readTestSession() {
        return input.session;
      },
    };
  }

  it('fails closed when a TestActor has no assignment', async () => {
    await expect(
      resolveCanonicalExecutionScope(
        store({
          actor: {
            ...actor(),
            accountId: resolverAccountId,
          },
        }),
        {
          accountId: resolverAccountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
        }
      )
    ).rejects.toBeInstanceOf(CanonicalExecutionScopeError);
    await expect(
      resolveCanonicalExecutionScope(
        store({
          actor: {
            ...actor(),
            accountId: resolverAccountId,
          },
        }),
        {
          accountId: resolverAccountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
        }
      )
    ).rejects.toMatchObject({ code: 'TEST_ACTOR_NO_SESSION' });
  });

  it('fails closed when the assigned TestSession is inactive', async () => {
    await expect(
      resolveCanonicalExecutionScope(
        store({
          actor: { ...actor(), accountId: resolverAccountId },
          assignment: { ...assignment(sessionId), accountId: resolverAccountId },
          session: {
            testSessionId: sessionId,
            schemaVersion: 1,
            status: 'locked',
            label: 'Inactive payer session',
            createdByAccountId: resolverAccountId,
            config: { startingBalanceKzt: 100_000, clonedCourseIds: [] },
            inventoryRevision: 0,
            revision: 1,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit,
          },
        }),
        {
          accountId: resolverAccountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
        }
      )
    ).rejects.toMatchObject({ code: 'TEST_SESSION_NOT_ACTIVE' });
  });
});
