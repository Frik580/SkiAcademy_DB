import {
  AggregateRevisionSchema,
  AttendanceSchema,
  CanonicalCommandError,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  applyAttendanceSummaryDelta,
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence,
  commandSuccessResult,
  courseDayOccurrenceId,
  courseScheduleIsComplete,
  courseDayAttendanceMatchesCurrentOccurrence,
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  deriveCourseEnrollmentAttendanceSufficiency,
  deriveCourseEnrollmentLifecycleFromEvidenceCorrection,
  evaluateCourseEnrollmentOutcomeCalculator,
  findCourseDayForEnrollment,
  missingCourseDayAttendanceIssueIdentity,
  nextAggregateRevision,
  outcomeCorrectionRequiredIdentity,
  assertCourseEnrollmentPaymentIdentity,
  evaluateCourseEnrollmentPaymentStartGate,
  isCourseEnrollmentPaymentStartRestrictionActive,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  resolveAdminIssue,
  resolveCommandIdempotencyIdentity,
  shouldCreateAttendancePaymentConflict,
  sortedCourseDays,
  timestampFromDate,
  assertExpectedRevision,
  unresolvedCourseEnrollmentPendingCancellationIdentity,
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
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
  toFirestoreWritePayload as toAdminIssueWritePayload,
} from '../adminIssues';
import { assertResolveAttendanceOutcomeAuthorization } from '../bookings/bookingAttendanceAuthorization';
import {
  ATTENDANCE_PLANNING_ESTIMATES,
  attendancePath,
  parseAttendance,
  toFirestoreWritePayload as toAttendanceWritePayload,
} from '../bookings/attendanceStore';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  assertRecordCourseDayAttendanceAuthorization,
  type CourseEnrollmentAttendanceActorMode,
} from './courseEnrollmentAttendanceAuthorization';
import {
  buildRecordCourseDayAttendanceAuditPlan,
  buildResolveCourseEnrollmentAttendanceOutcomeAuditPlan,
} from './courseEnrollmentAttendanceAudit';
import { parsePayment, paymentPath } from '../finance/financeStore';
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

async function readOpenAdminIssue(
  session: CanonicalAtomicTransactionSession,
  correlationId: CommandMetadata['correlationId'],
  identity: Parameters<typeof plannedAdminIssuePath>[0]
): Promise<AdminIssue | undefined> {
  const documentPath = plannedAdminIssuePath(identity);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseExistingAdminIssueOrCollision(correlationId, read.exists ? read.data : undefined);
}

function buildAttendanceRecorder(
  mode: CourseEnrollmentAttendanceActorMode,
  envelope: CommandEnvelope<'record_course_day_attendance'>,
  instructorId: import('@ski-academy/shared-domain').InstructorId
): import('@ski-academy/shared-domain').AttendanceRecorder {
  if (mode === 'instructor' || mode === 'instructor_outcome_correction_required') {
    return { kind: 'instructor', instructorId };
  }
  const actor = envelope.context.actor;
  if (actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', { correlationId: envelope.context.correlationId });
  }
  return { kind: 'administrator', accountId: actor.accountId };
}

type PlannedAdminIssueMutation = {
  issue: AdminIssue;
  mutationKind: 'create' | 'update';
  documentPath: string;
  auditEffect: 'opened' | 'reused' | 'resolved';
  kind: AdminIssue['kind'];
};

async function planResolveOpenAdminIssue(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly correlationId: CommandMetadata['correlationId'];
    readonly commandId: string;
    readonly now: import('@ski-academy/shared-domain').CanonicalTimestamp;
    readonly identity: Parameters<typeof plannedAdminIssuePath>[0];
    readonly envelope: CommandEnvelope<'record_course_day_attendance'>;
    readonly reason: string;
  }
): Promise<PlannedAdminIssueMutation | undefined> {
  const documentPath = plannedAdminIssuePath(input.identity);
  const existing = await readOpenAdminIssue(session, input.correlationId, input.identity);
  if (!existing || existing.lifecycle.status !== 'open') {
    return undefined;
  }
  const resolved = resolveAdminIssue(existing, {
    expectedRevision: existing.revision,
    now: input.now,
    correlationId: input.correlationId,
    commandId: input.commandId,
    reason: input.reason,
    actor: {
      actor: input.envelope.context.actor,
      exercisedCapability: input.envelope.context.exercisedCapability,
    },
    coupledDomainCommand: true,
  });
  session.plan.planMutation({
    path: documentPath,
    kind: 'update',
    category: 'aggregate',
    estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
  });
  return {
    issue: resolved,
    mutationKind: 'update',
    documentPath,
    auditEffect: 'resolved',
    kind: existing.kind,
  };
}

