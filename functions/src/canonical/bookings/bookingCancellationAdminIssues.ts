import {
  administratorCapabilityExercisedByAccount,
  resolveAdminIssue,
  resolveUnresolvedPendingCancellationForOwnerWithdrawal,
  unresolvedPendingCancellationIdentity,
  type AdminIssue,
  type Booking,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CorrelationId,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  commitAdminIssueDocument,
  parseExistingAdminIssueOrCollision,
  planAdminIssueLifecycleMutation,
  plannedAdminIssuePath,
} from '../adminIssues';

export interface PlannedUnresolvedPendingCancellationResolution {
  readonly issue: AdminIssue;
  readonly documentPath: string;
}

export async function planResolveOpenUnresolvedPendingCancellationIssue(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly booking: Booking;
    readonly correlationId: CorrelationId;
    readonly commandId: string;
    readonly now: CanonicalTimestamp;
    readonly reason: string;
    readonly envelope: CommandEnvelope;
  }
): Promise<PlannedUnresolvedPendingCancellationResolution | undefined> {
  const identity = unresolvedPendingCancellationIdentity({
    bookingId: input.booking.bookingId,
    occurrenceId: input.booking.occurrence.occurrenceId,
  });
  const documentPath = plannedAdminIssuePath(identity);
  const issueRead = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  const existing = parseExistingAdminIssueOrCollision(
    input.correlationId,
    issueRead.exists ? issueRead.data : undefined
  );
  if (!existing || existing.lifecycle.status !== 'open') {
    return undefined;
  }

  const actor = {
    actor: input.envelope.context.actor,
    exercisedCapability: input.envelope.context.exercisedCapability,
  };
  const resolutionInput = {
    expectedRevision: existing.revision,
    now: input.now,
    correlationId: input.correlationId,
    commandId: input.commandId,
    reason: input.reason,
    actor,
  };
  const isAdministratorResolution =
    administratorCapabilityExercisedByAccount(input.envelope.context) &&
    input.envelope.context.exercisedCapability === 'administrator';
  const resolved = isAdministratorResolution
    ? resolveAdminIssue(existing, {
        ...resolutionInput,
        coupledDomainCommand: true,
      })
    : resolveUnresolvedPendingCancellationForOwnerWithdrawal(existing, {
        ...resolutionInput,
        bookingId: input.booking.bookingId,
      });

  await planAdminIssueLifecycleMutation(session, {
    previous: existing,
    issue: resolved,
    mutationKind: 'update',
    documentPath,
  });

  return { issue: resolved, documentPath };
}

export function commitPlannedAdminIssueUpdate(
  session: CanonicalAtomicTransactionSession,
  planned: PlannedUnresolvedPendingCancellationResolution
): number | undefined {
  return commitAdminIssueDocument(session, {
    mutationKind: 'update',
    documentPath: planned.documentPath,
    issue: planned.issue,
  })?.inboxRevision;
}
