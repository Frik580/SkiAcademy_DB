import {
  administratorCapabilityExercisedByAccount,
  resolveAdminIssue,
  resolveUnresolvedCourseEnrollmentPendingCancellationForOwnerWithdrawal,
  unresolvedCourseEnrollmentPendingCancellationIdentity,
  type AdminIssue,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CorrelationId,
  type CourseEnrollment,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
} from '../adminIssues';

export interface PlannedUnresolvedCourseEnrollmentPendingCancellationResolution {
  readonly issue: AdminIssue;
  readonly documentPath: string;
}

export async function planResolveOpenUnresolvedCourseEnrollmentPendingCancellationIssue(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly enrollment: CourseEnrollment;
    readonly correlationId: CorrelationId;
    readonly commandId: string;
    readonly now: CanonicalTimestamp;
    readonly reason: string;
    readonly envelope: CommandEnvelope;
  }
): Promise<PlannedUnresolvedCourseEnrollmentPendingCancellationResolution | undefined> {
  const identity = unresolvedCourseEnrollmentPendingCancellationIdentity({
    enrollmentId: input.enrollment.enrollmentId,
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
    : resolveUnresolvedCourseEnrollmentPendingCancellationForOwnerWithdrawal(existing, {
        ...resolutionInput,
        enrollmentId: input.enrollment.enrollmentId,
      });

  session.plan.planMutation({
    path: documentPath,
    kind: 'update',
    category: 'aggregate',
    estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
  });

  return { issue: resolved, documentPath };
}

export function commitPlannedCourseEnrollmentAdminIssueUpdate(
  session: CanonicalAtomicTransactionSession,
  planned: PlannedUnresolvedCourseEnrollmentPendingCancellationResolution,
  payloadWriter: (issue: AdminIssue) => Record<string, unknown>
): void {
  session.tx.update({ path: planned.documentPath }, payloadWriter(planned.issue));
}