function recordCourseDayAttendanceHandler(
  envelope: CommandEnvelope<'record_course_day_attendance'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'record_course_day_attendance'>> {
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let courseDays: CourseDay[] = [];
  let courseDay!: CourseDay;
  let existingAttendance: Attendance | undefined;
  let effectiveExistingAttendance: Attendance | undefined;
  let plannedAttendance!: Attendance;
  let attendanceDocumentPath = '';
  let attendanceMutation: 'create' | 'update' = 'create';
  let actorMode!: CourseEnrollmentAttendanceActorMode;
  let plannedEnrollment: CourseEnrollment | undefined;
  let plannedEnrollmentRevision: number | undefined;
  let plannedClaimRelease: PlannedCourseEnrollmentClaimRelease | undefined;
  let auditSummary: string | undefined;
  let payment!: Payment;
  let plannedIssueMutations: PlannedAdminIssueMutation[] = [];
  let skipAttendanceMutation = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_course_day_attendance'> = {
    read: async (session) => {
      plannedEnrollment = undefined;
      plannedEnrollmentRevision = undefined;
      plannedClaimRelease = undefined;
      auditSummary = undefined;
      effectiveExistingAttendance = undefined;
      plannedIssueMutations = [];
      skipAttendanceMutation = false;

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
          details: { field: 'courseDayId', reason: 'unsupported' },
        });
      }

      const resolvedCourseDay = findCourseDayForEnrollment(
        courseDays,
        envelope.intent.courseDayId,
        enrollment.courseId
      );
      if (!resolvedCourseDay) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseDayId', reason: 'conflict' },
        });
      }
      courseDay = resolvedCourseDay;

      const now = timestampFromDate(environment.clock.decidedAt());
      existingAttendance = await readAttendanceForCourseDay(
        session,
        enrollment,
        envelope.intent.courseDayId
      );
      effectiveExistingAttendance =
        existingAttendance &&
        courseDayAttendanceMatchesCurrentOccurrence(existingAttendance, courseDay)
          ? existingAttendance
          : undefined;
      actorMode = assertRecordCourseDayAttendanceAuthorization(envelope, {
        enrollment,
        courseDay,
        existingAttendance: effectiveExistingAttendance,
        now,
      });

      if (actorMode === 'instructor_outcome_correction_required') {
        skipAttendanceMutation = true;
        const identity = outcomeCorrectionRequiredIdentity({
          enrollmentId: enrollment.enrollmentId,
          courseDayId: envelope.intent.courseDayId,
          participantId: enrollment.participantId,
          occurrenceId: courseDayOccurrenceId(courseDay),
        });
        const documentPath = plannedAdminIssuePath(identity);
        const existing = await readOpenAdminIssue(session, metadata.correlationId, identity);
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
          kind: 'outcome_correction_required',
        });
        session.plan.planMutation({
          path: documentPath,
          kind: opened.mutationKind,
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
        plannedAttendance = effectiveExistingAttendance ?? existingAttendance ?? AttendanceSchema.parse({
          attendanceId: attendanceIdFromCourseDayIdentity({
            strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
            subjectKind: 'course_enrollment',
            enrollmentId: enrollment.enrollmentId,
            courseDayId: envelope.intent.courseDayId,
          }),
          subject: {
            subjectKind: 'course_enrollment',
            enrollmentId: enrollment.enrollmentId,
            courseId: enrollment.courseId,
            courseDayId: envelope.intent.courseDayId,
            occurrenceId: courseDayOccurrenceId(courseDay),
            participantId: enrollment.participantId,
          },
          attendanceStatus: envelope.intent.attendanceStatus,
          recordedBy: { kind: 'instructor', instructorId: courseDay.actualInstructorIds[0]! },
          recordedAt: now,
          lastChangedBy: { kind: 'instructor', instructorId: courseDay.actualInstructorIds[0]! },
          updatedAt: now,
          revision: AggregateRevisionSchema.parse(1),
          correlationId: metadata.correlationId,
        });
        return;
      }

      const attendanceId = attendanceIdFromCourseDayIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'course_enrollment',
        enrollmentId: enrollment.enrollmentId,
        courseDayId: envelope.intent.courseDayId,
      });
      attendanceDocumentPath = attendancePath(attendanceId);

      if (effectiveExistingAttendance) {
        assertExpectedRevision({
          correlationId: envelope.context.correlationId,
          expectedRevision: envelope.intent.expectedAttendanceRevision,
          currentRevision: effectiveExistingAttendance.revision,
          requireExpectedRevision: true,
        });
        if (effectiveExistingAttendance.attendanceStatus === envelope.intent.attendanceStatus) {
          plannedAttendance = effectiveExistingAttendance;
          attendanceMutation = 'update';
        } else {
          attendanceMutation = 'update';
        }
      } else if (envelope.intent.expectedAttendanceRevision !== undefined) {
        throw new CanonicalCommandError('stale_version', {
          correlationId: envelope.context.correlationId,
          currentRevision: AggregateRevisionSchema.parse(0),
        });
      } else {
        const collisionRead = await session.tx.get({ path: attendanceDocumentPath });
        if (collisionRead.exists) {
          attendanceMutation = 'update';
        } else {
          attendanceMutation = 'create';
        }
      }

      const instructorId = courseDay.actualInstructorIds[0]!;
      const recorder = buildAttendanceRecorder(actorMode, envelope, instructorId);
      const revisionBase = effectiveExistingAttendance ?? existingAttendance;
      const nextAttendanceRevision = revisionBase
        ? nextAggregateRevision(revisionBase.revision)
        : AggregateRevisionSchema.parse(1);
      plannedAttendance = AttendanceSchema.parse({
        attendanceId,
        subject: {
          subjectKind: 'course_enrollment',
          enrollmentId: enrollment.enrollmentId,
          courseId: enrollment.courseId,
          courseDayId: envelope.intent.courseDayId,
          occurrenceId: courseDayOccurrenceId(courseDay),
          participantId: enrollment.participantId,
        },
        attendanceStatus: envelope.intent.attendanceStatus,
        recordedBy: effectiveExistingAttendance?.recordedBy ?? recorder,
        recordedAt: effectiveExistingAttendance?.recordedAt ?? now,
        lastChangedBy: recorder,
        updatedAt: now,
        revision: nextAttendanceRevision,
        correlationId: metadata.correlationId,
        causationId: metadata.commandId,
      });

      session.plan.planMutation({
        path: attendanceDocumentPath,
        kind: attendanceMutation,
        category: 'aggregate',
        estimatedPayloadBytes: ATTENDANCE_PLANNING_ESTIMATES.attendanceBytes,
      });

      const previousStatus = effectiveExistingAttendance?.attendanceStatus;
      const nextSummary = applyAttendanceSummaryDelta({
        existing: enrollment.attendanceSummary,
        previousStatus,
        nextStatus: envelope.intent.attendanceStatus,
      });

      const attendancesByCourseDayId = new Map<CourseDayId, Attendance>();
      for (const day of courseDays) {
        const current =
          day.courseDayId === envelope.intent.courseDayId
            ? plannedAttendance
            : await readAttendanceForCourseDay(session, enrollment, day.courseDayId);
        if (current && courseDayAttendanceMatchesCurrentOccurrence(current, day)) {
          attendancesByCourseDayId.set(day.courseDayId, current);
        }
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

      const pendingCancellationIssue = await readOpenAdminIssue(
        session,
        metadata.correlationId,
        unresolvedCourseEnrollmentPendingCancellationIdentity({
          enrollmentId: enrollment.enrollmentId,
        })
      );

      const paymentStartIdentity = paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(
        enrollment.enrollmentId
      );
      const paymentStartDocumentPath = plannedAdminIssuePath(paymentStartIdentity);
      let paymentIssue = await readOpenAdminIssue(
        session,
        metadata.correlationId,
        paymentStartIdentity
      );
      const gateDecision = evaluateCourseEnrollmentPaymentStartGate({
        now,
        enrollment,
        course,
        payment,
      });
      let plannedPaymentStartIssue: AdminIssue | undefined;
      if (gateDecision.outcome === 'underfunded') {
        const opened = openOrReuseAdminIssue({
          existing: paymentIssue,
          identity: paymentStartIdentity,
          now,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
        });
        plannedPaymentStartIssue = opened.issue;
        paymentIssue = opened.issue;
        plannedIssueMutations.push({
          issue: opened.issue,
          mutationKind: opened.mutationKind,
          documentPath: paymentStartDocumentPath,
          auditEffect: opened.mutationKind === 'create' ? 'opened' : 'reused',
          kind: 'payment_required_at_start',
        });
        session.plan.planMutation({
          path: paymentStartDocumentPath,
          kind: opened.mutationKind,
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
      }
      const paymentStartRestrictionActive = isCourseEnrollmentPaymentStartRestrictionActive({
        now,
        enrollment,
        course,
        payment,
        openPaymentRequiredAtStartIssue:
          (plannedPaymentStartIssue ?? paymentIssue)?.lifecycle.status === 'open',
      });

      let plannedPaymentConflictIssue: AdminIssue | undefined;
      let paymentConflictDocumentPath = '';
      if (
        shouldCreateAttendancePaymentConflict({
          attendanceStatus: envelope.intent.attendanceStatus,
          openPaymentRequiredAtStart: paymentStartRestrictionActive,
        })
      ) {
        const identity = courseEnrollmentAttendancePaymentConflictIdentity({
          enrollmentId: enrollment.enrollmentId,
          occurrenceId: courseEnrollmentSeatOccurrenceId(enrollment.enrollmentId),
          participantId: enrollment.participantId,
        });
        paymentConflictDocumentPath = plannedAdminIssuePath(identity);
        const existing = await readOpenAdminIssue(session, metadata.correlationId, identity);
        const opened = openOrReuseAdminIssue({
          existing,
          identity,
          now,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
        });
        plannedPaymentConflictIssue = opened.issue;
        plannedIssueMutations.push({
          issue: opened.issue,
          mutationKind: opened.mutationKind,
          documentPath: paymentConflictDocumentPath,
          auditEffect: opened.mutationKind === 'create' ? 'opened' : 'reused',
          kind: 'attendance_payment_conflict',
        });
        session.plan.planMutation({
          path: paymentConflictDocumentPath,
          kind: opened.mutationKind,
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
      }

      const openIssues = [
        ...(pendingCancellationIssue?.lifecycle.status === 'open' ? [pendingCancellationIssue] : []),
        ...(paymentIssue?.lifecycle.status === 'open' ? [paymentIssue] : []),
        ...(plannedPaymentConflictIssue ? [plannedPaymentConflictIssue] : []),
      ];

      if (actorMode === 'admin_terminal_correction') {
        const effectiveSummary = buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence({
          courseDays,
          attendancesByCourseDayId,
        });
        const sufficiency = deriveCourseEnrollmentAttendanceSufficiency({
          courseDayCount: course.scheduleProjection.courseDayCount,
          attendanceSummary: effectiveSummary,
        });
        const correctedLifecycle = deriveCourseEnrollmentLifecycleFromEvidenceCorrection({
          sufficiency,
        });
        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        plannedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          attendanceSummary: effectiveSummary,
          lifecycle:
            correctedLifecycle === 'completed'
              ? { status: 'completed', completedAt: now }
              : correctedLifecycle === 'no_show'
                ? { status: 'no_show', noShowAt: now }
                : { status: 'confirmed' },
          revision: plannedEnrollmentRevision,
          updatedAt: now,
          audit: {
            ...enrollment.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        auditSummary = `CourseEnrollment marked ${correctedLifecycle}`;
        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });

        const correctionReason = envelope.intent.reasonExplanation?.trim() ?? 'Terminal attendance correction';
        const resolvedOutcomeIssue = await planResolveOpenAdminIssue(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          now,
          identity: outcomeCorrectionRequiredIdentity({
            enrollmentId: enrollment.enrollmentId,
            courseDayId: envelope.intent.courseDayId,
            participantId: enrollment.participantId,
            occurrenceId: courseDayOccurrenceId(courseDay),
          }),
          envelope,
          reason: correctionReason,
        });
        if (resolvedOutcomeIssue) {
          plannedIssueMutations.push(resolvedOutcomeIssue);
        }
        return;
      }

      const projectedEnrollment: CourseEnrollment = {
        ...enrollment,
        attendanceSummary: nextSummary,
      };

      const outcomeDecision = evaluateCourseEnrollmentOutcomeCalculator({
        now,
        enrollment: projectedEnrollment,
        course,
        courseDays,
        attendancesByCourseDayId,
        openAdminIssues: openIssues,
        automationOnly: false,
        ...(plannedPaymentConflictIssue ? { justRecordedPresentWithPaymentConflict: true } : {}),
      });

      if (outcomeDecision.outcome === 'resolve') {
        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        plannedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          attendanceSummary: nextSummary,
          lifecycle:
            outcomeDecision.lifecycle === 'completed'
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
        auditSummary = `CourseEnrollment marked ${plannedEnrollment.lifecycle.status}`;
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
      } else if (
        previousStatus !== envelope.intent.attendanceStatus ||
        !effectiveExistingAttendance
      ) {
        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        plannedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          attendanceSummary: nextSummary,
          revision: plannedEnrollmentRevision,
          updatedAt: now,
          audit: {
            ...enrollment.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildRecordCourseDayAttendanceAuditPlan({
        envelope,
        enrollmentId: enrollment.enrollmentId,
        attendanceId: plannedAttendance.attendanceId,
        attendanceRevision: plannedAttendance.revision,
        enrollmentRevision: plannedEnrollmentRevision,
        actorMode,
        ...(skipAttendanceMutation ? { skipAttendanceRecording: true } : {}),
        issues: plannedIssueMutations.map((issue) => ({
          issueId: issue.issue.issueId,
          revision: issue.issue.revision,
          effect: issue.auditEffect,
          kind: issue.kind,
        })),
        ...(auditSummary ? { lifecycleSummary: auditSummary } : {}),
      }),
    execute: async (session) => {
      if (
        !skipAttendanceMutation &&
        (!effectiveExistingAttendance ||
          effectiveExistingAttendance.attendanceStatus !== envelope.intent.attendanceStatus)
      ) {
        if (attendanceMutation === 'update') {
          session.tx.update(
            { path: attendanceDocumentPath },
            toAttendanceWritePayload(plannedAttendance as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: attendanceDocumentPath },
            toAttendanceWritePayload(plannedAttendance as Record<string, unknown>)
          );
        }
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
      if (plannedEnrollment) {
        session.tx.update(
          { path: enrollmentDocumentPath },
          enrollmentToFirestoreWritePayload(plannedEnrollment as Record<string, unknown>)
        );
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

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function resolveCourseEnrollmentAttendanceOutcomeHandler(
  envelope: CommandEnvelope<'resolve_attendance_outcome'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'resolve_attendance_outcome'>> {
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentId = CourseEnrollmentIdSchema.parse(envelope.intent.subjectId);
  const enrollmentDocumentPath = courseEnrollmentPath(enrollmentId);
  const actorMode = assertResolveAttendanceOutcomeAuthorization(envelope);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let courseDays: CourseDay[] = [];
  let plannedEnrollment: CourseEnrollment | undefined;
  let plannedEnrollmentRevision: number | undefined;
  let plannedClaimRelease: PlannedCourseEnrollmentClaimRelease | undefined;
  let plannedIssues: Array<{
    issue: AdminIssue;
    mutationKind: 'create' | 'update';
    documentPath: string;
  }> = [];
  let auditSummary: string | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'resolve_attendance_outcome'> = {
    read: async (session) => {
      plannedEnrollment = undefined;
      plannedEnrollmentRevision = undefined;
      plannedClaimRelease = undefined;
      plannedIssues = [];
      auditSummary = undefined;

      const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
      session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
      const parsedEnrollment = parseCourseEnrollment(
        enrollmentRead.exists ? enrollmentRead.data : undefined
      );
      if (!parsedEnrollment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'subjectId', reason: 'conflict' },
        });
      }
      enrollment = parsedEnrollment;

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
          details: { field: 'subjectId', reason: 'unsupported' },
        });
      }

      const now = timestampFromDate(environment.clock.decidedAt());
      const attendancesByCourseDayId = new Map<CourseDayId, Attendance>();
      for (const day of courseDays) {
        const attendance = await readAttendanceForCourseDay(session, enrollment, day.courseDayId);
        if (attendance && courseDayAttendanceMatchesCurrentOccurrence(attendance, day)) {
          attendancesByCourseDayId.set(day.courseDayId, attendance);
        }
      }

      const pendingCancellationIssue = await readOpenAdminIssue(
        session,
        metadata.correlationId,
        unresolvedCourseEnrollmentPendingCancellationIdentity({
          enrollmentId: enrollment.enrollmentId,
        })
      );
      const openIssues = [
        ...(pendingCancellationIssue?.lifecycle.status === 'open' ? [pendingCancellationIssue] : []),
      ];

      const outcomeDecision = evaluateCourseEnrollmentOutcomeCalculator({
        now,
        enrollment,
        course,
        courseDays,
        attendancesByCourseDayId,
        openAdminIssues: openIssues,
        automationOnly: actorMode === 'system',
      });

      if (outcomeDecision.outcome === 'resolve') {
        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        plannedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          lifecycle:
            outcomeDecision.lifecycle === 'completed'
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
        auditSummary = `CourseEnrollment marked ${plannedEnrollment.lifecycle.status}`;
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

      if (outcomeDecision.outcome === 'unresolved') {
        const effectiveSummary = buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence({
          courseDays,
          attendancesByCourseDayId,
        });
        const hasPresent = effectiveSummary.presentDayCount >= 1;
        if (!hasPresent) {
          for (const courseDayId of outcomeDecision.missingCourseDayIds) {
            const courseDay = courseDays.find((day) => day.courseDayId === courseDayId);
            if (!courseDay) continue;
            const identity = missingCourseDayAttendanceIssueIdentity({
              enrollmentId: enrollment.enrollmentId,
              courseDayId,
              participantId: enrollment.participantId,
              occurrenceId: courseDayOccurrenceId(courseDay),
            });
            const documentPath = plannedAdminIssuePath(identity);
            const existing = await readOpenAdminIssue(session, metadata.correlationId, identity);
            const opened = openOrReuseAdminIssue({
              existing,
              identity,
              now,
              correlationId: metadata.correlationId,
              commandId: metadata.commandId,
            });
            plannedIssues.push({
              issue: opened.issue,
              mutationKind: opened.mutationKind,
              documentPath,
            });
            session.plan.planMutation({
              path: documentPath,
              kind: opened.mutationKind,
              category: 'aggregate',
              estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
            });
          }
        }
      }
    },
    planAuditOutbox: async () =>
      buildResolveCourseEnrollmentAttendanceOutcomeAuditPlan({
        envelope,
        enrollmentId: enrollment.enrollmentId,
        enrollmentRevision: plannedEnrollmentRevision,
        issues: plannedIssues.map((entry) => ({
          issueId: entry.issue.issueId,
          revision: entry.issue.revision,
          effect: entry.mutationKind === 'create' ? ('opened' as const) : ('reused' as const),
          kind: 'missing_attendance' as const,
        })),
        ...(auditSummary ? { lifecycleSummary: auditSummary } : {}),
      }),
    execute: async (session) => {
      if (plannedEnrollment) {
        session.tx.update(
          { path: enrollmentDocumentPath },
          enrollmentToFirestoreWritePayload(plannedEnrollment as Record<string, unknown>)
        );
      }
      for (const plannedIssue of plannedIssues) {
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

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function createCourseEnrollmentAttendanceCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'record_course_day_attendance'> {
  return {
    record_course_day_attendance: (envelope, environment) =>
      recordCourseDayAttendanceHandler(envelope, environment, executor),
  };
}
