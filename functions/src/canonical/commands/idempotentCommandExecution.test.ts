import { describe, expect, it } from 'vitest';
import {
  accountCommandActor,
  AggregateRevisionSchema,
  AdministrativeAvailabilityBlockIdSchema,
  BookingIdSchema,
  CanonicalCommandError,
  commandErrorResult,
  commandSuccessResult,
  CorrelationIdSchema,
  AccountIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  resolveCommandIdempotencyIdentity,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from './commandClock';
import { executeIdempotentCanonicalCommand } from './idempotentCommandExecution';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_idem_fn_01');
const accountId = AccountIdSchema.parse('account_idem_fn_01');
const bookingPath = 'bookings/booking_idem_fn_01';

function envelope(
  idempotencyKey = 'idem-fn-01',
  expectedRevision?: number
): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      ...(expectedRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    },
    intent: { bookingId: BookingIdSchema.parse('booking_idem_fn_01') },
  };
}

function rescheduleEnvelope(
  idempotencyKey = 'idem-fn-reschedule-01',
  expectedRevision?: number
): CommandEnvelope<'reschedule_booking'> {
  return {
    kind: 'reschedule_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      ...(expectedRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    },
    intent: { bookingId: BookingIdSchema.parse('booking_idem_fn_01') },
  };
}

function createCourseEnrollmentsEnvelope(
  idempotencyKey = 'idem-fn-course-enroll-01'
): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
    },
    intent: {
      courseId: CourseIdSchema.parse('course_idem_fn_01'),
      participantIds: [ParticipantIdSchema.parse('participant_idem_fn_01')],
    },
  };
}

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

