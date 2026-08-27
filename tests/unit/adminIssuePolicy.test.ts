import { describe, expect, it } from 'vitest';
import {
  ADMIN_ISSUE_KIND_POLICIES,
  AdminIssueSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  BookingSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  CourseSchema,
  CourseEnrollmentSchema,
  CanonicalCommandError,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  PaymentSchema,
  accountCommandActor,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  assertBookingPaymentIdentity,
  createOpenAdminIssue,
  dismissAdminIssue,
  evaluateIndividualBookingPaymentStartGate,
  evaluateCourseEnrollmentPaymentStartGate,
  hasAuditEffectRegistryEntry,
  hasAuditReasonRegistryEntry,
  isCourseEnrollmentPaymentStartRestrictionActive,
  isPaymentFullyFundedForService,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  paymentRequiredAtStartIdentity,
  resolveAdminIssue,
  resolveUnresolvedPendingCancellationForOwnerWithdrawal,
  reuseOrReopenAdminIssue,
  sanitizePaymentStartGateForInstructor,
  sanitizedInstructorViewOmitsFinancialFields,
  systemCommandActor,
  timestampFromDate,
  unresolvedPendingCancellationIdentity,
  validateAuditEffectsForCommand,
  validateAuditReason,
} from '@ski-academy/shared-domain';

const correlationId = CorrelationIdSchema.parse('correlation_admin_issue_policy_01');
const bookingId = BookingIdSchema.parse('booking_admin_issue_policy_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_admin_issue_policy_01');
const now = timestampFromDate(new Date('2026-01-15T04:00:00.000Z'));
const beforeStart = timestampFromDate(new Date('2026-01-15T03:59:59.000Z'));
const commandId = 'command_admin_issue_policy_01';
const accountId = 'account_admin_issue_policy_01';

const identity = paymentRequiredAtStartIdentity({ bookingId, occurrenceId });
const pendingCancellationIdentity = unresolvedPendingCancellationIdentity({
  bookingId,
  occurrenceId,
});
const unrelatedBookingId = BookingIdSchema.parse('booking_admin_issue_policy_other');
const unrelatedPendingCancellationIdentity = unresolvedPendingCancellationIdentity({
  bookingId: unrelatedBookingId,
  occurrenceId,
});

function metadata() {
  return {
    revision: 1,
    createdAt: now,
    updatedAt: now,
    audit: {
      createdByCommandId: commandId,
      lastChangedByCommandId: commandId,
      correlationId,
    },
  } as const;
}

function confirmedBooking(overrides: Record<string, unknown> = {}) {
  const paymentId = paymentIdFromBookingId(bookingId);
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId },
    },
    party: {
      kind: 'individual',
      participantIds: ['participant_admin_issue_policy_01'],
    },
    occurrence: {
      occurrenceId,
      instructorId: 'instructor_admin_issue_policy_01',
      interval: {
        startsAt: now,
        endsAt: timestampFromDate(new Date('2026-01-15T05:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: {
        participantIds: ['participant_admin_issue_policy_01'],
      },
    },
    lifecycle: { status: 'confirmed' },
    paymentId,
    payerAccountId: accountId,
    ...metadata(),
    ...overrides,
  });
}

function paymentFor(
  booking: ReturnType<typeof confirmedBooking>,
  fields: {
    paidAmount: number;
    refundedAmount?: number;
    retainedAmount: number;
    settledAmount: number;
    writtenOffAmount?: number;
    outstandingAmount: number;
    paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'partially_refunded';
  }
) {
  return PaymentSchema.parse({
    paymentId: booking.paymentId,
    subjectType: 'booking',
    subjectId: booking.bookingId,
    currency: 'KZT',
    originalPrice: 100_000,
    price: 100_000,
    paidAmount: fields.paidAmount,
    refundedAmount: fields.refundedAmount ?? 0,
    retainedAmount: fields.retainedAmount,
    settledAmount: fields.settledAmount,
    writtenOffAmount: fields.writtenOffAmount ?? 0,
    outstandingAmount: fields.outstandingAmount,
    paymentStatus: fields.paymentStatus,
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt: now,
    updatedAt: now,
  });
}

