import {
  AggregateRevisionSchema,
  adminIssueInboxRevisionReason,
  canonicalPaths,
  type AdminIssue,
  type AdminIssueInboxRevisionReason,
  type AggregateRevision,
  type AttendanceAdminIssueResultPayload,
  type CanonicalTimestamp,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  toFirestoreWritePayload,
  toTransactionPath,
} from './adminIssueStore';

export const ADMIN_ISSUE_INBOX_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminIssueInboxRevisionCommitResult {
  readonly inboxRevision: AggregateRevision;
  readonly resolvedAdminIssueIds: readonly AdminIssue['issueId'][];
  readonly openedAdminIssueIds: readonly AdminIssue['issueId'][];
}

interface PendingInboxRevisionBump {
  reason: AdminIssueInboxRevisionReason;
  readonly currentRevision: number;
  readonly exists: boolean;
  readonly resolvedAdminIssueIds: AdminIssue['issueId'][];
  readonly openedAdminIssueIds: AdminIssue['issueId'][];
}

const pendingBumps = new WeakMap<CanonicalAtomicTransactionSession, PendingInboxRevisionBump>();

/**
 * Issue Inbox is a single LIVE admin signal. TestSession transactions must not
 * read or write it. A missing scope is legacy LIVE, matching command execution.
 */
function mayBumpAdminIssueInboxRevision(session: CanonicalAtomicTransactionSession): boolean {
  return session.scope?.dataScope !== 'test';
}

function untrackedInboxRevisionBump(
  reason: AdminIssueInboxRevisionReason
): PendingInboxRevisionBump {
  return {
    reason,
    currentRevision: 0,
    exists: false,
    resolvedAdminIssueIds: [],
    openedAdminIssueIds: [],
  };
}

export function adminIssueInboxRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminIssueInboxRevision());
}

export async function planAdminIssueInboxRevisionBump(
  session: CanonicalAtomicTransactionSession,
  reason: AdminIssueInboxRevisionReason
): Promise<PendingInboxRevisionBump> {
  if (!mayBumpAdminIssueInboxRevision(session)) {
    return untrackedInboxRevisionBump(reason);
  }
  const existing = pendingBumps.get(session);
  if (existing) {
    existing.reason = reason;
    return existing;
  }
  const documentPath = adminIssueInboxRevisionPath();
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'other' });
  const currentRevision =
    typeof read.data?.revision === 'number' && Number.isFinite(read.data.revision)
      ? read.data.revision
      : 0;
  session.plan.planMutation({
    path: documentPath,
    kind: read.exists ? 'update' : 'create',
    category: 'other',
    estimatedPayloadBytes: ADMIN_ISSUE_INBOX_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  const pending: PendingInboxRevisionBump = {
    reason,
    currentRevision,
    exists: read.exists,
    resolvedAdminIssueIds: [],
    openedAdminIssueIds: [],
  };
  pendingBumps.set(session, pending);
  return pending;
}

export function commitAdminIssueInboxRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminIssueInboxRevisionCommitResult | undefined {
  if (!mayBumpAdminIssueInboxRevision(session)) {
    pendingBumps.delete(session);
    return undefined;
  }
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminIssueInboxRevisionPath();
  const payload = {
    revision: nextRevision,
    updatedAt: now,
  };
  if (pending.exists) {
    session.tx.update({ path: documentPath }, payload);
  } else {
    session.tx.create({ path: documentPath }, payload);
  }
  console.info(
    JSON.stringify({
      event: 'admin_issue_inbox_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
      reason: pending.reason,
    })
  );
  return {
    inboxRevision: nextRevision,
    resolvedAdminIssueIds: pending.resolvedAdminIssueIds,
    openedAdminIssueIds: pending.openedAdminIssueIds,
  };
}

export async function planAdminIssueLifecycleMutation(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly previous: AdminIssue | undefined;
    readonly issue: AdminIssue;
    readonly mutationKind: 'create' | 'update';
    readonly documentPath: string;
  }
): Promise<void> {
  session.plan.planMutation({
    path: input.documentPath,
    kind: input.mutationKind,
    category: 'aggregate',
    estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
  });
  const reason = adminIssueInboxRevisionReason({
    previousStatus: input.previous?.lifecycle.status,
    nextStatus: input.issue.lifecycle.status,
  });
  if (!reason) return;
  const pending = await planAdminIssueInboxRevisionBump(session, reason);
  if (reason === 'resolved') {
    pending.resolvedAdminIssueIds.push(input.issue.issueId);
  } else if (reason === 'created' || reason === 'reopened') {
    pending.openedAdminIssueIds.push(input.issue.issueId);
  }
}

export function commitAdminIssueDocument(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly mutationKind: 'create' | 'update';
    readonly documentPath: string;
    readonly issue: AdminIssue;
  }
): AdminIssueInboxRevisionCommitResult | undefined {
  const payload = toFirestoreWritePayload(input.issue as Record<string, unknown>);
  if (input.mutationKind === 'create') {
    session.tx.create({ path: input.documentPath }, payload);
  } else {
    session.tx.update({ path: input.documentPath }, payload);
  }
  return commitAdminIssueInboxRevisionBump(session, input.issue.updatedAt);
}

export function attendanceAdminIssueResultPayload(
  commit: AdminIssueInboxRevisionCommitResult | undefined
): AttendanceAdminIssueResultPayload | undefined {
  if (!commit) return undefined;
  return {
    resolvedAdminIssueIds: [...commit.resolvedAdminIssueIds],
    ...(commit.openedAdminIssueIds.length > 0
      ? { openedAdminIssueIds: [...commit.openedAdminIssueIds] }
      : {}),
    adminIssueInboxRevision: commit.inboxRevision,
  };
}
