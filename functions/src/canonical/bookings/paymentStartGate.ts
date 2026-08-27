import {
  BookingIdSchema,
  CanonicalCommandError,
  CourseEnrollmentIdSchema,
  assertBookingPaymentIdentity,
  assertCourseEnrollmentPaymentIdentity,
  commandSuccessResult,
  evaluateCourseEnrollmentPaymentStartGate,
  evaluateIndividualBookingPaymentStartGate,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  paymentRequiredAtStartIdentity,
  resolveAdminIssueForCoupledReconciliation,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AdminIssue,
  type Booking,
  type Course,
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
import { parsePayment, paymentPath } from '../finance/financeStore';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
  toFirestoreWritePayload as toAdminIssueWritePayload,
} from '../adminIssues';
import { courseEnrollmentPath, parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { coursePath, parseCourse } from '../courses/courseStore';
import { resolvePaymentStartGateAuthorization } from './bookingAuthorization';
import { buildPaymentStartGateAuditPlan } from './bookingAudit';
import { bookingPath, parseBooking } from './bookingStore';

function gateError(
  envelope: CommandEnvelope<'enforce_payment_start_gate'>,
  code: 'invalid_transition' | 'validation' | 'forbidden',
  details?: ConstructorParameters<typeof CanonicalCommandError>[1]['details']
): never {
  throw new CanonicalCommandError(code, {
    correlationId: envelope.context.correlationId,
    ...(details === undefined ? {} : { details }),
  });
}

function enforcePaymentStartGateHandler(
  envelope: CommandEnvelope<'enforce_payment_start_gate'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'enforce_payment_start_gate'>> {
  const mode = resolvePaymentStartGateAuthorization(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);

  if (envelope.intent.subjectKind === 'course_enrollment') {
    return enforceCourseEnrollmentPaymentStartGateHandler(
      envelope,
      environment,
      executor,
      mode,
      identity
    );
  }

  const bookingId = BookingIdSchema.safeParse(envelope.intent.subjectId);
  if (!bookingId.success) {
    gateError(envelope, 'validation', { field: 'subjectId', reason: 'malformed' });
  }
  const bookingDocumentPath = bookingPath(bookingId.data);

  let booking!: Booking;
  let payment!: Payment;
  let existingIssue: AdminIssue | undefined;
  let plannedIssue: AdminIssue | undefined;
  let issueMutationKind: 'create' | 'update' | undefined;
  let issueDocumentPath = '';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'enforce_payment_start_gate'> = {
    read: async (session) => {
      plannedIssue = undefined;
      issueMutationKind = undefined;
      issueDocumentPath = '';

      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsedBooking) {
        gateError(envelope, 'validation', {
          field: 'bookingId',
          reason: 'conflict',
          resourceKind: 'booking',
        });
      }
      booking = parsedBooking;

      const paymentDocumentPath = paymentPath(booking.paymentId);
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        gateError(envelope, 'validation', {
          field: 'paymentId',
          reason: 'conflict',
          resourceKind: 'booking',
        });
      }
      payment = parsedPayment;
      assertBookingPaymentIdentity(envelope.context.correlationId, booking, payment);

      const issueIdentity = paymentRequiredAtStartIdentity({
        bookingId: booking.bookingId,
        occurrenceId: booking.occurrence.occurrenceId,
      });
      issueDocumentPath = plannedAdminIssuePath(issueIdentity);
      const issueRead = await session.tx.get({ path: issueDocumentPath });
      session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
      existingIssue = parseExistingAdminIssueOrCollision(
        envelope.context.correlationId,
        issueRead.exists ? issueRead.data : undefined
      );

      const now = timestampFromDate(environment.clock.now());
      const decision = evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: envelope.intent.subjectKind,
        booking,
        payment,
      });

      if (decision.outcome === 'too_early') {
        gateError(envelope, 'invalid_transition', { field: 'startsAt', reason: 'out_of_range' });
      }
      if (decision.outcome === 'ineligible_terminal') {
        gateError(envelope, 'invalid_transition', {
          resourceKind: 'booking',
          reason: 'unsupported',
        });
      }
      if (
        decision.outcome === 'ineligible_not_confirmed' ||
        decision.outcome === 'ineligible_not_individual' ||
        decision.outcome === 'unsupported_subject'
      ) {
        gateError(envelope, 'validation', { resourceKind: 'booking', reason: 'unsupported' });
      }

      if (decision.outcome !== 'underfunded') {
        return;
      }

      const opened = openOrReuseAdminIssue({
        existing: existingIssue,
        identity: issueIdentity,
        now,
        correlationId: envelope.context.correlationId,
        commandId: identity.commandKey,
        ...(envelope.context.causationId === undefined
          ? {}
          : { causationId: envelope.context.causationId }),
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
    planAuditOutbox: async () =>
      buildPaymentStartGateAuditPlan({
        subjectKind: 'booking',
        bookingId: booking.bookingId,
        mode,
        issue:
          plannedIssue === undefined
            ? undefined
            : {
                issueId: plannedIssue.issueId,
                revision: plannedIssue.revision,
                effect: issueMutationKind === 'create' ? 'opened' : 'reused',
              },
      }),
    execute: async (session) => {
      if (plannedIssue !== undefined && issueMutationKind !== undefined) {
        const payload = toAdminIssueWritePayload(plannedIssue as Record<string, unknown>);
        if (issueMutationKind === 'create') {
          session.tx.create({ path: issueDocumentPath }, payload);
        } else {
          session.tx.update({ path: issueDocumentPath }, payload);
        }
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

function enforceCourseEnrollmentPaymentStartGateHandler(
  envelope: CommandEnvelope<'enforce_payment_start_gate'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  mode: ReturnType<typeof resolvePaymentStartGateAuthorization>,
  identity: ReturnType<typeof resolveCommandIdempotencyIdentity>
): Promise<CommandResult<'enforce_payment_start_gate'>> {
  const enrollmentId = CourseEnrollmentIdSchema.safeParse(envelope.intent.subjectId);
  if (!enrollmentId.success) {
    gateError(envelope, 'validation', { field: 'subjectId', reason: 'malformed' });
  }
  const enrollmentDocumentPath = courseEnrollmentPath(enrollmentId.data);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let payment!: Payment;
  let existingIssue: AdminIssue | undefined;
  let plannedIssue: AdminIssue | undefined;
  let issueMutationKind: 'create' | 'update' | undefined;
  let issueDocumentPath = '';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'enforce_payment_start_gate'> = {
    read: async (session) => {
      plannedIssue = undefined;
      issueMutationKind = undefined;
      issueDocumentPath = '';

      const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
      session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
      const parsedEnrollment = parseCourseEnrollment(
        enrollmentRead.exists ? enrollmentRead.data : undefined
      );
      if (!parsedEnrollment) {
        gateError(envelope, 'validation', {
          field: 'courseEnrollmentId',
          reason: 'conflict',
          resourceKind: 'course_enrollment',
        });
      }
      enrollment = parsedEnrollment;

      const courseDocumentPath = coursePath(enrollment.courseId);
      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsedCourse) {
        gateError(envelope, 'validation', {
          field: 'courseId',
          reason: 'conflict',
          resourceKind: 'course_enrollment',
        });
      }
      course = parsedCourse;

      const paymentDocumentPath = paymentPath(enrollment.paymentId);
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        gateError(envelope, 'validation', {
          field: 'paymentId',
          reason: 'conflict',
          resourceKind: 'course_enrollment',
        });
      }
      payment = parsedPayment;
      assertCourseEnrollmentPaymentIdentity(envelope.context.correlationId, enrollment, payment);

      const issueIdentity = paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(
        enrollment.enrollmentId
      );
      issueDocumentPath = plannedAdminIssuePath(issueIdentity);
      const issueRead = await session.tx.get({ path: issueDocumentPath });
      session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
      existingIssue = parseExistingAdminIssueOrCollision(
        envelope.context.correlationId,
        issueRead.exists ? issueRead.data : undefined
      );

      const now = timestampFromDate(environment.clock.now());
      const decision = evaluateCourseEnrollmentPaymentStartGate({
        now,
        enrollment,
        course,
        payment,
      });

      if (decision.outcome === 'too_early') {
        gateError(envelope, 'invalid_transition', { field: 'startsAt', reason: 'out_of_range' });
      }
      if (decision.outcome === 'ineligible_terminal') {
        gateError(envelope, 'invalid_transition', {
          resourceKind: 'course_enrollment',
          reason: 'unsupported',
        });
      }
      if (decision.outcome === 'ineligible_not_confirmed') {
        gateError(envelope, 'validation', {
          resourceKind: 'course_enrollment',
          reason: 'unsupported',
        });
      }

      if (decision.outcome === 'fully_funded') {
        if (existingIssue?.lifecycle.status === 'open') {
          const resolved = resolveAdminIssueForCoupledReconciliation(existingIssue, {
            expectedRevision: existingIssue.revision,
            now,
            correlationId: envelope.context.correlationId,
            commandId: identity.commandKey,
            reason: 'Payment fully funded; payment-start restriction cleared',
            actor: {
              actor: envelope.context.actor,
              exercisedCapability: envelope.context.exercisedCapability,
            },
            coupledDomainCommand: true,
          });
          plannedIssue = resolved;
          issueMutationKind = 'update';
          session.plan.planMutation({
            path: issueDocumentPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
          });
        }
        return;
      }

      if (decision.outcome !== 'underfunded') {
        return;
      }

      const opened = openOrReuseAdminIssue({
        existing: existingIssue,
        identity: issueIdentity,
        now,
        correlationId: envelope.context.correlationId,
        commandId: identity.commandKey,
        ...(envelope.context.causationId === undefined
          ? {}
          : { causationId: envelope.context.causationId }),
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
    planAuditOutbox: async () =>
      buildPaymentStartGateAuditPlan({
        subjectKind: 'course_enrollment',
        enrollmentId: enrollment.enrollmentId,
        mode,
        issue:
          plannedIssue === undefined
            ? undefined
            : {
                issueId: plannedIssue.issueId,
                revision: plannedIssue.revision,
                effect:
                  issueMutationKind === 'create'
                    ? 'opened'
                    : plannedIssue.lifecycle.status === 'resolved'
                      ? 'resolved'
                      : 'reused',
              },
      }),
    execute: async (session) => {
      if (plannedIssue !== undefined && issueMutationKind !== undefined) {
        const payload = toAdminIssueWritePayload(plannedIssue as Record<string, unknown>);
        if (issueMutationKind === 'create') {
          session.tx.create({ path: issueDocumentPath }, payload);
        } else {
          session.tx.update({ path: issueDocumentPath }, payload);
        }
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

export function createPaymentStartGateCommandHandler(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'enforce_payment_start_gate'> {
  return {
    enforce_payment_start_gate: (envelope, environment) =>
      enforcePaymentStartGateHandler(envelope, environment, executor),
  };
}