describe('AdminIssue policy and lifecycle', () => {
  it('derives a deterministic payment_required_at_start identity', () => {
    const again = paymentRequiredAtStartIdentity({ bookingId, occurrenceId });
    expect(adminIssueDedupeKeyFromIdentity(identity)).toBe(adminIssueDedupeKeyFromIdentity(again));
    expect(adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity))).toBe(
      adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(again))
    );
  });

  it('rejects arbitrary caller-controlled dedupe strings', () => {
    const issue = createOpenAdminIssue({
      identity,
      now,
      correlationId,
      commandId,
    });
    expect(
      AdminIssueSchema.safeParse({
        ...issue,
        dedupeKey: 'caller-controlled-dedupe',
      }).success
    ).toBe(false);
  });

  it('opens, reuses, and reopens without multiplying issues', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    expect(opened.lifecycle.status).toBe('open');
    expect(opened.kind).toBe('payment_required_at_start');
    expect(opened.blocksDelivery).toBe(true);
    expect(opened.blocksOutcome).toBe(true);
    expect(opened.severity).toBe('urgent');

    const reused = reuseOrReopenAdminIssue(opened, {
      identity,
      now: timestampFromDate(new Date('2026-01-15T04:05:00.000Z')),
      correlationId,
      commandId: 'command_admin_issue_policy_02',
    });
    expect(reused.issueId).toBe(opened.issueId);
    expect(reused.lifecycle.status).toBe('open');
    expect(reused.lifecycle.openedAt).toEqual(opened.lifecycle.openedAt);
    expect(reused.revision).toBe(2);

    const resolved = resolveAdminIssue(opened, {
      expectedRevision: opened.revision,
      now: timestampFromDate(new Date('2026-01-15T06:00:00.000Z')),
      correlationId,
      commandId: 'command_admin_issue_policy_resolve',
      reason: 'Coupled domain command resolved the funding condition',
      actor: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'administrator',
      },
      coupledDomainCommand: true,
    });
    expect(resolved.lifecycle.status).toBe('resolved');

    const reopened = reuseOrReopenAdminIssue(resolved, {
      identity,
      now: timestampFromDate(new Date('2026-01-15T07:00:00.000Z')),
      correlationId,
      commandId: 'command_admin_issue_policy_reopen',
    });
    expect(reopened.issueId).toBe(opened.issueId);
    expect(reopened.lifecycle.status).toBe('open');
    expect(reopened.lifecycle.openedAt).toEqual(opened.lifecycle.openedAt);
    expect(reopened.lifecycle.reopenedAt).toBeDefined();
  });

  it('rejects stale expectedRevision on resolve', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    expect(() =>
      resolveAdminIssue(opened, {
        expectedRevision: AggregateRevisionSchema.parse(9),
        now,
        correlationId,
        commandId,
        reason: 'Stale resolve attempt',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'administrator',
        },
        coupledDomainCommand: true,
      })
    ).toThrow(CanonicalCommandError);
  });

  it('forbids unauthorized actors from resolving or dismissing', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    expect(() =>
      resolveAdminIssue(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'Instructor should not resolve',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'instructor',
        },
        coupledDomainCommand: true,
      })
    ).toThrow(CanonicalCommandError);
    expect(() =>
      resolveAdminIssue(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'Account owner cannot use generic coupled resolve',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
        },
        coupledDomainCommand: true,
      })
    ).toThrow(CanonicalCommandError);
    expect(() =>
      resolveAdminIssue(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'System should not resolve',
        actor: {
          actor: systemCommandActor('system_admin_issue_policy_01'),
          exercisedCapability: 'system',
        },
        coupledDomainCommand: true,
      })
    ).toThrow(CanonicalCommandError);
  });

  it('scopes owner withdrawal to unresolved_pending_cancellation for the authorized booking', () => {
    const opened = createOpenAdminIssue({
      identity: pendingCancellationIdentity,
      now,
      correlationId,
      commandId,
    });
    const unrelatedIssue = createOpenAdminIssue({
      identity: unrelatedPendingCancellationIdentity,
      now,
      correlationId,
      commandId: 'command_admin_issue_policy_unrelated',
    });

    const resolved = resolveUnresolvedPendingCancellationForOwnerWithdrawal(opened, {
      expectedRevision: opened.revision,
      now: timestampFromDate(new Date('2026-01-15T06:00:00.000Z')),
      correlationId,
      commandId: 'command_admin_issue_policy_owner_withdraw',
      reason: 'Cancellation request withdrawn',
      actor: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner',
      },
      bookingId,
    });
    expect(resolved.lifecycle.status).toBe('resolved');

    expect(() =>
      resolveUnresolvedPendingCancellationForOwnerWithdrawal(unrelatedIssue, {
        expectedRevision: unrelatedIssue.revision,
        now,
        correlationId,
        commandId,
        reason: 'Owner cannot resolve unrelated booking issue',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
        },
        bookingId,
      })
    ).toThrow(CanonicalCommandError);

    expect(() =>
      resolveUnresolvedPendingCancellationForOwnerWithdrawal(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'Instructor cannot use owner withdrawal path',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'instructor',
        },
        bookingId,
      })
    ).toThrow(CanonicalCommandError);
  });

  it('does not mutate issue revision when unauthorized coupled resolution fails', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    const revisionBefore = opened.revision;
    const lifecycleBefore = opened.lifecycle;

    expect(() =>
      resolveAdminIssue(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'Unauthorized coupled resolve',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
        },
        coupledDomainCommand: true,
      })
    ).toThrow(CanonicalCommandError);

    expect(opened.revision).toBe(revisionBefore);
    expect(opened.lifecycle).toEqual(lifecycleBefore);
  });

  it('forbids standalone resolve and dismiss for payment_required_at_start', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    expect(ADMIN_ISSUE_KIND_POLICIES.payment_required_at_start.allowDismiss).toBe(false);
    expect(() =>
      resolveAdminIssue(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'Standalone resolve is not a domain command',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'administrator',
        },
        coupledDomainCommand: false,
      })
    ).toThrow(CanonicalCommandError);
    expect(() =>
      dismissAdminIssue(opened, {
        expectedRevision: opened.revision,
        now,
        correlationId,
        commandId,
        reason: 'Dismiss is forbidden for this kind',
        actor: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'administrator',
        },
        coupledDomainCommand: true,
      })
    ).toThrow(CanonicalCommandError);
  });

  it('resolves the issue document without carrying Booking or Payment fields', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    const resolved = resolveAdminIssue(opened, {
      expectedRevision: opened.revision,
      now: timestampFromDate(new Date('2026-01-15T06:00:00.000Z')),
      correlationId,
      commandId,
      reason: 'Coupled correction resolved the issue',
      actor: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'administrator',
      },
      coupledDomainCommand: true,
    });
    expect(resolved.lifecycle.status).toBe('resolved');
    expect('paymentId' in resolved).toBe(false);
    expect('lifecycle' in resolved && 'status' in resolved.lifecycle).toBe(true);
    expect(JSON.stringify(resolved)).not.toMatch(/outstandingAmount|paidAmount|price|balance/);
  });
});