describe('executeIdempotentCanonicalCommand', () => {
  it('stores canonical results and replays without invoking the handler again', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });
    let handlerCalls = 0;
    let mutationCount = 0;

    const handler = {
      execute: async (session) => {
        handlerCalls += 1;
        mutationCount += 1;
        session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
        return commandSuccessResult('complete_booking', correlationId);
      },
    };

    const first = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-replay-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler,
    });
    const second = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-replay-01', 1),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler,
    });

    expect(first).toEqual(second);
    expect(handlerCalls).toBe(1);
    expect(mutationCount).toBe(1);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(2);

    const identity = resolveCommandIdempotencyIdentity(envelope('idem-replay-01', 1));
    expect(executor.snapshot().docs.has(identity.recordPath.slice(1))).toBe(true);
  });

  it('returns idempotency_conflict for the same key with a different fingerprint', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const handler = {
      execute: async () => commandSuccessResult('complete_booking', correlationId),
    };

    await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-conflict-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler,
    });

    const conflictEnvelope = envelope('idem-conflict-01', 1);
    conflictEnvelope.intent.bookingId = BookingIdSchema.parse('booking_idem_fn_02');

    const conflict = await executeIdempotentCanonicalCommand({
      envelope: conflictEnvelope,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler,
    });

    expect(conflict.status).toBe('error');
    if (conflict.status === 'error') {
      expect(conflict.error.code).toBe('idempotency_conflict');
    }
  });

  it('returns idempotency_conflict for the same key with a different command kind', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const handler = {
      execute: async () => commandSuccessResult('complete_booking', correlationId),
    };

    await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-conflict-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler,
    });

    const conflictEnvelope: CommandEnvelope<'reschedule_booking'> = {
      kind: 'reschedule_booking',
      context: envelope('idem-conflict-01').context,
      intent: { bookingId: BookingIdSchema.parse('booking_idem_fn_01') },
    };

    const conflict = await executeIdempotentCanonicalCommand({
      envelope: conflictEnvelope,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () => commandSuccessResult('reschedule_booking', correlationId),
      },
    });

    expect(conflict.status).toBe('error');
    if (conflict.status === 'error') {
      expect(conflict.error.code).toBe('idempotency_conflict');
    }
  });

  it('rejects stale revisions without mutating the aggregate or storing idempotency', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 5, status: 'confirmed' },
    });
    let handlerCalls = 0;

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-stale-01', 4),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        execute: async () => {
          handlerCalls += 1;
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
      expect(result.error.currentRevision).toBe(5);
    }
    expect(handlerCalls).toBe(0);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(5);

    const identity = resolveCommandIdempotencyIdentity(envelope('idem-stale-01', 4));
    expect(executor.snapshot().docs.has(identity.recordPath.slice(1))).toBe(false);
  });

  it('persists deterministic rejections for replay but not retryable internal failures', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const deterministic: CommandResult<'complete_booking'> = commandErrorResult(
      'complete_booking',
      correlationId,
      new CanonicalCommandError('forbidden', { correlationId }).toTransport()
    );

    const rejected = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-reject-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: { execute: async () => deterministic },
    });
    const replay = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-reject-01'),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () => commandSuccessResult('complete_booking', correlationId),
      },
    });

    expect(rejected).toEqual(deterministic);
    expect(replay).toEqual(deterministic);

    const transient = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-internal-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () =>
          commandErrorResult(
            'complete_booking',
            correlationId,
            new CanonicalCommandError('internal', { correlationId }).toTransport()
          ),
      },
    });
    const retryAfterTransient = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-internal-01'),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () => commandSuccessResult('complete_booking', correlationId),
      },
    });

    expect(transient.status).toBe('error');
    expect(retryAfterTransient.status).toBe('success');
  });

  it('aborts the transaction when a handler returns a retryable error after writes were staged', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const transient = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-transient-abort-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        execute: async (session) => {
          session.tx.update({ path: bookingPath }, { revision: 99, status: 'broken' });
          return commandErrorResult(
            'complete_booking',
            correlationId,
            new CanonicalCommandError('internal', { correlationId }).toTransport()
          );
        },
      },
    });

    expect(transient.status).toBe('error');
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(1);
  });

  it('does not double-increment revision when the transaction callback is retried', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      { [bookingPath]: { revision: 1, status: 'confirmed' } },
      { simulateRetry: true }
    );
    let attempt = 0;

    await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-retry-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        execute: async (session, ctx) => {
          attempt += 1;
          if (attempt === 1) {
            throw new CanonicalCommandError('concurrent_modification', { correlationId });
          }
          session.tx.update(
            { path: bookingPath },
            { revision: ctx.nextRevision(AggregateRevisionSchema.parse(1)), status: 'completed' }
          );
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(attempt).toBe(2);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(2);
  });

  it('bumps admin lesson bookings revision once for planned booking aggregate writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-admin-lesson-rev-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: bookingPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'bookings/booking_idem_fn_sibling',
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      payload: { adminLessonBookingsRevision: 1 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_lesson_bookings')?.data.revision).toBe(
      1
    );
    expect(executor.snapshot().docs.has('admin_runtime/admin_planner')).toBe(false);
  });

  it('bumps admin planner revision once for planned schedule writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const result = await executeIdempotentCanonicalCommand({
      envelope: rescheduleEnvelope('idem-admin-planner-rev-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: bookingPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'resource_claims/claim_idem_fn_01',
            kind: 'update',
            category: 'other',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'booking_change_requests/cr_idem_fn_01',
            kind: 'update',
            category: 'other',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.update({ path: bookingPath }, { revision: 2, status: 'confirmed' });
          return commandSuccessResult('reschedule_booking', correlationId);
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      payload: { adminLessonBookingsRevision: 1, adminPlannerRevision: 1 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_lesson_bookings')?.data.revision).toBe(
      1
    );
    expect(executor.snapshot().docs.get('admin_runtime/admin_planner')?.data.revision).toBe(1);
    expect(executor.snapshot().docs.has('admin_runtime/admin_finance')).toBe(false);
  });

  it('bumps admin planner revision for availability-block schedule writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const blockPath = 'administrative_availability_blocks/block_idem_fn_01';

    const result = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'create_administrative_availability_block',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-planner-block-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          blockId: AdministrativeAvailabilityBlockIdSchema.parse('block_idem_fn_01'),
          instructorId: InstructorIdSchema.parse('instructor_idem_fn_01'),
          kind: 'break',
          reasonExplanation: 'planner test',
        },
      },
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: blockPath,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: blockPath }, { revision: 1 });
          return commandSuccessResult(
            'create_administrative_availability_block',
            correlationId
          );
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      payload: { adminPlannerRevision: 1 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_planner')?.data.revision).toBe(1);
    expect(executor.snapshot().docs.has('admin_runtime/admin_lesson_bookings')).toBe(false);
  });

  it('bumps admin courses revision once for planned enrollment and course writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const enrollmentPath = 'course_enrollments/enrollment_idem_fn_01';
    const coursePath = 'courses/course_idem_fn_01';

    const result = await executeIdempotentCanonicalCommand({
      envelope: createCourseEnrollmentsEnvelope(),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: enrollmentPath,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: coursePath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'payments/pay_idem_fn_course_01',
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: enrollmentPath }, { revision: 1 });
          session.tx.create({ path: coursePath }, { revision: 1 });
          return commandSuccessResult('create_course_enrollments', correlationId, {
            outcome: 'created',
          });
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      payload: { outcome: 'created', adminCoursesRevision: 1, adminFinanceRevision: 1 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_courses')?.data.revision).toBe(1);
    expect(executor.snapshot().docs.get('admin_runtime/admin_finance')?.data.revision).toBe(1);
    expect(executor.snapshot().docs.has('admin_runtime/admin_lesson_bookings')).toBe(false);
  });

  it('does not bump admin courses revision for attendance-only or payment-only writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const attendanceResult = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'record_course_day_attendance',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-courses-rev-att-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          courseEnrollmentId: 'enrollment_idem_fn_01',
          courseDayId: 'day_idem_fn_01',
          attendanceStatus: 'present',
        },
      } as CommandEnvelope<'record_course_day_attendance'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: 'attendance/att_idem_fn_course_01',
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'course_enrollments/enrollment_idem_fn_01',
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: 'attendance/att_idem_fn_course_01' }, { status: 'present' });
          return commandSuccessResult('record_course_day_attendance', correlationId, {
            resolvedAdminIssueIds: [],
          });
        },
      },
    });

    expect(attendanceResult.status).toBe('success');
    if (attendanceResult.status === 'success') {
      expect(attendanceResult.payload).not.toHaveProperty('adminCoursesRevision');
      expect(attendanceResult.payload).not.toHaveProperty('adminFinanceRevision');
    }
    expect(executor.snapshot().docs.has('admin_runtime/admin_courses')).toBe(false);

    const paymentResult = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'record_provider_payment_event',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-courses-rev-pay-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          paymentId: 'payment_idem_fn_01',
          amount: 1,
          sourceKind: 'cash',
          manualReference: 'admin-cash:test',
        },
      } as CommandEnvelope<'record_provider_payment_event'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: 'payments/pay_idem_fn_01',
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: 'payments/pay_idem_fn_01' }, { status: 'paid' });
          return commandSuccessResult('record_provider_payment_event', correlationId);
        },
      },
    });

    expect(paymentResult.status).toBe('success');
    if (paymentResult.status === 'success') {
      expect(paymentResult.payload).toEqual({ adminFinanceRevision: 1 });
    }
    expect(executor.snapshot().docs.has('admin_runtime/admin_courses')).toBe(false);
    expect(executor.snapshot().docs.get('admin_runtime/admin_finance')?.data.revision).toBe(1);
  });

  it('does not bump admin lesson bookings revision for attendance-only or issue writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-admin-lesson-rev-att-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: 'attendance/att_idem_fn_01',
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'admin_issues/issue_idem_fn_01',
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: 'attendance/att_idem_fn_01' }, { status: 'present' });
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.payload).toBeUndefined();
    }
    expect(executor.snapshot().docs.has('admin_runtime/admin_lesson_bookings')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_planner')).toBe(false);
  });

  it('bumps admin finance revision once for multiple payment and wallet writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();

    const result = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'pay_service_from_wallet_as_administrator',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-finance-rev-pay-wallet-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          subjectKind: 'booking',
          bookingId: BookingIdSchema.parse('booking_idem_fn_01'),
        },
      } as CommandEnvelope<'pay_service_from_wallet_as_administrator'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: 'payments/pay_idem_fn_wallet_01',
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: `users/${accountId}/wallet/state`,
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'monetary_events/event_idem_fn_01',
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: 'payments/pay_idem_fn_wallet_01' }, { status: 'paid' });
          session.tx.create({ path: `users/${accountId}/wallet/state` }, { balance: 1 });
          session.tx.create({ path: 'monetary_events/event_idem_fn_01' }, { amount: 1 });
          return commandSuccessResult(
            'pay_service_from_wallet_as_administrator',
            correlationId
          );
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      payload: { adminFinanceRevision: 1 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_finance')?.data.revision).toBe(1);
    expect(executor.snapshot().docs.has('admin_runtime/admin_lesson_bookings')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_courses')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_planner')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_people')).toBe(false);
  });

  it('does not bump admin finance revision when a finance command fails', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();

    const result = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'pay_service_from_wallet_as_administrator',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-finance-rev-fail-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          subjectKind: 'booking',
          bookingId: BookingIdSchema.parse('booking_idem_fn_01'),
        },
      } as CommandEnvelope<'pay_service_from_wallet_as_administrator'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: `users/${accountId}/wallet/state`,
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'payments/pay_idem_fn_fail_01',
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async () =>
          commandErrorResult('pay_service_from_wallet_as_administrator', correlationId, {
            code: 'insufficient_funds',
            message: 'There are insufficient funds.',
            retryable: false,
            correlationId,
          }),
      },
    });

    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.has('admin_runtime/admin_finance')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_people')).toBe(false);
  });

  it('does not bump or return a revision when the command fails', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-admin-lesson-rev-fail-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: bookingPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async () =>
          commandErrorResult('complete_booking', correlationId, {
            code: 'validation',
            message: 'The request is invalid.',
            retryable: false,
            correlationId,
          }),
      },
    });

    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.has('admin_runtime/admin_lesson_bookings')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_planner')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_finance')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_people')).toBe(false);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(1);
  });

  it('bumps admin people revision once for multiple identity writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const participantId = ParticipantIdSchema.parse('participant_idem_people_01');
    const participantPath = `participants/${participantId}`;
    const accountPath = `users/${accountId}`;

    const result = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'update_participant_profile',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-people-rev-profile-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          participantId,
          displayName: 'Updated Client',
        },
      } as CommandEnvelope<'update_participant_profile'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: participantPath,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: accountPath,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
          session.plan.planMutation({
            path: 'participant_management/management_idem_people_01',
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: participantPath }, { displayName: 'Updated Client' });
          session.tx.create({ path: accountPath }, { displayName: 'Updated Client' });
          return commandSuccessResult('update_participant_profile', correlationId);
        },
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      payload: { adminPeopleRevision: 1 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_people')?.data.revision).toBe(1);
    expect(executor.snapshot().docs.has('admin_runtime/admin_finance')).toBe(false);
    expect(executor.snapshot().docs.has('admin_runtime/admin_lesson_bookings')).toBe(false);
  });

  it('bumps admin people revision for role and instructor catalog writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const instructorId = InstructorIdSchema.parse('instructor_idem_people_01');

    const roleResult = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'change_account_role',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-people-rev-role-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          accountId,
          role: 'admin',
          reasonExplanation: 'promote',
        },
      } as CommandEnvelope<'change_account_role'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: `users/${accountId}`,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: `users/${accountId}` }, { role: 'admin' });
          return commandSuccessResult('change_account_role', correlationId);
        },
      },
    });

    expect(roleResult).toMatchObject({
      status: 'success',
      payload: { adminPeopleRevision: 1 },
    });

    const instructorResult = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'deactivate_instructor_catalog',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-people-rev-instructor-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          instructorId,
          reasonExplanation: 'deactivate',
        },
      } as CommandEnvelope<'deactivate_instructor_catalog'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: `instructors/${instructorId}`,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: `instructors/${instructorId}` }, { isAvailable: false });
          return commandSuccessResult('deactivate_instructor_catalog', correlationId);
        },
      },
    });

    expect(instructorResult).toMatchObject({
      status: 'success',
      payload: { adminPeopleRevision: 2 },
    });
    expect(executor.snapshot().docs.get('admin_runtime/admin_people')?.data.revision).toBe(2);
  });

  it('does not bump admin people revision for wallet or enrollment writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();

    const walletResult = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'record_manual_wallet_funding',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-people-rev-wallet-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          accountId,
          amount: 1,
          reasonExplanation: 'wallet',
        },
      } as CommandEnvelope<'record_manual_wallet_funding'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: `users/${accountId}/wallet/state`,
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create({ path: `users/${accountId}/wallet/state` }, { balance: 1 });
          return commandSuccessResult('record_manual_wallet_funding', correlationId);
        },
      },
    });

    expect(walletResult.status).toBe('success');
    if (walletResult.status === 'success') {
      expect(walletResult.payload).toEqual({ adminFinanceRevision: 1 });
    }
    expect(executor.snapshot().docs.has('admin_runtime/admin_people')).toBe(false);

    const enrollmentResult = await executeIdempotentCanonicalCommand({
      envelope: createCourseEnrollmentsEnvelope('idem-admin-people-rev-enroll-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: 'course_enrollments/enrollment_idem_people_01',
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async (session) => {
          session.tx.create(
            { path: 'course_enrollments/enrollment_idem_people_01' },
            { revision: 1 }
          );
          return commandSuccessResult('create_course_enrollments', correlationId, {
            outcome: 'created',
          });
        },
      },
    });

    expect(enrollmentResult.status).toBe('success');
    if (enrollmentResult.status === 'success') {
      expect(enrollmentResult.payload).not.toHaveProperty('adminPeopleRevision');
    }
    expect(executor.snapshot().docs.has('admin_runtime/admin_people')).toBe(false);
  });

  it('does not bump admin people revision when an identity command fails', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const participantId = ParticipantIdSchema.parse('participant_idem_people_fail_01');

    const result = await executeIdempotentCanonicalCommand({
      envelope: {
        kind: 'update_participant_profile',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'idem-admin-people-rev-fail-01',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          participantId,
          displayName: 'Should Fail',
        },
      } as CommandEnvelope<'update_participant_profile'>,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        read: async (session) => {
          session.plan.planMutation({
            path: `participants/${participantId}`,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 256,
          });
        },
        execute: async () =>
          commandErrorResult('update_participant_profile', correlationId, {
            code: 'validation',
            message: 'The request is invalid.',
            retryable: false,
            correlationId,
          }),
      },
    });

    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.has('admin_runtime/admin_people')).toBe(false);
  });
});
