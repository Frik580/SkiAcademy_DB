import { describe, expect, it } from 'vitest';
import {
  CorrelationIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  adminIssueInboxRevisionPath,
  commitAdminIssueInboxRevisionBump,
  planAdminIssueInboxRevisionBump,
} from './adminIssueInboxRevision';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_admin_issue_inbox_revision_01');
const now = timestampFromDate(new Date('2026-01-16T10:00:00.000Z'));

describe('admin issue inbox revision bump', () => {
  it('creates the signal document on first inbox-relevant mutation', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminIssueInboxRevisionBump(session, 'created');
        await session.transitionToWrites();
        return commitAdminIssueInboxRevisionBump(session, now)?.inboxRevision;
      },
    });
    expect(revision).toBe(1);
    expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });
  });

  it('increments once per transaction for create/resolve/reopen', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [adminIssueInboxRevisionPath()]: {
        revision: 10,
        updatedAt: now,
      },
    });
    await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminIssueInboxRevisionBump(session, 'resolved');
        await planAdminIssueInboxRevisionBump(session, 'reopened');
        await session.transitionToWrites();
        return commitAdminIssueInboxRevisionBump(session, now);
      },
    });
    expect(executor.snapshot().docs.get(adminIssueInboxRevisionPath())?.data.revision).toBe(11);
  });

  it('does not write when no inbox-relevant mutation was planned', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const result = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await session.transitionToWrites();
        return commitAdminIssueInboxRevisionBump(session, now);
      },
    });
    expect(result).toBeUndefined();
    expect(executor.snapshot().docs.has(adminIssueInboxRevisionPath())).toBe(false);
  });
});
