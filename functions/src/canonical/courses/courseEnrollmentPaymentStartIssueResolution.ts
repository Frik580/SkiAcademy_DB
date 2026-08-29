import {
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  resolveAdminIssueForCoupledReconciliation,
  shouldResolveStalePaymentRequiredAtStartIssue,
  timestampFromDate,
  type AdminIssue,
  type AdminIssueLifecycleActor,
  type CommandId,
  type CorrelationId,
  type Course,
  type CourseEnrollment,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
} from '../adminIssues';

export async function planCourseEnrollmentPaymentStartIssueResolutionIfFullyFunded(input: {
  readonly session: CanonicalAtomicTransactionSession;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly actor: AdminIssueLifecycleActor;
  readonly decidedAt: Date;
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly payment: Payment;
}): Promise<{ readonly issue: AdminIssue; readonly documentPath: string } | undefined> {
  const issueIdentity = paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(
    input.enrollment.enrollmentId
  );
  const documentPath = plannedAdminIssuePath(issueIdentity);
  const issueRead = await input.session.tx.get({ path: documentPath });
  input.session.plan.planRead({ path: documentPath, category: 'aggregate' });
  const existingIssue = parseExistingAdminIssueOrCollision(
    input.correlationId,
    issueRead.exists ? issueRead.data : undefined
  );
  if (
    existingIssue === undefined ||
    existingIssue.lifecycle.status !== 'open' ||
    !shouldResolveStalePaymentRequiredAtStartIssue({
      enrollment: input.enrollment,
      course: input.course,
      payment: input.payment,
      issue: existingIssue,
    })
  ) {
    return undefined;
  }

  const resolved = resolveAdminIssueForCoupledReconciliation(existingIssue, {
    expectedRevision: existingIssue.revision,
    now: timestampFromDate(input.decidedAt),
    correlationId: input.correlationId,
    commandId: input.commandId,
    reason: 'Payment fully funded; payment-start restriction cleared',
    actor: input.actor,
    coupledDomainCommand: true,
  });
  input.session.plan.planMutation({
    path: documentPath,
    kind: 'update',
    category: 'aggregate',
    estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
  });
  return { issue: resolved, documentPath };
}
