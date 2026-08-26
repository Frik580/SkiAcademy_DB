import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseEnrollmentSchema,
  KztMinorUnitsSchema,
  courseScheduleIsComplete,
  commandSuccessResult,
  calculatePolicyRefundAmount,
  accountOwnerCourseCancellationReasonCode,
  administratorCourseCancellationReasonCode,
  evaluateClientCourseCancellationTiming,
  isCourseEnrollmentAllowedBeforeStart,
  isPendingCancellationCourseEnrollment,
  isTerminalCourseEnrollmentLifecycle,
  nextAggregateRevision,
  paymentIdFromCourseEnrollmentId,
  paymentIdMatchesSubject,
  resolveAdminCancellationApprovalTerminalStatus,
  resolveCommandIdempotencyIdentity,
  shouldReleasePreStartSeatOnTerminalization,
  sortedCourseDays,
  timestampFromDate,
  unresolvedCourseEnrollmentPendingCancellationIdentity,
  type AdminIssue,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type CorrelationId,
  type KztMinorUnits,
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
import { parseAccount, accountPath, parsePayment, paymentPath, parseWallet, walletPath } from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantManagement,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import {
  commitPlannedCourseEnrollmentAdminIssueUpdate,
  planResolveOpenUnresolvedCourseEnrollmentPendingCancellationIssue,
  type PlannedUnresolvedCourseEnrollmentPendingCancellationResolution,
} from './courseEnrollmentCancellationAdminIssues';
import {
  assertAuthenticatedCourseCancellationAuthorization,
  assertConfirmedGuestCourseEnrollmentCannotSelfCancel,
  assertResolveCourseEnrollmentCancellationAuthorization,
  assertTransferCourseEnrollmentAuthorization,
} from './courseEnrollmentLifecycleAuthorization';
import {
  buildDirectClientCourseCancellationAuditPlan,
  buildPendingCourseCancellationRequestAuditPlan,
  buildResolveCourseEnrollmentCancellationAuditPlan,
  buildTransferCourseEnrollmentAuditPlan,
  buildWithdrawCourseEnrollmentCancellationRequestAuditPlan,
} from './courseEnrollmentLifecycleAudit';
import {
  commitPlannedCourseEnrollmentCancellationFinance,
  commitPlannedCourseEnrollmentTransferFinance,
  planCourseEnrollmentCancellationFinance,
  planCourseEnrollmentTransferFinance,
  type PlannedCourseEnrollmentCancellationFinance,
  type PlannedCourseEnrollmentTransferFinance,
} from './courseEnrollmentLifecycleFinance';
import {
  commitPlannedCourseEnrollmentClaimAcquire,
  commitPlannedCourseEnrollmentClaimRelease,
  planAcquireCourseEnrollmentClaims,
  planReleaseCourseEnrollmentClaims,
  type PlannedCourseEnrollmentClaimRelease,
} from './courseEnrollmentClaimOperations';
import {
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDays,
  toFirestoreWritePayload as courseToFirestoreWritePayload,
  COURSE_PLANNING_ESTIMATES,
} from './courseStore';
import {
  courseEnrollmentPath,
  parseCourseEnrollment,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
} from './courseEnrollmentStore';
import type { GuestCourseEnrollmentCommandEnvironment } from './guestCourseEnrollmentLifecycle';
import { requestPendingGuestCourseEnrollmentCancellationHandler } from './guestCourseEnrollmentLifecycle';
import { moveActiveCourseEnrollmentGuard } from '../resourceClaims/uniquenessGuards';
import { registerResourceClaimPlanInGuardOverlay, type InTransactionGuardOverlay } from '../resourceClaims/resourceClaimEngine';

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

function assertCourseEnrollmentPaymentIdentity(
  correlationId: CorrelationId,
  enrollment: CourseEnrollment,
  payment: Payment
): void {
  const expectedPaymentId = paymentIdFromCourseEnrollmentId(enrollment.enrollmentId);
  if (
    enrollment.paymentId !== payment.paymentId ||
    payment.paymentId !== expectedPaymentId ||
    !paymentIdMatchesSubject(payment, {
      subjectType: 'course_enrollment',
      subjectId: enrollment.enrollmentId,
    })
  ) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { field: 'paymentId', reason: 'conflict', resourceKind: 'course_enrollment' },
    });
  }
}

function planCourseCapacityMutation(
  session: Parameters<typeof planCourseEnrollmentCancellationFinance>[0],
  courseDocumentPath: string
): void {
  session.plan.planMutation({
    path: courseDocumentPath,
    kind: 'update',
    category: 'capacity_projection',
    estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
  });
}

