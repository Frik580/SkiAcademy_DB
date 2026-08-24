import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  PaymentSchema,
  activityLogIdFromCommandId,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  paymentIdFromBookingId,
  paymentRequiredAtStartIdentity,
  resolveCommandIdempotencyIdentity,
  sanitizePaymentStartGateForInstructor,
  sanitizedInstructorViewOmitsFinancialFields,
  systemCommandActor,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_payment_gate_01');
const bookingId = BookingIdSchema.parse('booking_payment_gate_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_payment_gate_01');
const accountId = 'account_payment_gate_01';
const startAt = new Date('2026-01-15T04:00:00.000Z');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const startTimestamp = timestampFromDate(startAt);
const systemActorId = 'system_payment_gate_01';

function environment(at = startAt.toISOString()) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function metadata() {
  return {
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed_payment_gate',
      lastChangedByCommandId: 'command_seed_payment_gate',
      correlationId,
    },
  } as const;
}

function seedBooking(lifecycle: Record<string, unknown> = { status: 'confirmed' }) {
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId },
    },
    party: {
      kind: 'individual',
      participantIds: ['participant_payment_gate_01'],
    },
    occurrence: {
      occurrenceId,
      instructorId: 'instructor_payment_gate_01',
      interval: {
        startsAt: startTimestamp,
        endsAt: timestampFromDate(new Date('2026-01-15T05:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: ['participant_payment_gate_01'] },
    },
    lifecycle,
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: accountId,
    ...metadata(),
  });
}

function seedPayment(
  booking: ReturnType<typeof seedBooking>,
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
    createdAt,
    updatedAt: createdAt,
  });
}

const unpaidFields = {
  paidAmount: 0,
  retainedAmount: 0,
  settledAmount: 0,
  outstandingAmount: 100_000,
  paymentStatus: 'unpaid' as const,
};

const fundedFields = {
  paidAmount: 100_000,
  retainedAmount: 100_000,
  settledAmount: 100_000,
  outstandingAmount: 0,
  paymentStatus: 'paid' as const,
};

function fixture(
  paymentFields: Parameters<typeof seedPayment>[1] = unpaidFields,
  lifecycle?: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  const booking = seedBooking(lifecycle);
  const payment = seedPayment(booking, paymentFields);
  return {
    booking,
    payment,
    docs: {
      [`bookings/${booking.bookingId}`]: booking,
      [`payments/${payment.paymentId}`]: payment,
      ...extra,
    },
  };
}

function systemEnvelope(
  idempotencyKey: string,
  intent: CommandEnvelope<'enforce_payment_start_gate'>['intent'] = {
    subjectKind: 'booking',
    subjectId: bookingId,
  }
): CommandEnvelope<'enforce_payment_start_gate'> {
  return {
    kind: 'enforce_payment_start_gate',
    context: {
      actor: systemCommandActor(systemActorId),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
    },
    intent,
  };
}

function adminEnvelope(idempotencyKey: string): CommandEnvelope<'enforce_payment_start_gate'> {
  return {
    kind: 'enforce_payment_start_gate',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
    },
    intent: { subjectKind: 'booking', subjectId: bookingId },
  };
}

async function runGate(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  envelope: CommandEnvelope<'enforce_payment_start_gate'>,
  at = startAt.toISOString()
) {
  const commands = createProductionCanonicalCommands(environment(at), executor);
  return commands.execute(envelope);
}

function issuePathFor(booking: ReturnType<typeof seedBooking>): string {
  const identity = paymentRequiredAtStartIdentity({
    bookingId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
  });
  return `admin_issues/${adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity))}`;
}