describe('payment-at-start eligibility', () => {
  it('passes fully funded confirmed bookings at the start boundary', () => {
    const booking = confirmedBooking();
    const payment = paymentFor(booking, {
      paidAmount: 100_000,
      retainedAmount: 100_000,
      settledAmount: 100_000,
      outstandingAmount: 0,
      paymentStatus: 'paid',
    });
    expect(isPaymentFullyFundedForService(payment)).toBe(true);
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: 'booking',
        booking,
        payment,
      })
    ).toEqual({ outcome: 'fully_funded' });
  });

  it('fails outstanding, retained-below-price, and write-off cases', () => {
    const booking = confirmedBooking();
    const outstanding = paymentFor(booking, {
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
      paymentStatus: 'partially_paid',
    });
    const refunded = paymentFor(booking, {
      paidAmount: 100_000,
      refundedAmount: 20_000,
      retainedAmount: 80_000,
      settledAmount: 100_000,
      outstandingAmount: 0,
      paymentStatus: 'partially_refunded',
    });
    const writtenOff = paymentFor(booking, {
      paidAmount: 0,
      retainedAmount: 0,
      settledAmount: 0,
      writtenOffAmount: 100_000,
      outstandingAmount: 0,
      paymentStatus: 'unpaid',
    });
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: 'booking',
        booking,
        payment: outstanding,
      }).outcome
    ).toBe('underfunded');
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: 'booking',
        booking,
        payment: refunded,
      }).outcome
    ).toBe('underfunded');
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: 'booking',
        booking,
        payment: writtenOff,
      }).outcome
    ).toBe('underfunded');
  });

  it('rejects too-early, terminal, and non-individual subjects', () => {
    const booking = confirmedBooking();
    const payment = paymentFor(booking, {
      paidAmount: 0,
      retainedAmount: 0,
      settledAmount: 0,
      outstandingAmount: 100_000,
      paymentStatus: 'unpaid',
    });
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now: beforeStart,
        subjectKind: 'booking',
        booking,
        payment,
      }).outcome
    ).toBe('too_early');
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: 'booking',
        booking: confirmedBooking({
          lifecycle: {
            status: 'cancelled',
            cancelledAt: now,
            reasonCode: 'incomplete_payment',
          },
        }),
        payment,
      }).outcome
    ).toBe('ineligible_terminal');
    expect(
      evaluateIndividualBookingPaymentStartGate({
        now,
        subjectKind: 'course_enrollment',
        booking,
        payment,
      }).outcome
    ).toBe('unsupported_subject');
  });

  it('validates Payment belongs to the Booking', () => {
    const booking = confirmedBooking();
    const payment = paymentFor(booking, {
      paidAmount: 100_000,
      retainedAmount: 100_000,
      settledAmount: 100_000,
      outstandingAmount: 0,
      paymentStatus: 'paid',
    });
    expect(() => assertBookingPaymentIdentity(correlationId, booking, payment)).not.toThrow();
    expect(() =>
      assertBookingPaymentIdentity(correlationId, booking, {
        ...payment,
        subjectId: BookingIdSchema.parse('booking_admin_issue_policy_other'),
      })
    ).toThrow(CanonicalCommandError);
  });

  it('sanitizes instructor output without financial fields', () => {
    const opened = createOpenAdminIssue({ identity, now, correlationId, commandId });
    const view = sanitizePaymentStartGateForInstructor(opened);
    expect(view?.instruction).toBe('Payment required—do not start');
    expect(view && sanitizedInstructorViewOmitsFinancialFields(view)).toBe(true);
  });

  it('detects course enrollment payment restriction from Payment when gate issue is absent', () => {
    const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_admin_issue_policy_01');
    const courseId = CourseIdSchema.parse('course_admin_issue_policy_01');
    const enrollment = CourseEnrollmentSchema.parse({
      enrollmentId,
      participantId: 'participant_admin_issue_policy_01',
      courseId,
      originalCourseId: courseId,
      paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
      payerAccountId: 'account_admin_issue_policy_01',
      attribution: {
        bookingOrigin: 'admin',
        bookedBy: { kind: 'account', accountId: 'account_admin_issue_policy_01' },
      },
      lifecycle: { status: 'confirmed' },
      revision: 1,
      createdAt: now,
      updatedAt: now,
      audit: {
        createdByCommandId: commandId,
        lastChangedByCommandId: commandId,
        correlationId,
      },
    });
    const course = CourseSchema.parse({
      courseId,
      title: 'Policy Course',
      price: 100_000,
      capacity: { totalSeats: 8, availableSeats: 7 },
      instructorRosterIds: ['instructor_admin_issue_policy_01'],
      startAt: now,
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: timestampFromDate(new Date('2026-01-15T05:00:00.000Z')),
        courseScheduleRevision: 1,
      },
      revision: 1,
      createdAt: now,
      updatedAt: now,
      audit: {
        createdByCommandId: commandId,
        lastChangedByCommandId: commandId,
        correlationId,
      },
    });
    const payment = PaymentSchema.parse({
      paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
      subjectType: 'course_enrollment',
      subjectId: enrollmentId,
      currency: 'KZT',
      originalPrice: 100_000,
      price: 100_000,
      paidAmount: 0,
      refundedAmount: 0,
      retainedAmount: 0,
      settledAmount: 0,
      writtenOffAmount: 0,
      outstandingAmount: 100_000,
      paymentStatus: 'unpaid',
      incrementalRequirements: [],
      revision: 1,
      eventRevision: 1,
      payerAccountId: 'account_admin_issue_policy_01',
      createdAt: now,
      updatedAt: now,
    });
    expect(
      isCourseEnrollmentPaymentStartRestrictionActive({
        now,
        enrollment,
        course,
        payment,
        openPaymentRequiredAtStartIssue: false,
      })
    ).toBe(true);
    expect(
      evaluateCourseEnrollmentPaymentStartGate({
        now,
        enrollment,
        course,
        payment,
      })
    ).toEqual({ outcome: 'underfunded' });
    expect(
      isCourseEnrollmentPaymentStartRestrictionActive({
        now,
        enrollment,
        course,
        payment: {
          ...payment,
          paidAmount: 100_000,
          retainedAmount: 100_000,
          settledAmount: 100_000,
          outstandingAmount: 0,
          paymentStatus: 'paid',
        },
        openPaymentRequiredAtStartIssue: false,
      })
    ).toBe(false);
  });
});

