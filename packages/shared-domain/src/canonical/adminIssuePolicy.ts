import {
  AdminIssueSchema,
  adminIssueDedupeIdentityFromRecord,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
  type AdminIssue,
  type AdminIssueDedupeIdentityInput,
  type AdminIssueKind,
  type AdminIssueSeverity,
} from './courseEnrollmentAttendanceAdminIssue';
import { CanonicalCommandError } from './errors';
import type {
  AccountId,
  BookingId,
  CorrelationId,
  CourseEnrollmentId,
  OccurrenceId,
} from './identifiers';
import {
  isPaymentFullyFundedForService,
  paymentIdMatchesSubject,
  type Payment,
} from './paymentWallet';
import { compareCanonicalTimestamps, type CanonicalTimestamp } from './primitives';
import { assertExpectedRevision, nextAggregateRevision } from './revisionConcurrency';
import type { Booking } from './bookingOccurrenceProposalChange';
import type { Course, CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import { courseEnrollmentSeatOccurrenceId, paymentIdFromBookingId, paymentIdFromCourseEnrollmentId } from './deterministicIdentity';
import type { CommandActor } from './commands/actors';
import type { ExercisedCapability } from './commands/capabilities';

export const PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION =
  'Payment required—do not start' as const;

export interface AdminIssueKindPolicy {
  readonly severity: AdminIssueSeverity;
  readonly blocksOutcome: boolean;
  readonly blocksDelivery: boolean;
  readonly allowDismiss: boolean;
  readonly requireCoupledDomainCommandToResolve: boolean;
}

export const ADMIN_ISSUE_KIND_POLICIES: Record<AdminIssueKind, AdminIssueKindPolicy> = {
  missing_attendance: {
    severity: 'normal',
    blocksOutcome: true,
    blocksDelivery: false,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
  payment_required_at_start: {
    severity: 'urgent',
    blocksOutcome: true,
    blocksDelivery: true,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
  unresolved_pending_cancellation: {
    severity: 'normal',
    blocksOutcome: true,
    blocksDelivery: true,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
  attendance_payment_conflict: {
    severity: 'critical',
    blocksOutcome: true,
    blocksDelivery: true,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
  resource_reconciliation_mismatch: {
    severity: 'urgent',
    blocksOutcome: false,
    blocksDelivery: false,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
  financial_reconciliation_mismatch: {
    severity: 'urgent',
    blocksOutcome: false,
    blocksDelivery: false,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
  outcome_correction_required: {
    severity: 'urgent',
    blocksOutcome: true,
    blocksDelivery: false,
    allowDismiss: false,
    requireCoupledDomainCommandToResolve: true,
  },
};

export function adminIssueKindPolicy(kind: AdminIssueKind): AdminIssueKindPolicy {
  return ADMIN_ISSUE_KIND_POLICIES[kind];
}

export function paymentRequiredAtStartIdentity(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: OccurrenceId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'payment_required_at_start',
    subjectKind: 'booking',
    subjectId: input.bookingId,
    occurrenceId: input.occurrenceId,
  };
}

export function paymentRequiredAtStartCourseEnrollmentIdentity(input: {
  readonly enrollmentId: CourseEnrollmentId;
  readonly occurrenceId: OccurrenceId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'payment_required_at_start',
    subjectKind: 'course_enrollment',
    subjectId: input.enrollmentId,
    occurrenceId: input.occurrenceId,
  };
}

export function paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(
  enrollmentId: CourseEnrollmentId
): AdminIssueDedupeIdentityInput {
  return paymentRequiredAtStartCourseEnrollmentIdentity({
    enrollmentId,
    occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
  });
}

export type PaymentStartGateDecision =
  | { readonly outcome: 'too_early' }
  | { readonly outcome: 'ineligible_terminal' }
  | { readonly outcome: 'ineligible_not_confirmed' }
  | { readonly outcome: 'ineligible_not_individual' }
  | { readonly outcome: 'unsupported_subject' }
  | { readonly outcome: 'fully_funded' }
  | { readonly outcome: 'underfunded' };

export function evaluateIndividualBookingPaymentStartGate(input: {
  readonly now: CanonicalTimestamp;
  readonly subjectKind: 'booking' | 'course_enrollment';
  readonly booking?: Booking;
  readonly payment?: Payment;
}): PaymentStartGateDecision {
  if (input.subjectKind !== 'booking') {
    return { outcome: 'unsupported_subject' };
  }
  if (!input.booking || !input.payment) {
    return { outcome: 'unsupported_subject' };
  }

  if (input.booking.party.kind !== 'individual') {
    return { outcome: 'ineligible_not_individual' };
  }

  const status = input.booking.lifecycle.status;
  if (status === 'cancelled' || status === 'completed' || status === 'no_show') {
    return { outcome: 'ineligible_terminal' };
  }
  if (status !== 'confirmed') {
    return { outcome: 'ineligible_not_confirmed' };
  }

  if (compareCanonicalTimestamps(input.now, input.booking.occurrence.interval.startsAt) < 0) {
    return { outcome: 'too_early' };
  }

  return isPaymentFullyFundedForService(input.payment)
    ? { outcome: 'fully_funded' }
    : { outcome: 'underfunded' };
}

export function evaluateCourseEnrollmentPaymentStartGate(input: {
  readonly now: CanonicalTimestamp;
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly payment: Payment;
}): PaymentStartGateDecision {
  const status = input.enrollment.lifecycle.status;
  if (
    status === 'cancelled' ||
    status === 'withdrawn' ||
    status === 'completed' ||
    status === 'no_show'
  ) {
    return { outcome: 'ineligible_terminal' };
  }
  if (status !== 'confirmed') {
    return { outcome: 'ineligible_not_confirmed' };
  }
  if (compareCanonicalTimestamps(input.now, input.course.startAt) < 0) {
    return { outcome: 'too_early' };
  }
  return isPaymentFullyFundedForService(input.payment)
    ? { outcome: 'fully_funded' }
    : { outcome: 'underfunded' };
}

export function isCourseEnrollmentPaymentStartRestrictionActive(input: {
  readonly now: CanonicalTimestamp;
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly payment: Payment;
  readonly openPaymentRequiredAtStartIssue: boolean;
}): boolean {
  if (input.openPaymentRequiredAtStartIssue) {
    return true;
  }
  return (
    evaluateCourseEnrollmentPaymentStartGate({
      now: input.now,
      enrollment: input.enrollment,
      course: input.course,
      payment: input.payment,
    }).outcome === 'underfunded'
  );
}

export function assertCourseEnrollmentPaymentIdentity(
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

export function assertBookingPaymentIdentity(
  correlationId: CorrelationId,
  booking: Booking,
  payment: Payment
): void {
  const expectedPaymentId = paymentIdFromBookingId(booking.bookingId);
  if (
    booking.paymentId !== payment.paymentId ||
    payment.paymentId !== expectedPaymentId ||
    !paymentIdMatchesSubject(payment, {
      subjectType: 'booking',
      subjectId: booking.bookingId,
    })
  ) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { field: 'paymentId', reason: 'conflict', resourceKind: 'booking' },
    });
  }
}

export function assertCompatibleAdminIssueIdentity(
  correlationId: CorrelationId,
  existing: AdminIssue,
  identity: AdminIssueDedupeIdentityInput
): void {
  const expectedKey = adminIssueDedupeKeyFromIdentity(identity);
  const expectedId = adminIssueIdFromDedupeKey(expectedKey);
  const actualKey = adminIssueDedupeKeyFromIdentity(adminIssueDedupeIdentityFromRecord(existing));
  if (
    existing.issueId !== expectedId ||
    existing.dedupeKey !== expectedKey ||
    actualKey !== expectedKey
  ) {
    throw new CanonicalCommandError('audit_integrity_violation', { correlationId });
  }
}

export interface OpenAdminIssueInput {
  readonly identity: AdminIssueDedupeIdentityInput;
  readonly now: CanonicalTimestamp;
  readonly correlationId: CorrelationId;
  readonly commandId: string;
  readonly causationId?: string;
}

export function createOpenAdminIssue(input: OpenAdminIssueInput): AdminIssue {
  const policy = adminIssueKindPolicy(input.identity.kind);
  const dedupeKey = adminIssueDedupeKeyFromIdentity(input.identity);
  const issueId = adminIssueIdFromDedupeKey(dedupeKey);
  const subjectRef =
    input.identity.subjectKind === 'booking'
      ? { subjectKind: 'booking' as const, bookingId: input.identity.subjectId as BookingId }
      : {
          subjectKind: 'course_enrollment' as const,
          enrollmentId: input.identity.subjectId as CourseEnrollmentId,
        };

  return AdminIssueSchema.parse({
    issueId,
    kind: input.identity.kind,
    subjectRef,
    ...(input.identity.occurrenceId === undefined
      ? {}
      : { occurrenceId: input.identity.occurrenceId }),
    ...(input.identity.participantId === undefined
      ? {}
      : { participantId: input.identity.participantId }),
    ...(input.identity.courseDayId === undefined
      ? {}
      : { courseDayId: input.identity.courseDayId }),
    ...(input.identity.scheduleRevision === undefined
      ? {}
      : { scheduleRevision: input.identity.scheduleRevision }),
    ...(input.identity.reconciliationScope === undefined
      ? {}
      : { reconciliationScope: input.identity.reconciliationScope }),
    lifecycle: {
      status: 'open',
      openedAt: input.now,
      lastDetectedAt: input.now,
    },
    severity: policy.severity,
    blocksOutcome: policy.blocksOutcome,
    blocksDelivery: policy.blocksDelivery,
    dedupeKey,
    revision: 1,
    correlationId: input.correlationId,
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    createdAt: input.now,
    updatedAt: input.now,
    audit: {
      createdByCommandId: input.commandId,
      lastChangedByCommandId: input.commandId,
      correlationId: input.correlationId,
    },
  });
}

export function reuseOrReopenAdminIssue(
  existing: AdminIssue,
  input: OpenAdminIssueInput
): AdminIssue {
  assertCompatibleAdminIssueIdentity(input.correlationId, existing, input.identity);
  const openedAt = existing.lifecycle.openedAt;
  const nextLifecycle =
    existing.lifecycle.status === 'open'
      ? {
          status: 'open' as const,
          openedAt,
          lastDetectedAt: input.now,
          ...(existing.lifecycle.reopenedAt === undefined
            ? {}
            : { reopenedAt: existing.lifecycle.reopenedAt }),
        }
      : {
          status: 'open' as const,
          openedAt,
          lastDetectedAt: input.now,
          reopenedAt: input.now,
        };

  return AdminIssueSchema.parse({
    ...existing,
    lifecycle: nextLifecycle,
    revision: nextAggregateRevision(existing.revision),
    correlationId: input.correlationId,
    updatedAt: input.now,
    audit: {
      ...existing.audit,
      lastChangedByCommandId: input.commandId,
      correlationId: input.correlationId,
    },
  });
}

export interface AdminIssueLifecycleActor {
  readonly actor: CommandActor;
  readonly exercisedCapability: ExercisedCapability;
}

export function assertAdministratorMayMutateAdminIssue(
  correlationId: CorrelationId,
  actor: AdminIssueLifecycleActor
): AccountId {
  if (actor.actor.kind !== 'account' || actor.exercisedCapability !== 'administrator') {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  return actor.actor.accountId;
}

function resolveIssueActorAccountId(
  correlationId: CorrelationId,
  actor: AdminIssueLifecycleActor
): AccountId {
  return assertAdministratorMayMutateAdminIssue(correlationId, actor);
}

function assertOwnerMayResolveUnresolvedPendingCancellation(
  correlationId: CorrelationId,
  existing: AdminIssue,
  input: OwnerWithdrawalUnresolvedPendingCancellationResolutionInput
): AccountId {
  if (existing.kind !== 'unresolved_pending_cancellation') {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  if (
    existing.subjectRef.subjectKind !== 'booking' ||
    existing.subjectRef.bookingId !== input.bookingId
  ) {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  if (input.actor.actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  if (
    input.actor.exercisedCapability !== 'account_owner' &&
    input.actor.exercisedCapability !== 'parent_guardian'
  ) {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  return input.actor.actor.accountId;
}

function assertOwnerMayResolveUnresolvedCourseEnrollmentPendingCancellation(
  correlationId: CorrelationId,
  existing: AdminIssue,
  input: OwnerWithdrawalUnresolvedCourseEnrollmentPendingCancellationResolutionInput
): AccountId {
  if (existing.kind !== 'unresolved_pending_cancellation') {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  if (
    existing.subjectRef.subjectKind !== 'course_enrollment' ||
    existing.subjectRef.enrollmentId !== input.enrollmentId
  ) {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  if (input.actor.actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  if (
    input.actor.exercisedCapability !== 'account_owner' &&
    input.actor.exercisedCapability !== 'parent_guardian'
  ) {
    throw new CanonicalCommandError('forbidden', { correlationId });
  }
  return input.actor.actor.accountId;
}

export interface ResolveOrDismissAdminIssueInput {
  readonly expectedRevision: AdminIssue['revision'];
  readonly now: CanonicalTimestamp;
  readonly correlationId: CorrelationId;
  readonly commandId: string;
  readonly reason: string;
  readonly actor: AdminIssueLifecycleActor;
  readonly coupledDomainCommand: boolean;
}

export interface OwnerWithdrawalUnresolvedPendingCancellationResolutionInput {
  readonly expectedRevision: AdminIssue['revision'];
  readonly now: CanonicalTimestamp;
  readonly correlationId: CorrelationId;
  readonly commandId: string;
  readonly reason: string;
  readonly actor: AdminIssueLifecycleActor;
  readonly bookingId: BookingId;
}

export interface OwnerWithdrawalUnresolvedCourseEnrollmentPendingCancellationResolutionInput {
  readonly expectedRevision: AdminIssue['revision'];
  readonly now: CanonicalTimestamp;
  readonly correlationId: CorrelationId;
  readonly commandId: string;
  readonly reason: string;
  readonly actor: AdminIssueLifecycleActor;
  readonly enrollmentId: CourseEnrollmentId;
}

function assertOpenIssue(correlationId: CorrelationId, issue: AdminIssue): void {
  if (issue.lifecycle.status !== 'open') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId,
      details: { reason: 'conflict' },
    });
  }
}

function applyTerminalIssueLifecycle(
  existing: AdminIssue,
  input: Readonly<{
    expectedRevision: AdminIssue['revision'];
    now: CanonicalTimestamp;
    correlationId: CorrelationId;
    commandId: string;
    reason: string;
  }>,
  status: 'resolved' | 'dismissed',
  resolvedByAccountId: AccountId
): AdminIssue {
  assertExpectedRevision({
    correlationId: input.correlationId,
    expectedRevision: input.expectedRevision,
    currentRevision: existing.revision,
    requireExpectedRevision: true,
  });
  assertOpenIssue(input.correlationId, existing);

  const reason = input.reason.trim();
  if (!reason) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.correlationId,
      details: { field: 'reason', reason: 'required' },
    });
  }

  return AdminIssueSchema.parse({
    ...existing,
    lifecycle: {
      status,
      openedAt: existing.lifecycle.openedAt,
      lastDetectedAt: existing.lifecycle.lastDetectedAt,
      ...(existing.lifecycle.reopenedAt === undefined
        ? {}
        : { reopenedAt: existing.lifecycle.reopenedAt }),
      resolvedAt: input.now,
      resolution: {
        reason,
        resolvedByAccountId,
      },
    },
    revision: nextAggregateRevision(existing.revision),
    updatedAt: input.now,
    audit: {
      ...existing.audit,
      lastChangedByCommandId: input.commandId,
      correlationId: input.correlationId,
    },
  });
}

export function resolveAdminIssue(
  existing: AdminIssue,
  input: ResolveOrDismissAdminIssueInput
): AdminIssue {
  const policy = adminIssueKindPolicy(existing.kind);
  if (policy.requireCoupledDomainCommandToResolve && !input.coupledDomainCommand) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: input.correlationId,
      details: { reason: 'unsupported' },
    });
  }
  const resolvedByAccountId = resolveIssueActorAccountId(input.correlationId, input.actor);
  return applyTerminalIssueLifecycle(existing, input, 'resolved', resolvedByAccountId);
}

export function resolveUnresolvedPendingCancellationForOwnerWithdrawal(
  existing: AdminIssue,
  input: OwnerWithdrawalUnresolvedPendingCancellationResolutionInput
): AdminIssue {
  const resolvedByAccountId = assertOwnerMayResolveUnresolvedPendingCancellation(
    input.correlationId,
    existing,
    input
  );
  return applyTerminalIssueLifecycle(existing, input, 'resolved', resolvedByAccountId);
}

export function resolveUnresolvedCourseEnrollmentPendingCancellationForOwnerWithdrawal(
  existing: AdminIssue,
  input: OwnerWithdrawalUnresolvedCourseEnrollmentPendingCancellationResolutionInput
): AdminIssue {
  const resolvedByAccountId = assertOwnerMayResolveUnresolvedCourseEnrollmentPendingCancellation(
    input.correlationId,
    existing,
    input
  );
  return applyTerminalIssueLifecycle(existing, input, 'resolved', resolvedByAccountId);
}

export function dismissAdminIssue(
  existing: AdminIssue,
  input: ResolveOrDismissAdminIssueInput
): AdminIssue {
  const policy = adminIssueKindPolicy(existing.kind);
  if (!policy.allowDismiss) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: input.correlationId,
      details: { reason: 'unsupported' },
    });
  }
  const resolvedByAccountId = resolveIssueActorAccountId(input.correlationId, input.actor);
  return applyTerminalIssueLifecycle(existing, input, 'dismissed', resolvedByAccountId);
}

export interface SanitizedPaymentStartGateInstructorView {
  readonly restriction: 'payment_required_at_start';
  readonly instruction: typeof PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION;
  readonly blocksDelivery: true;
}

export function sanitizePaymentStartGateForInstructor(
  issue: Pick<AdminIssue, 'kind' | 'blocksDelivery' | 'lifecycle'>
): SanitizedPaymentStartGateInstructorView | undefined {
  if (
    issue.kind !== 'payment_required_at_start' ||
    issue.lifecycle.status !== 'open' ||
    issue.blocksDelivery !== true
  ) {
    return undefined;
  }
  return {
    restriction: 'payment_required_at_start',
    instruction: PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION,
    blocksDelivery: true,
  };
}

export function sanitizedInstructorViewOmitsFinancialFields(
  view: SanitizedPaymentStartGateInstructorView
): boolean {
  const serialized = JSON.stringify(view);
  return !/(price|paidAmount|outstandingAmount|retainedAmount|writtenOffAmount|balance|refund)/i.test(
    serialized
  );
}
