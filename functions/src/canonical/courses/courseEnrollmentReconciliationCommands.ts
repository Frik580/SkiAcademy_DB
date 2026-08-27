import {
  CanonicalCommandError,
  CourseEnrollmentSchema,
  assertCourseEnrollmentPaymentIdentity,
  assertExpectedRevision,
  canonicalPaths,
  commandSuccessResult,
  courseDayAttendanceMatchesCurrentOccurrence,
  courseDayOccurrenceId,
  courseEnrollmentResourceReconciliationMismatchIdentity,
  courseEnrollmentReconciliationHasMutations,
  courseScheduleIsComplete,
  evaluateCourseEnrollmentReconciliation,
  missingCourseDayAttendanceIssueIdentity,
  nextAggregateRevision,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  resolveAdminIssueForCoupledReconciliation,
  resolveCommandIdempotencyIdentity,
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  sortedCourseDays,
  timestampFromDate,
  unresolvedCourseEnrollmentPendingCancellationIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  attendanceIdFromCourseDayIdentity,
  type AdminIssue,
  type Attendance,
  type Course,
  type CourseDay,
  type CourseDayId,
  type CourseEnrollment,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
  toFirestoreWritePayload as toAdminIssueWritePayload,
} from '../adminIssues';
import { parsePayment, paymentPath } from '../finance/financeStore';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  commitPlannedCourseEnrollmentClaimRelease,
  planReleaseCourseEnrollmentClaims,
  type PlannedCourseEnrollmentClaimRelease,
} from './courseEnrollmentClaimOperations';
import {
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDays,
} from './courseStore';
import {
  courseEnrollmentPath,
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
  parseCourseEnrollment,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
} from './courseEnrollmentStore';
import { assertReconcileCourseEnrollmentAuthorization } from './courseEnrollmentReconciliationAuthorization';
import { buildReconcileCourseEnrollmentAuditPlan } from './courseEnrollmentReconciliationAudit';
import {
  attendancePath,
  parseAttendance,
} from '../bookings/attendanceStore';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

function metadataFromEnvelope(envelope: CommandEnvelope): CommandMetadata {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

async function readCourseDaysForCourse(
  session: CanonicalAtomicTransactionSession,
  course: Course
): Promise<CourseDay[]> {
  const documents = await session.tx.query({
    collection: courseDaysCollectionPath(course.courseId),
    where: { field: 'courseId', op: '==', value: course.courseId },
  });
  session.plan.planRead({
    path: `${courseDaysCollectionPath(course.courseId)}/query`,
    category: 'aggregate',
  });
  return sortedCourseDays(
    parseCourseDays(documents.map((document) => ({ data: document.data ?? {} })))
  );
}

async function readAttendanceForCourseDay(
  session: CanonicalAtomicTransactionSession,
  enrollment: CourseEnrollment,
  courseDayId: CourseDayId
): Promise<Attendance | undefined> {
  const attendanceId = attendanceIdFromCourseDayIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'course_enrollment',
    enrollmentId: enrollment.enrollmentId,
    courseDayId,
  });
  const documentPath = attendancePath(attendanceId);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseAttendance(read.exists ? read.data : undefined);
}

async function readAdminIssueByIdentity(
  session: CanonicalAtomicTransactionSession,
  correlationId: CommandMetadata['correlationId'],
  identity: Parameters<typeof plannedAdminIssuePath>[0]
): Promise<AdminIssue | undefined> {
  const documentPath = plannedAdminIssuePath(identity);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseExistingAdminIssueOrCollision(correlationId, read.exists ? read.data : undefined);
}