describe('T14 audit registries', () => {
  it('is fail-closed for enforce_payment_start_gate reason and effect', () => {
    expect(hasAuditReasonRegistryEntry('enforce_payment_start_gate')).toBe(true);
    expect(hasAuditEffectRegistryEntry('enforce_payment_start_gate')).toBe(true);
    expect(() =>
      validateAuditReason(correlationId, 'enforce_payment_start_gate', {
        registryVersion: 'reason:v1',
        reasonCode: 'admin_issue_dismissal',
      })
    ).toThrow(CanonicalCommandError);
    expect(() =>
      validateAuditEffectsForCommand(correlationId, 'enforce_payment_start_gate', [
        { kind: 'payment_state_changed' },
      ])
    ).toThrow(CanonicalCommandError);
    expect(() =>
      validateAuditReason(correlationId, 'enforce_payment_start_gate', {
        registryVersion: 'reason:v1',
        reasonCode: 'scheduled_system_action',
      })
    ).not.toThrow();
    expect(() =>
      validateAuditEffectsForCommand(correlationId, 'enforce_payment_start_gate', [
        { kind: 'admin_issue_opened' },
      ])
    ).not.toThrow();
    expect(() =>
      validateAuditEffectsForCommand(correlationId, 'enforce_payment_start_gate', [
        { kind: 'admin_issue_resolved' },
      ])
    ).toThrow(CanonicalCommandError);
  });
});
