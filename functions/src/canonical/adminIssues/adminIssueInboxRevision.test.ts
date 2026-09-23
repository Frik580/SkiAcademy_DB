import { describe, expect, it } from 'vitest';
import {
  CorrelationIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  TestSessionIdSchema,
  testCanonicalExecutionScope,
  timestampFromDate,
  type AdminIssue,
  type AdminIssueInboxRevisionReason,
  type CanonicalExecutionScope,
} from '@ski-academy/shared-domain';
import {
  adminIssueInboxRevisionPath,
  commitAdminIssueInboxRevisionBump,
  planAdminIssueInboxRevisionBump,
  planAdminIssueLifecycleMutation,
} from './adminIssueInboxRevision';
import {
  createInMemoryCanonicalTransactionExecutor,
  type CanonicalAtomicTransactionSession,
} from '../transactions';
import { scopeCanonicalTransactionSession } from '../transactions/scopedCanonicalTransaction';

const correlationId = CorrelationIdSchema.parse('correlation_admin_issue_inbox_revision_01');
const now = timestampFromDate(new Date('2026-01-16T10:00:00.000Z'));
const testScope = testCanonicalExecutionScope(
  TestSessionIdSchema.parse('test_session_admin_issue_inbox_01')
);

function issueStub(input: {
  readonly issueId: string;
  readonly status: AdminIssue['lifecycle']['status'];
  readonly revision?: number;
}): AdminIssue {
  return {
    issueId: input.issueId,
    revision: input.revision ?? 1,
    lifecycle: { status: input.status },
    updatedAt: now,
  } as AdminIssue;
}

async function runWithScope<T>(
  scope: CanonicalExecutionScope | undefined,
  seed: Record<string, unknown> | undefined,
  run: (session: CanonicalAtomicTransactionSession) => Promise<T>
): Promise<{ result: T; executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor> }> {
  const executor = createInMemoryCanonicalTransactionExecutor(
    seed === undefined ? undefined : { [adminIssueInboxRevisionPath()]: seed }
  );
  const result = await executor.runAtomic({
    correlationId,
    run: async (baseSession) => {
      const session =
        scope === undefined ? baseSession : scopeCanonicalTransactionSession(baseSession, scope);
      return run(session);
    },
  });
  return { result, executor };
}

describe('admin issue inbox revision bump', () => {
  it('creates the signal document on first inbox-relevant mutation', async () => {
    const { result, executor } = await runWithScope(undefined, undefined, async (session) => {
      await planAdminIssueInboxRevisionBump(session, 'created');
      await session.transitionToWrites();
      return commitAdminIssueInboxRevisionBump(session, now)?.inboxRevision;
    });
    expect(result).toBe(1);
    expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });
  });

  it('increments once per transaction for create/resolve/reopen', async () => {
    const { executor } = await runWithScope(
      undefined,
      { revision: 10, updatedAt: now },
      async (session) => {
        await planAdminIssueInboxRevisionBump(session, 'resolved');
        await planAdminIssueInboxRevisionBump(session, 'reopened');
        await session.transitionToWrites();
        return commitAdminIssueInboxRevisionBump(session, now);
      }
    );
    expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data.revision).toBe(11);
  });

  it('does not write when no inbox-relevant mutation was planned', async () => {
    const { result, executor } = await runWithScope(undefined, undefined, async (session) => {
      await session.transitionToWrites();
      return commitAdminIssueInboxRevisionBump(session, now);
    });
    expect(result).toBeUndefined();
    expect(executor.snapshot().docs.has(adminIssueInboxRevisionPath())).toBe(false);
  });

  it.each(['created', 'resolved', 'reopened'] as const)(
    'LIVE scope %s still bumps shared admin_issue_inbox',
    async (reason: AdminIssueInboxRevisionReason) => {
      const { result, executor } = await runWithScope(
        LIVE_CANONICAL_EXECUTION_SCOPE,
        { revision: 4, updatedAt: now },
        async (session) => {
          await planAdminIssueInboxRevisionBump(session, reason);
          await session.transitionToWrites();
          return commitAdminIssueInboxRevisionBump(session, now);
        }
      );
      expect(result?.inboxRevision).toBe(5);
      expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data.revision).toBe(5);
    }
  );

  it.each([
    ['created', undefined, 'open'],
    ['resolved', 'open', 'resolved'],
    ['reopened', 'resolved', 'open'],
  ] as const)(
    'LIVE lifecycle %s still bumps via planAdminIssueLifecycleMutation',
    async (_reason, previousStatus, nextStatus) => {
      const { result, executor } = await runWithScope(
        LIVE_CANONICAL_EXECUTION_SCOPE,
        { revision: 4, updatedAt: now },
        async (session) => {
          await planAdminIssueLifecycleMutation(session, {
            previous:
              previousStatus === undefined
                ? undefined
                : issueStub({ issueId: 'issue_live_inbox_01', status: previousStatus }),
            issue: issueStub({
              issueId: 'issue_live_inbox_01',
              status: nextStatus,
              revision: 2,
            }),
            mutationKind: previousStatus === undefined ? 'create' : 'update',
            documentPath: 'admin_issues/issue_live_inbox_01',
          });
          await session.transitionToWrites();
          return commitAdminIssueInboxRevisionBump(session, now);
        }
      );
      expect(result?.inboxRevision).toBe(5);
      expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data.revision).toBe(5);
    }
  );

  it.each(['created', 'resolved', 'reopened'] as const)(
    'TEST scope %s does not bump live admin_issue_inbox',
    async (reason: AdminIssueInboxRevisionReason) => {
      const { result, executor } = await runWithScope(
        testScope,
        { revision: 7, updatedAt: now },
        async (session) => {
          await planAdminIssueInboxRevisionBump(session, reason);
          await session.transitionToWrites();
          return commitAdminIssueInboxRevisionBump(session, now);
        }
      );
      expect(result).toBeUndefined();
      expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data.revision).toBe(7);
    }
  );

  it.each([
    ['created', undefined, 'open'],
    ['resolved', 'open', 'resolved'],
    ['reopened', 'resolved', 'open'],
  ] as const)(
    'TEST lifecycle %s does not schedule or commit live inbox bump',
    async (_reason, previousStatus, nextStatus) => {
      const { result, executor } = await runWithScope(
        testScope,
        { revision: 9, updatedAt: now },
        async (session) => {
          await planAdminIssueLifecycleMutation(session, {
            previous:
              previousStatus === undefined
                ? undefined
                : issueStub({ issueId: 'issue_test_inbox_01', status: previousStatus }),
            issue: issueStub({
              issueId: 'issue_test_inbox_01',
              status: nextStatus,
              revision: 2,
            }),
            mutationKind: previousStatus === undefined ? 'create' : 'update',
            documentPath: 'admin_issues/issue_test_inbox_01',
          });
          await session.transitionToWrites();
          return commitAdminIssueInboxRevisionBump(session, now);
        }
      );
      expect(result).toBeUndefined();
      expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data.revision).toBe(9);
    }
  );
});