function requestAuthenticatedCourseEnrollmentCancellationHandler(
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'request_course_enrollment_cancellation'>> {
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let courseDays!: readonly CourseDay[];
  let payment!: Payment;
  let plannedEnrollmentRevision = AggregateRevisionSchema.parse(1);
  let plannedCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: PlannedCourseEnrollmentClaimRelease | undefined;
  let plannedFinance: PlannedCourseEnrollmentCancellationFinance | undefined;
  let timing!: ReturnType<typeof evaluateClientCourseCancellationTiming>;
  let plannedIssue: AdminIssue | undefined;
  let issueMutationKind: 'create' | 'update' | undefined;
  let issueDocumentPath = '';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'request_course_enrollment_cancellation'> =
    {
      read: async (session) => {
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
        assertConfirmedGuestCourseEnrollmentCannotSelfCancel(envelope, enrollment);

        if (
          enrollment.lifecycle.status !== 'confirmed' ||
          isTerminalCourseEnrollmentLifecycle(enrollment)
        ) {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
          });
        }

        const participantId = enrollment.participantId;
        const actor = requireAccountActor(envelope);
        const accountDocumentPath = accountPath(actor.accountId);
        const accountRead = await session.tx.get({ path: accountDocumentPath });
        session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
        const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
        if (!account) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const participantRead = await session.tx.get({ path: participantPath(participantId) });
        session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
        const participant = parseParticipant(participantRead.exists ? participantRead.data : undefined);
        if (!participant || participant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const managementRead = await session.tx.get({
          path: participantManagementPath(participant.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(participant.management.participantManagementId),
          category: 'aggregate',
        });
        const management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!management) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        assertAuthenticatedCourseCancellationAuthorization(envelope, {
          account,
          participant,
          management,
          participantId,
        });

        const coursePathValue = coursePath(enrollment.courseId);
        const courseRead = await session.tx.get({ path: coursePathValue });
        session.plan.planRead({ path: coursePathValue, category: 'aggregate' });
        const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
        if (!parsedCourse) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'conflict' },
          });
        }
        course = parsedCourse;

        const dayDocuments = await session.tx.query({
          collection: courseDaysCollectionPath(enrollment.courseId),
          where: { field: 'courseId', op: '==', value: enrollment.courseId },
        });
        session.plan.planRead({
          path: `${courseDaysCollectionPath(enrollment.courseId)}/query`,
          category: 'aggregate',
        });
        courseDays = sortedCourseDays(
          parseCourseDays(dayDocuments.map((document) => ({ data: document.data ?? {} })))
        );
        if (!courseScheduleIsComplete(course, courseDays)) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'unsupported' },
          });
        }

        const now = timestampFromDate(environment.clock.decidedAt());
        timing = evaluateClientCourseCancellationTiming({
          requestAt: now,
          startAt: course.startAt,
        });

        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });

        if (timing.kind === 'direct_cancel') {
          const paymentDocumentPath = paymentPath(enrollment.paymentId);
          const paymentRead = await session.tx.get({ path: paymentDocumentPath });
          session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
          const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
          if (!parsedPayment) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'paymentId', reason: 'conflict' },
            });
          }
          payment = parsedPayment;
          assertCourseEnrollmentPaymentIdentity(envelope.context.correlationId, enrollment, payment);
          const refundAmount = calculatePolicyRefundAmount({
            payment,
            refundPercentBasisPoints: timing.refundPercentBasisPoints,
          });
          plannedFinance = await planCourseEnrollmentCancellationFinance(session, {
            envelope,
            enrollment,
            payment,
            refundAmount,
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            decidedAt: now,
          });
          const releaseSeat = shouldReleasePreStartSeatOnTerminalization({
            now,
            courseStartAt: course.startAt,
          });
          plannedReleaseClaims = await planReleaseCourseEnrollmentClaims(session, {
            metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
            enrollment,
            course,
            courseDays,
            now,
            releaseSeat,
            releaseFutureDayClaimsOnly: !releaseSeat,
          });
          if (releaseSeat) {
            plannedCourseRevision = nextAggregateRevision(course.revision);
            planCourseCapacityMutation(session, coursePathValue);
          }
          return;
        }

        const issueIdentity = unresolvedCourseEnrollmentPendingCancellationIdentity({
          enrollmentId: enrollment.enrollmentId,
        });
        issueDocumentPath = plannedAdminIssuePath(issueIdentity);
        const issueRead = await session.tx.get({ path: issueDocumentPath });
        session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
        const existingIssue = parseExistingAdminIssueOrCollision(
          envelope.context.correlationId,
          issueRead.exists ? issueRead.data : undefined
        );
        const opened = openOrReuseAdminIssue({
          existing: existingIssue,
          identity: issueIdentity,
          now,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
        });
        plannedIssue = opened.issue;
        issueMutationKind = opened.mutationKind;
        session.plan.planMutation({
          path: issueDocumentPath,
          kind: opened.mutationKind,
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
      },
      planAuditOutbox: async () => {
        if (timing.kind === 'direct_cancel' && plannedFinance) {
          return buildDirectClientCourseCancellationAuditPlan({
            envelope,
            courseEnrollmentId: envelope.intent.courseEnrollmentId,
            paymentId: enrollment.paymentId,
            enrollmentRevision: plannedEnrollmentRevision,
            paymentRevision: plannedFinance.paymentRevision,
            monetaryEventIds: plannedFinance.monetaryEvents.map((event) => event.eventId),
            reasonCode: accountOwnerCourseCancellationReasonCode(),
            walletRevision: plannedFinance.wallet?.revision,
            walletAccountId: plannedFinance.payment.payerAccountId,
          });
        }
        return buildPendingCourseCancellationRequestAuditPlan({
          envelope,
          courseEnrollmentId: envelope.intent.courseEnrollmentId,
          enrollmentRevision: plannedEnrollmentRevision,
          issue:
            plannedIssue === undefined
              ? undefined
              : {
                  issueId: plannedIssue.issueId,
                  revision: plannedIssue.revision,
                  effect: issueMutationKind === 'create' ? 'opened' : 'reused',
                },
        });
      },
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        if (timing.kind === 'direct_cancel' && plannedFinance && plannedReleaseClaims) {
          const updatedEnrollment = CourseEnrollmentSchema.parse({
            ...enrollment,
            lifecycle: {
              status: 'cancelled',
              cancelledAt: decidedAt,
              reasonCode: accountOwnerCourseCancellationReasonCode(),
            },
            revision: plannedEnrollmentRevision,
            updatedAt: decidedAt,
            audit: {
              ...enrollment.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          });
          session.tx.update(
            { path: enrollmentDocumentPath },
            enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
          );
          commitPlannedCourseEnrollmentCancellationFinance(session, plannedFinance);
          commitPlannedCourseEnrollmentClaimRelease(session, {
            metadata: { ...metadata, decidedAt: context.decidedAt },
            enrollment,
            planned: plannedReleaseClaims,
          });
          if (plannedReleaseClaims.incrementAvailableSeats) {
            const updatedCourse: Course = {
              ...course,
              capacity: {
                ...course.capacity,
                availableSeats: course.capacity.availableSeats + 1,
              },
              revision: plannedCourseRevision,
              updatedAt: decidedAt,
              audit: {
                ...course.audit,
                lastChangedByCommandId: metadata.commandId,
                correlationId: metadata.correlationId,
              },
            };
            session.tx.update(
              { path: coursePath(enrollment.courseId) },
              courseToFirestoreWritePayload(updatedCourse as Record<string, unknown>)
            );
          }
        } else {
          const updatedEnrollment = CourseEnrollmentSchema.parse({
            ...enrollment,
            lifecycle: {
              status: 'pending_cancellation',
              requestedAt: decidedAt,
            },
            revision: plannedEnrollmentRevision,
            updatedAt: decidedAt,
            audit: {
              ...enrollment.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          });
          session.tx.update(
            { path: enrollmentDocumentPath },
            enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
          );
          if (plannedIssue !== undefined && issueMutationKind !== undefined) {
            const payload = toAdminIssueWritePayload(plannedIssue as Record<string, unknown>);
            if (issueMutationKind === 'create') {
              session.tx.create({ path: issueDocumentPath }, payload);
            } else {
              session.tx.update({ path: issueDocumentPath }, payload);
            }
          }
        }
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: enrollmentDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function withdrawCourseEnrollmentCancellationRequestHandler(
  envelope: CommandEnvelope<'withdraw_course_enrollment'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'withdraw_course_enrollment'>> {
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);

  let enrollment!: CourseEnrollment;
  let plannedEnrollmentRevision = AggregateRevisionSchema.parse(1);
  let plannedResolvedIssue: PlannedUnresolvedCourseEnrollmentPendingCancellationResolution | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'withdraw_course_enrollment'> = {
    read: async (session) => {
      const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
      session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
      const parsedEnrollment = parseCourseEnrollment(
        enrollmentRead.exists ? enrollmentRead.data : undefined
      );
      if (!parsedEnrollment || !isPendingCancellationCourseEnrollment(parsedEnrollment)) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
        });
      }
      enrollment = parsedEnrollment;

      const participantId = enrollment.participantId;
      const actor = requireAccountActor(envelope);
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const participantRead = await session.tx.get({ path: participantPath(participantId) });
      session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
      const participant = parseParticipant(participantRead.exists ? participantRead.data : undefined);
      if (!participant || participant.management.kind !== 'managed') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const managementRead = await session.tx.get({
        path: participantManagementPath(participant.management.participantManagementId),
      });
      session.plan.planRead({
        path: participantManagementPath(participant.management.participantManagementId),
        category: 'aggregate',
      });
      const management = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (!management) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      assertAuthenticatedCourseCancellationAuthorization(envelope, {
        account,
        participant,
        management,
        participantId,
      });

      plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
      session.plan.planMutation({
        path: enrollmentDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
      });

      const now = timestampFromDate(environment.clock.decidedAt());
      plannedResolvedIssue = await planResolveOpenUnresolvedCourseEnrollmentPendingCancellationIssue(
        session,
        {
          enrollment,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          now,
          reason: 'Cancellation request withdrawn',
          envelope,
        }
      );
    },
    planAuditOutbox: async () =>
      buildWithdrawCourseEnrollmentCancellationRequestAuditPlan({
        envelope,
        courseEnrollmentId: envelope.intent.courseEnrollmentId,
        enrollmentRevision: plannedEnrollmentRevision,
        resolvedIssue:
          plannedResolvedIssue === undefined
            ? undefined
            : {
                issueId: plannedResolvedIssue.issue.issueId,
                revision: plannedResolvedIssue.issue.revision,
              },
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedEnrollment = CourseEnrollmentSchema.parse({
        ...enrollment,
        lifecycle: { status: 'confirmed' },
        revision: plannedEnrollmentRevision,
        updatedAt: decidedAt,
        audit: {
          ...enrollment.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.update(
        { path: enrollmentDocumentPath },
        enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
      );
      if (plannedResolvedIssue !== undefined) {
        commitPlannedCourseEnrollmentAdminIssueUpdate(
          session,
          plannedResolvedIssue,
          toAdminIssueWritePayload
        );
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: enrollmentDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function resolveCourseEnrollmentCancellationHandler(
  envelope: CommandEnvelope<'resolve_course_enrollment_cancellation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'resolve_course_enrollment_cancellation'>> {
  assertResolveCourseEnrollmentCancellationAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);
  const decision = envelope.intent.decision;

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let courseDays!: readonly CourseDay[];
  let payment!: Payment;
  let plannedEnrollmentRevision = AggregateRevisionSchema.parse(1);
  let plannedCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: PlannedCourseEnrollmentClaimRelease | undefined;
  let plannedFinance: PlannedCourseEnrollmentCancellationFinance | undefined;
  let auditSummary = '';
  let paymentEffectSummary: string | undefined;
  let plannedResolvedPendingIssue: PlannedUnresolvedCourseEnrollmentPendingCancellationResolution | undefined;
  let terminalStatus: 'cancelled' | 'withdrawn' | 'confirmed' = 'confirmed';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'resolve_course_enrollment_cancellation'> =
    {
      read: async (session) => {
        const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
        session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
        const parsedEnrollment = parseCourseEnrollment(
          enrollmentRead.exists ? enrollmentRead.data : undefined
        );
        if (!parsedEnrollment) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
          });
        }
        enrollment = parsedEnrollment;
        if (isTerminalCourseEnrollmentLifecycle(enrollment)) {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'conflict' },
          });
        }

        const coursePathValue = coursePath(enrollment.courseId);
        const courseRead = await session.tx.get({ path: coursePathValue });
        session.plan.planRead({ path: coursePathValue, category: 'aggregate' });
        const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
        if (!parsedCourse) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'conflict' },
          });
        }
        course = parsedCourse;

        const dayDocuments = await session.tx.query({
          collection: courseDaysCollectionPath(enrollment.courseId),
          where: { field: 'courseId', op: '==', value: enrollment.courseId },
        });
        session.plan.planRead({
          path: `${courseDaysCollectionPath(enrollment.courseId)}/query`,
          category: 'aggregate',
        });
        courseDays = sortedCourseDays(
          parseCourseDays(dayDocuments.map((document) => ({ data: document.data ?? {} })))
        );

        const now = timestampFromDate(environment.clock.decidedAt());
        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });

        if (decision === 'direct_cancel') {
          if (enrollment.lifecycle.status !== 'confirmed') {
            throw new CanonicalCommandError('invalid_transition', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
            });
          }
          const refundAmount = KztMinorUnitsSchema.parse(envelope.intent.refundAmount!);
          await loadPaymentAndPlanCancel(session, refundAmount, now);
          terminalStatus = resolveAdminCancellationApprovalTerminalStatus({
            refundAmount,
            bookingOrigin: enrollment.attribution.bookingOrigin,
          });
          auditSummary =
            terminalStatus === 'withdrawn'
              ? 'Administrator withdrew course enrollment participation'
              : 'Administrator cancelled course enrollment';
          paymentEffectSummary =
            refundAmount > 0 ? 'Administrator cancellation refund applied' : undefined;
          return;
        }

        if (!isPendingCancellationCourseEnrollment(enrollment)) {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
          });
        }

        plannedResolvedPendingIssue =
          await planResolveOpenUnresolvedCourseEnrollmentPendingCancellationIssue(session, {
            enrollment,
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            now,
            reason:
              decision === 'approve'
                ? 'Administrator approved cancellation'
                : 'Administrator rejected cancellation',
            envelope,
          });

        if (decision === 'approve') {
          const refundAmount = KztMinorUnitsSchema.parse(envelope.intent.refundAmount!);
          await loadPaymentAndPlanCancel(session, refundAmount, now);
          terminalStatus = resolveAdminCancellationApprovalTerminalStatus({
            refundAmount,
            bookingOrigin: enrollment.attribution.bookingOrigin,
          });
          auditSummary = 'Administrator approved cancellation';
          paymentEffectSummary = 'Approved cancellation refund applied';
          return;
        }

        terminalStatus = 'confirmed';
        auditSummary = 'Administrator rejected cancellation';
      },
      planAuditOutbox: async () =>
        buildResolveCourseEnrollmentCancellationAuditPlan({
          envelope,
          courseEnrollmentId: envelope.intent.courseEnrollmentId,
          paymentId: plannedFinance ? enrollment.paymentId : undefined,
          enrollmentRevision: plannedEnrollmentRevision,
          paymentRevision: plannedFinance?.paymentRevision,
          monetaryEventIds: plannedFinance?.monetaryEvents.map((event) => event.eventId) ?? [],
          walletRevision: plannedFinance?.wallet?.revision,
          walletAccountId: plannedFinance?.payment.payerAccountId,
          resolvedPendingIssue:
            plannedResolvedPendingIssue === undefined
              ? undefined
              : {
                  issueId: plannedResolvedPendingIssue.issue.issueId,
                  revision: plannedResolvedPendingIssue.issue.revision,
                },
          summary: auditSummary,
          paymentEffectSummary,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        let lifecycle: CourseEnrollment['lifecycle'];

        if (terminalStatus === 'cancelled') {
          lifecycle = {
            status: 'cancelled',
            cancelledAt: decidedAt,
            reasonCode: administratorCourseCancellationReasonCode(),
          };
        } else if (terminalStatus === 'withdrawn') {
          lifecycle = {
            status: 'withdrawn',
            withdrawnAt: decidedAt,
          };
        } else {
          lifecycle = { status: 'confirmed' };
        }

        const updatedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          lifecycle,
          revision: plannedEnrollmentRevision,
          updatedAt: decidedAt,
          audit: {
            ...enrollment.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: enrollmentDocumentPath },
          enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
        );

        if (plannedFinance && plannedReleaseClaims) {
          commitPlannedCourseEnrollmentCancellationFinance(session, plannedFinance);
          commitPlannedCourseEnrollmentClaimRelease(session, {
            metadata: { ...metadata, decidedAt: context.decidedAt },
            enrollment,
            planned: plannedReleaseClaims,
          });
          if (plannedReleaseClaims.incrementAvailableSeats) {
            const updatedCourse: Course = {
              ...course,
              capacity: {
                ...course.capacity,
                availableSeats: course.capacity.availableSeats + 1,
              },
              revision: plannedCourseRevision,
              updatedAt: decidedAt,
              audit: {
                ...course.audit,
                lastChangedByCommandId: metadata.commandId,
                correlationId: metadata.correlationId,
              },
            };
            session.tx.update(
              { path: coursePath(enrollment.courseId) },
              courseToFirestoreWritePayload(updatedCourse as Record<string, unknown>)
            );
          }
        }

        if (plannedResolvedPendingIssue !== undefined) {
          commitPlannedCourseEnrollmentAdminIssueUpdate(
            session,
            plannedResolvedPendingIssue,
            toAdminIssueWritePayload
          );
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  async function loadPaymentAndPlanCancel(
    session: Parameters<typeof planCourseEnrollmentCancellationFinance>[0],
    refundAmount: KztMinorUnits,
    now: ReturnType<typeof timestampFromDate>
  ) {
    const paymentDocumentPath = paymentPath(enrollment.paymentId);
    const paymentRead = await session.tx.get({ path: paymentDocumentPath });
    session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
    const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
    if (!parsedPayment) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'paymentId', reason: 'conflict' },
      });
    }
    payment = parsedPayment;
    assertCourseEnrollmentPaymentIdentity(envelope.context.correlationId, enrollment, payment);
    plannedFinance = await planCourseEnrollmentCancellationFinance(session, {
      envelope,
      enrollment,
      payment,
      refundAmount,
      commandId: metadata.commandId,
      correlationId: metadata.correlationId,
      decidedAt: now,
      manualExternalReference: envelope.intent.manualExternalReference,
    });
    const releaseSeat = shouldReleasePreStartSeatOnTerminalization({
      now,
      courseStartAt: course.startAt,
    });
    plannedReleaseClaims = await planReleaseCourseEnrollmentClaims(session, {
      metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
      enrollment,
      course,
      courseDays,
      now,
      releaseSeat,
      releaseFutureDayClaimsOnly: !releaseSeat,
    });
    if (releaseSeat) {
      plannedCourseRevision = nextAggregateRevision(course.revision);
      planCourseCapacityMutation(session, coursePath(enrollment.courseId));
    }
  }

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: enrollmentDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function transferCourseEnrollmentHandler(
  envelope: CommandEnvelope<'transfer_course_enrollment'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'transfer_course_enrollment'>> {
  assertTransferCourseEnrollmentAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);
  const targetCourseId = envelope.intent.targetCourseId;

  let enrollment!: CourseEnrollment;
  let sourceCourse!: Course;
  let targetCourse!: Course;
  let sourceCourseDays!: readonly CourseDay[];
  let targetCourseDays!: readonly CourseDay[];
  let payment!: Payment;
  let plannedEnrollmentRevision = AggregateRevisionSchema.parse(1);
  let plannedSourceCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedTargetCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims!: PlannedCourseEnrollmentClaimRelease;
  let plannedAcquireClaims!: Awaited<ReturnType<typeof planAcquireCourseEnrollmentClaims>>;
  let plannedTransferFinance: PlannedCourseEnrollmentTransferFinance | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'transfer_course_enrollment'> = {
    read: async (session) => {
      const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
      session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
      const parsedEnrollment = parseCourseEnrollment(
        enrollmentRead.exists ? enrollmentRead.data : undefined
      );
      if (!parsedEnrollment || parsedEnrollment.lifecycle.status !== 'confirmed') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
        });
      }
      enrollment = parsedEnrollment;
      if (enrollment.courseId === targetCourseId) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'targetCourseId', reason: 'conflict' },
        });
      }

      const now = timestampFromDate(environment.clock.decidedAt());
      const sourceCoursePath = coursePath(enrollment.courseId);
      const targetCoursePath = coursePath(targetCourseId);

      const sourceCourseRead = await session.tx.get({ path: sourceCoursePath });
      session.plan.planRead({ path: sourceCoursePath, category: 'aggregate' });
      const parsedSourceCourse = parseCourse(
        sourceCourseRead.exists ? sourceCourseRead.data : undefined
      );
      if (!parsedSourceCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      sourceCourse = parsedSourceCourse;

      const targetCourseRead = await session.tx.get({ path: targetCoursePath });
      session.plan.planRead({ path: targetCoursePath, category: 'aggregate' });
      const parsedTargetCourse = parseCourse(
        targetCourseRead.exists ? targetCourseRead.data : undefined
      );
      if (!parsedTargetCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'targetCourseId', reason: 'conflict' },
        });
      }
      targetCourse = parsedTargetCourse;

      if (
        !isCourseEnrollmentAllowedBeforeStart({
          now,
          courseStartsAt: sourceCourse.startAt,
        }) ||
        !isCourseEnrollmentAllowedBeforeStart({
          now,
          courseStartsAt: targetCourse.startAt,
        })
      ) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'targetCourseId', reason: 'out_of_range' },
        });
      }

      if (targetCourse.capacity.availableSeats < 1) {
        throw new CanonicalCommandError('unavailable', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'course', reason: 'conflict' },
        });
      }

      const sourceDayDocuments = await session.tx.query({
        collection: courseDaysCollectionPath(enrollment.courseId),
        where: { field: 'courseId', op: '==', value: enrollment.courseId },
      });
      session.plan.planRead({
        path: `${courseDaysCollectionPath(enrollment.courseId)}/query`,
        category: 'aggregate',
      });
      sourceCourseDays = sortedCourseDays(
        parseCourseDays(sourceDayDocuments.map((document) => ({ data: document.data ?? {} })))
      );
      if (!courseScheduleIsComplete(sourceCourse, sourceCourseDays)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'unsupported' },
        });
      }

      const targetDayDocuments = await session.tx.query({
        collection: courseDaysCollectionPath(targetCourseId),
        where: { field: 'courseId', op: '==', value: targetCourseId },
      });
      session.plan.planRead({
        path: `${courseDaysCollectionPath(targetCourseId)}/query`,
        category: 'aggregate',
      });
      targetCourseDays = sortedCourseDays(
        parseCourseDays(targetDayDocuments.map((document) => ({ data: document.data ?? {} })))
      );
      if (!courseScheduleIsComplete(targetCourse, targetCourseDays)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'targetCourseId', reason: 'unsupported' },
        });
      }

      const paymentDocumentPath = paymentPath(enrollment.paymentId);
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict' },
        });
      }
      payment = parsedPayment;
      assertCourseEnrollmentPaymentIdentity(envelope.context.correlationId, enrollment, payment);

      const claimMetadata = { ...metadata, decidedAt: environment.clock.decidedAt() };
      plannedReleaseClaims = await planReleaseCourseEnrollmentClaims(session, {
        metadata: claimMetadata,
        enrollment,
        course: sourceCourse,
        courseDays: sourceCourseDays,
        now,
        releaseSeat: true,
        releaseFutureDayClaimsOnly: false,
      });

      const guardOverlay: InTransactionGuardOverlay = new Map();
      for (const dayClaimPlan of plannedReleaseClaims.dayClaimPlans) {
        registerResourceClaimPlanInGuardOverlay(guardOverlay, dayClaimPlan);
      }
      if (plannedReleaseClaims.seatClaimPlan) {
        registerResourceClaimPlanInGuardOverlay(guardOverlay, plannedReleaseClaims.seatClaimPlan);
      }

      plannedAcquireClaims = await planAcquireCourseEnrollmentClaims(session, {
        metadata: claimMetadata,
        enrollment: { ...enrollment, courseId: targetCourseId },
        course: targetCourse,
        courseDays: targetCourseDays,
        decidedAtTimestamp: now,
        inTransactionGuardOverlay: guardOverlay,
      });

      await moveActiveCourseEnrollmentGuard(session, {
        participantId: enrollment.participantId,
        oldCourseId: enrollment.courseId,
        newCourseId: targetCourseId,
        courseEnrollmentId: enrollment.enrollmentId,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      });

      const newPrice = targetCourse.price;
      if (newPrice !== payment.price) {
        const priceDelta = newPrice - payment.price;
        let fundingAmount: KztMinorUnits | undefined;
        if (priceDelta > 0 && payment.payerAccountId) {
          const walletDocumentPath = walletPath(payment.payerAccountId);
          const walletRead = await session.tx.get({ path: walletDocumentPath });
          session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
          const walletBalance = walletRead.exists
            ? (parseWallet(walletRead.exists ? walletRead.data : undefined)?.balance ?? 0)
            : 0;
          fundingAmount = KztMinorUnitsSchema.parse(Math.min(walletBalance, priceDelta));
        }
        plannedTransferFinance = await planCourseEnrollmentTransferFinance(session, {
          envelope,
          enrollment,
          payment,
          newPrice,
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          decidedAt: now,
          fundingAmount,
          walletAccountId: payment.payerAccountId,
        });
      }

      plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
      plannedSourceCourseRevision = nextAggregateRevision(sourceCourse.revision);
      plannedTargetCourseRevision = nextAggregateRevision(targetCourse.revision);

      session.plan.planMutation({
        path: enrollmentDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
      });
      planCourseCapacityMutation(session, sourceCoursePath);
      planCourseCapacityMutation(session, targetCoursePath);
    },
    planAuditOutbox: async () =>
      buildTransferCourseEnrollmentAuditPlan({
        envelope,
        courseEnrollmentId: enrollment.enrollmentId,
        sourceCourseId: enrollment.courseId,
        targetCourseId,
        enrollmentRevision: plannedEnrollmentRevision,
        sourceCourseRevision: plannedSourceCourseRevision,
        targetCourseRevision: plannedTargetCourseRevision,
        paymentId: plannedTransferFinance ? enrollment.paymentId : undefined,
        paymentRevision: plannedTransferFinance?.paymentRevision,
        monetaryEventIds: plannedTransferFinance?.monetaryEvents.map((event) => event.eventId) ?? [],
        walletRevision: plannedTransferFinance?.wallet?.revision,
        walletAccountId: plannedTransferFinance?.payment.payerAccountId,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const claimMetadata = { ...metadata, decidedAt: context.decidedAt };

      const updatedEnrollment = CourseEnrollmentSchema.parse({
        ...enrollment,
        courseId: targetCourseId,
        revision: plannedEnrollmentRevision,
        updatedAt: decidedAt,
        audit: {
          ...enrollment.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.update(
        { path: enrollmentDocumentPath },
        enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
      );

      commitPlannedCourseEnrollmentClaimRelease(session, {
        metadata: claimMetadata,
        enrollment,
        planned: plannedReleaseClaims,
      });
      commitPlannedCourseEnrollmentClaimAcquire(session, {
        metadata: claimMetadata,
        seatClaimPlan: plannedAcquireClaims.seatClaimPlan,
        dayClaimPlans: plannedAcquireClaims.dayClaimPlans,
      });

      if (plannedTransferFinance) {
        commitPlannedCourseEnrollmentTransferFinance(session, plannedTransferFinance);
      }

      const updatedSourceCourse: Course = {
        ...sourceCourse,
        capacity: {
          ...sourceCourse.capacity,
          availableSeats: sourceCourse.capacity.availableSeats + 1,
        },
        revision: plannedSourceCourseRevision,
        updatedAt: decidedAt,
        audit: {
          ...sourceCourse.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };
      const updatedTargetCourse: Course = {
        ...targetCourse,
        capacity: {
          ...targetCourse.capacity,
          availableSeats: targetCourse.capacity.availableSeats - 1,
        },
        revision: plannedTargetCourseRevision,
        updatedAt: decidedAt,
        audit: {
          ...targetCourse.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };
      session.tx.update(
        { path: coursePath(enrollment.courseId) },
        courseToFirestoreWritePayload(updatedSourceCourse as Record<string, unknown>)
      );
      session.tx.update(
        { path: coursePath(targetCourseId) },
        courseToFirestoreWritePayload(updatedTargetCourse as Record<string, unknown>)
      );

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: enrollmentDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function routeRequestCourseEnrollmentCancellationHandler(
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  guestEnvironment: GuestCourseEnrollmentCommandEnvironment
): Promise<CommandResult<'request_course_enrollment_cancellation'>> {
  if (envelope.context.source === 'guest_callable') {
    return requestPendingGuestCourseEnrollmentCancellationHandler(
      envelope,
      guestEnvironment,
      executor
    );
  }
  return requestAuthenticatedCourseEnrollmentCancellationHandler(envelope, environment, executor);
}

export function createCourseEnrollmentLifecycleCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  guestEnvironmentFactory: (
    environment: CommandExecutionEnvironment
  ) => GuestCourseEnrollmentCommandEnvironment
): Pick<
  CommandHandlerMap,
  | 'transfer_course_enrollment'
  | 'withdraw_course_enrollment'
  | 'request_course_enrollment_cancellation'
  | 'resolve_course_enrollment_cancellation'
> {
  return {
    transfer_course_enrollment: (envelope, environment) =>
      transferCourseEnrollmentHandler(envelope, environment, executor),
    withdraw_course_enrollment: (envelope, environment) =>
      withdrawCourseEnrollmentCancellationRequestHandler(envelope, environment, executor),
    request_course_enrollment_cancellation: (envelope, environment) =>
      routeRequestCourseEnrollmentCancellationHandler(
        envelope,
        environment,
        executor,
        guestEnvironmentFactory(environment)
      ),
    resolve_course_enrollment_cancellation: (envelope, environment) =>
      resolveCourseEnrollmentCancellationHandler(envelope, environment, executor),
  };
}