export function reconcileCourseEnrollmentHandler(
  envelope: CommandEnvelope<'reconcile_course_enrollment'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'reconcile_course_enrollment'>> {
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);
  const actorMode = assertReconcileCourseEnrollmentAuthorization(envelope);
  const automationOnly = actorMode === 'system';

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let courseDays: CourseDay[] = [];
  let payment!: Payment;
  let plannedEnrollment: CourseEnrollment | undefined;
  let plannedEnrollmentRevision: number | undefined;
  let plannedClaimRelease: PlannedCourseEnrollmentClaimRelease | undefined;
  let plannedIssueMutations: Array<{
    issue: AdminIssue;
    mutationKind: 'create' | 'update';
    documentPath: string;
    auditEffect: 'resolved' | 'opened' | 'reused';
    kind: AdminIssue['kind'];
  }> = [];
  let auditLifecycleSummary: string | undefined;
  let hasMutations = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'reconcile_course_enrollment'> = {
    read: async (session) => {
      plannedEnrollment = undefined;
      plannedEnrollmentRevision = undefined;
      plannedClaimRelease = undefined;
      plannedIssueMutations = [];
      auditLifecycleSummary = undefined;
      hasMutations = false;

      const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
      session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
      const parsedEnrollment = parseCourseEnrollment(
        enrollmentRead.exists ? enrollmentRead.data : undefined
      );
      if (!parsedEnrollment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseEnrollmentId', reason: 'conflict' },
        });
      }
      enrollment = parsedEnrollment;

      if (envelope.context.expectedRevision !== undefined) {
        assertExpectedRevision({
          correlationId: envelope.context.correlationId,
          expectedRevision: envelope.context.expectedRevision,
          currentRevision: enrollment.revision,
          requireExpectedRevision: true,
        });
      }

      const courseDocumentPath = coursePath(enrollment.courseId);
      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsedCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      course = parsedCourse;
      courseDays = await readCourseDaysForCourse(session, course);
      if (!courseScheduleIsComplete(course, courseDays)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseEnrollmentId', reason: 'unsupported' },
        });
      }

      const paymentDocumentPath = paymentPath(enrollment.paymentId);
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict', resourceKind: 'course_enrollment' },
        });
      }
      payment = parsedPayment;
      assertCourseEnrollmentPaymentIdentity(
        envelope.context.correlationId,
        enrollment,
        payment
      );

      const now = timestampFromDate(environment.clock.decidedAt());
      const attendancesByCourseDayId = new Map<CourseDayId, Attendance>();
      for (const day of courseDays) {
        const attendance = await readAttendanceForCourseDay(session, enrollment, day.courseDayId);
        if (attendance && courseDayAttendanceMatchesCurrentOccurrence(attendance, day)) {
          attendancesByCourseDayId.set(day.courseDayId, attendance);
        }
      }

      const issueIdentities = [
        paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(enrollment.enrollmentId),
        courseEnrollmentAttendancePaymentConflictIdentity({
          enrollmentId: enrollment.enrollmentId,
          occurrenceId: courseEnrollmentSeatOccurrenceId(enrollment.enrollmentId),
          participantId: enrollment.participantId,
        }),
        unresolvedCourseEnrollmentPendingCancellationIdentity({
          enrollmentId: enrollment.enrollmentId,
        }),
        courseEnrollmentResourceReconciliationMismatchIdentity({
          enrollmentId: enrollment.enrollmentId,
        }),
        ...courseDays.map((day) =>
          missingCourseDayAttendanceIssueIdentity({
            enrollmentId: enrollment.enrollmentId,
            courseDayId: day.courseDayId,
            participantId: enrollment.participantId,
            occurrenceId: courseDayOccurrenceId(day),
          })
        ),
      ];

      const openAdminIssues: AdminIssue[] = [];
      for (const identity of issueIdentities) {
        const issue = await readAdminIssueByIdentity(
          session,
          metadata.correlationId,
          identity
        );
        if (issue && issue.lifecycle.status === 'open') {
          openAdminIssues.push(issue);
        }
      }

      let terminalEnrollmentHasActiveResourceGuard = false;
      const guardPath = canonicalPaths
        .activeCourseEnrollmentGuard(enrollment.participantId, enrollment.courseId)
        .replace(/^\//, '');
      const guardRead = await session.tx.get({ path: guardPath });
      session.plan.planRead({ path: guardPath, category: 'aggregate' });
      if (
        guardRead.exists &&
        (enrollment.lifecycle.status === 'completed' ||
          enrollment.lifecycle.status === 'no_show' ||
          enrollment.lifecycle.status === 'cancelled' ||
          enrollment.lifecycle.status === 'withdrawn')
      ) {
        const guardEnrollmentId = (guardRead.data as { courseEnrollmentId?: string })
          .courseEnrollmentId;
        if (guardEnrollmentId === enrollment.enrollmentId) {
          terminalEnrollmentHasActiveResourceGuard = true;
        }
      }

      const decision = evaluateCourseEnrollmentReconciliation({
        now,
        enrollment,
        course,
        courseDays,
        payment,
        attendancesByCourseDayId,
        openAdminIssues,
        automationOnly,
        terminalEnrollmentHasActiveResourceGuard,
      });

      hasMutations = courseEnrollmentReconciliationHasMutations({ decision });

      if (!hasMutations) {
        delete (handler as { planAuditOutbox?: unknown }).planAuditOutbox;
        return;
      }

      if (decision.outcome === 'no_repair_pending_cancellation') {
        return;
      }

      if (decision.outcome === 'no_repair_terminal_lifecycle') {
        if (decision.openResourceReconciliationMismatch) {
          const identity = courseEnrollmentResourceReconciliationMismatchIdentity({
            enrollmentId: enrollment.enrollmentId,
          });
          const documentPath = plannedAdminIssuePath(identity);
          const existing = await readAdminIssueByIdentity(
            session,
            metadata.correlationId,
            identity
          );
          const opened = openOrReuseAdminIssue({
            existing,
            identity,
            now,
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
          });
          plannedIssueMutations.push({
            issue: opened.issue,
            mutationKind: opened.mutationKind,
            documentPath,
            auditEffect: opened.mutationKind === 'create' ? 'opened' : 'reused',
            kind: 'resource_reconciliation_mismatch',
          });
          session.plan.planMutation({
            path: documentPath,
            kind: opened.mutationKind,
            category: 'aggregate',
            estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
          });
        }
        return;
      }

      if (decision.outcome !== 'repair') {
        return;
      }

      const repairDecision = decision;

      const openIssuesByKind = new Map<AdminIssue['kind'], AdminIssue>();
      for (const issue of openAdminIssues) {
        openIssuesByKind.set(issue.kind, issue);
      }

      for (const resolution of repairDecision.issueResolutions) {
        const documentPath = plannedAdminIssuePath(resolution.identity);
        const existing =
          openIssuesByKind.get(resolution.kind) ??
          openAdminIssues.find((issue) => issue.kind === resolution.kind) ??
          (await readAdminIssueByIdentity(session, metadata.correlationId, resolution.identity));
        if (!existing || existing.lifecycle.status !== 'open') {
          continue;
        }
        const resolved = resolveAdminIssueForCoupledReconciliation(existing, {
          expectedRevision: existing.revision,
          now,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          reason: resolution.reason,
          actor: {
            actor: envelope.context.actor,
            exercisedCapability: envelope.context.exercisedCapability,
          },
          coupledDomainCommand: true,
        });
        plannedIssueMutations.push({
          issue: resolved,
          mutationKind: 'update',
          documentPath,
          auditEffect: 'resolved',
          kind: existing.kind,
        });
        session.plan.planMutation({
          path: documentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
      }

      if (repairDecision.outcomeDecision.outcome === 'resolve') {
        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        plannedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          lifecycle:
            repairDecision.outcomeDecision.lifecycle === 'completed'
              ? { status: 'completed', completedAt: now }
              : { status: 'no_show', noShowAt: now },
          revision: plannedEnrollmentRevision,
          updatedAt: now,
          audit: {
            ...enrollment.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        auditLifecycleSummary = `CourseEnrollment marked ${plannedEnrollment.lifecycle.status}`;
        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });

        plannedClaimRelease = await planReleaseCourseEnrollmentClaims(session, {
          metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
          enrollment: plannedEnrollment,
          course,
          courseDays,
          now,
          releaseSeat: false,
          releaseFutureDayClaimsOnly: false,
        });
      }
    },
    planAuditOutbox: async () =>
      buildReconcileCourseEnrollmentAuditPlan({
        envelope,
        enrollmentId: enrollment.enrollmentId,
        enrollmentRevision: plannedEnrollmentRevision,
        issues: plannedIssueMutations.map((mutation) => ({
          issueId: mutation.issue.issueId,
          revision: mutation.issue.revision,
          effect: mutation.auditEffect,
          kind: mutation.kind,
        })),
        ...(auditLifecycleSummary ? { lifecycleSummary: auditLifecycleSummary } : {}),
      }),
    execute: async (session) => {
      if (plannedEnrollment) {
        session.tx.update(
          { path: enrollmentDocumentPath },
          enrollmentToFirestoreWritePayload(plannedEnrollment as Record<string, unknown>)
        );
      }
      for (const plannedIssue of plannedIssueMutations) {
        if (plannedIssue.mutationKind === 'update') {
          session.tx.update(
            { path: plannedIssue.documentPath },
            toAdminIssueWritePayload(plannedIssue.issue as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: plannedIssue.documentPath },
            toAdminIssueWritePayload(plannedIssue.issue as Record<string, unknown>)
          );
        }
      }
      if (plannedClaimRelease) {
        commitPlannedCourseEnrollmentClaimRelease(session, {
          metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
          enrollment: plannedEnrollment ?? enrollment,
          planned: plannedClaimRelease,
        });
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
    requireAuditOnSuccess: false,
  });
}

export function createCourseEnrollmentReconciliationCommandHandlers(
  executor: Parameters<typeof executeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'reconcile_course_enrollment'> {
  return {
    reconcile_course_enrollment: (envelope, environment) =>
      reconcileCourseEnrollmentHandler(envelope, environment, executor),
  };
}