describe('enforce_payment_start_gate', () => {
  it('succeeds for a fully funded confirmed booking without creating an issue or monetary event', async () => {
    const { docs, booking } = fixture(fundedFields);
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const envelope = systemEnvelope('gate-funded-01');
    const result = await runGate(executor, envelope);
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(issuePathFor(booking))).toBe(false);
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/'))).toEqual(
      []
    );
    expect(snapshot.docs.get(`payments/${booking.paymentId}`)?.data.paidAmount).toBe(100_000);
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'confirmed',
    });
    const identity = resolveCommandIdempotencyIdentity(envelope);
    const activityLog = snapshot.docs.get(
      `activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`
    )?.data;
    expect(activityLog).toBeDefined();
    expect(JSON.stringify(activityLog)).not.toMatch(
      /price|paidAmount|outstandingAmount|retainedAmount|balance|100000/
    );
  });

  it('creates one payment_required_at_start issue for an underfunded booking', async () => {
    const { docs, booking } = fixture();
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const result = await runGate(executor, systemEnvelope('gate-unpaid-01'));
    expect(result.status).toBe('success');
    const issue = executor.snapshot().docs.get(issuePathFor(booking))?.data;
    expect(issue?.kind).toBe('payment_required_at_start');
    expect(issue?.lifecycle.status).toBe('open');
    expect(issue?.blocksDelivery).toBe(true);
    expect(issue?.blocksOutcome).toBe(true);
    const view = sanitizePaymentStartGateForInstructor(issue as never);
    expect(view?.instruction).toBe('Payment required—do not start');
    expect(view && sanitizedInstructorViewOmitsFinancialFields(view)).toBe(true);
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'confirmed',
    });
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/'))
    ).toEqual([]);
  });

  it('treats retained-below-price and write-off as underfunded', async () => {
    for (const [key, fields] of [
      [
        'refunded',
        {
          paidAmount: 100_000,
          refundedAmount: 20_000,
          retainedAmount: 80_000,
          settledAmount: 100_000,
          outstandingAmount: 0,
          paymentStatus: 'partially_refunded',
        },
      ],
      [
        'written-off',
        {
          paidAmount: 0,
          retainedAmount: 0,
          settledAmount: 0,
          writtenOffAmount: 100_000,
          outstandingAmount: 0,
          paymentStatus: 'unpaid',
        },
      ],
    ] as const) {
      const { docs, booking } = fixture(fields);
      const executor = createInMemoryCanonicalTransactionExecutor(docs);
      const result = await runGate(executor, systemEnvelope(`gate-${key}`));
      expect(result.status).toBe('success');
      expect(executor.snapshot().docs.get(issuePathFor(booking))?.data.kind).toBe(
        'payment_required_at_start'
      );
    }
  });

  it('reuses the same issue on replay and on a distinct later evaluation', async () => {
    const { docs, booking } = fixture();
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const replayEnvelope = systemEnvelope('gate-replay-01');
    const first = await runGate(executor, replayEnvelope);
    const replay = await runGate(executor, replayEnvelope);
    const second = await runGate(executor, systemEnvelope('gate-replay-02'));
    expect(first.status).toBe('success');
    expect(replay.status).toBe('success');
    expect(second.status).toBe('success');
    const issues = [...executor.snapshot().docs.keys()].filter((path) =>
      path.startsWith('admin_issues/')
    );
    expect(issues).toEqual([issuePathFor(booking)]);
    const activityLogs = [...executor.snapshot().docs.keys()].filter((path) =>
      path.startsWith('activity_logs/')
    );
    expect(activityLogs).toHaveLength(2);
  });

  it('rejects evaluation before start and allows the exact start boundary', async () => {
    const { docs, booking } = fixture();
    const earlyExecutor = createInMemoryCanonicalTransactionExecutor(docs);
    const early = await runGate(
      earlyExecutor,
      systemEnvelope('gate-early-01'),
      '2026-01-15T03:59:59.000Z'
    );
    expect(early.status).toBe('error');
    if (early.status === 'error') {
      expect(early.error.code).toBe('invalid_transition');
    }
    expect(earlyExecutor.snapshot().docs.has(issuePathFor(booking))).toBe(false);

    const onTimeExecutor = createInMemoryCanonicalTransactionExecutor(docs);
    const onTime = await runGate(onTimeExecutor, systemEnvelope('gate-ontime-01'));
    expect(onTime.status).toBe('success');
    expect(onTimeExecutor.snapshot().docs.has(issuePathFor(booking))).toBe(true);
  });

  it('rejects terminal bookings without creating an issue', async () => {
    const { docs, booking } = fixture(unpaidFields, {
      status: 'cancelled',
      cancelledAt: createdAt,
      reasonCode: 'incomplete_payment',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const result = await runGate(executor, systemEnvelope('gate-terminal-01'));
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('invalid_transition');
    }
    expect(executor.snapshot().docs.has(issuePathFor(booking))).toBe(false);
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'cancelled'
    );
  });

  it('rejects course enrollment subjects and unauthorized instructors', async () => {
    const { docs } = fixture();
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const course = await runGate(
      executor,
      systemEnvelope('gate-course-01', {
        subjectKind: 'course_enrollment',
        subjectId: 'course_enrollment_payment_gate_01',
      })
    );
    expect(course.status).toBe('error');
    if (course.status === 'error') {
      expect(course.error.code).toBe('validation');
    }

    const instructor = await runGate(executor, {
      kind: 'enforce_payment_start_gate',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'instructor',
        idempotencyKey: 'gate-instructor-01',
        correlationId,
        source: 'client_callable',
      },
      intent: { subjectKind: 'booking', subjectId: bookingId },
    });
    expect(instructor.status).toBe('error');
    if (instructor.status === 'error') {
      expect(instructor.error.code).toBe('forbidden');
    }
  });

  it('allows administrator recheck of an underfunded booking', async () => {
    const { docs, booking } = fixture();
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const result = await runGate(executor, adminEnvelope('gate-admin-01'));
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(issuePathFor(booking))?.data.kind).toBe(
      'payment_required_at_start'
    );
  });

  it('rolls back when audit staging collides and leaves no AdminIssue', async () => {
    const { docs, booking } = fixture();
    const envelope = systemEnvelope('gate-audit-fail-01');
    const identity = resolveCommandIdempotencyIdentity(envelope);
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...docs,
      [`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`]: {
        schemaVersion: 'audit:v1',
        activityLogId: activityLogIdFromCommandId(identity.commandKey),
      },
    });
    const result = await runGate(executor, envelope);
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.has(issuePathFor(booking))).toBe(false);
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'confirmed',
    });
  });

  it('fails closed on incompatible deterministic issue collision', async () => {
    const { docs, booking } = fixture();
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...docs,
      [issuePathFor(booking)]: {
        issueId: 'not-the-deterministic-id',
        kind: 'missing_attendance',
      },
    });
    const result = await runGate(executor, systemEnvelope('gate-collision-01'));
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'confirmed',
    });
    expect(executor.snapshot().docs.get(issuePathFor(booking))?.data.kind).toBe(
      'missing_attendance'
    );
  });

  it('does not send undefined AdminIssue fields to Firestore', async () => {
    const { docs, booking } = fixture();
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    await runGate(executor, systemEnvelope('gate-undefined-01'));
    const issue = executor.snapshot().docs.get(issuePathFor(booking))?.data;
    expect(issue).toBeDefined();
    expect(Object.values(issue ?? {}).some((value) => value === undefined)).toBe(false);
  });

  it('does not release resource claims when opening a payment start issue', async () => {
    const { docs, booking } = fixture(
      unpaidFields,
      { status: 'confirmed' },
      {
        'resource_claims/claim_payment_gate_01': {
          claimId: 'claim_payment_gate_01',
          lifecycle: { status: 'active' },
        },
      }
    );
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    await runGate(executor, systemEnvelope('gate-claims-01'));
    expect(
      executor.snapshot().docs.get('resource_claims/claim_payment_gate_01')?.data.lifecycle
    ).toEqual({ status: 'active' });
    expect(executor.snapshot().docs.has(issuePathFor(booking))).toBe(true);
  });
});
