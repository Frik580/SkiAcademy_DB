import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  AttendanceSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  activityLogIdFromCommandId,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  canonicalTimestampToEpochMs,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_cancel_cmd_01');
const accountId = AccountIdSchema.parse('account_cancel_cmd_01');
const adminAccountId = AccountIdSchema.parse('account_cancel_admin_01');
const participantId = ParticipantIdSchema.parse('participant_cancel_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_cancel_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_cancel_cmd_01');
const bookingId = BookingIdSchema.parse('booking_cancel_cmd_01');
const paymentId = paymentIdFromBookingId(bookingId);
const occurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const lessonEndsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(
  capability: 'account_owner' | 'administrator',
  actorAccountId = accountId,
  idempotencyKey = `idem-${Math.random().toString(36).slice(2, 10)}`,
  expectedRevision?: number
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    ...(expectedRevision === undefined ? {} : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput: {
      localDate: '2026-01-15',
      localTime: '09:00',
      durationMinutes: 60,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function seedBase() {
  return {
    [`users/${accountId}`]: AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_account',
        lastChangedByCommandId: 'command_seed_account',
        correlationId,
      },
    }),
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_admin',
        lastChangedByCommandId: 'command_seed_admin',
        correlationId,
      },
    }),
    [`participants/${participantId}`]: {
      participantId,
      displayName: 'Cancel Participant',
      age: { kind: 'age_years', years: 20 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_participant',
        lastChangedByCommandId: 'command_seed_participant',
        correlationId,
      },
    },
    [`participant_management/${managementId}`]: {
      participantManagementId: managementId,
      participantId,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_management',
        lastChangedByCommandId: 'command_seed_management',
        correlationId,
      },
    },
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Coach Cancel',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`users/${accountId}/wallet/state`]: WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 50_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    }),
  };
}

function forkExecutor(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  extra: Record<string, Record<string, unknown>> = {}
) {
  const docs = Object.fromEntries(
    [...executor.snapshot().docs.entries()].map(([path, doc]) => [path, doc.data as Record<string, unknown>])
  );
  return createInMemoryCanonicalTransactionExecutor({ ...docs, ...extra });
}

function isoFromTimestamp(timestamp: { seconds: number; nanoseconds: number }) {
  return new Date(canonicalTimestampToEpochMs(timestamp)).toISOString();
}

async function createConfirmedBooking(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  const commands = createProductionCanonicalCommands(environment('2026-01-01T00:00:00.000Z'), executor);
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: accountContext('account_owner', accountId, 'create-booking-01'),
    intent: { bookingId, instructorId, participantIds: [participantId] },
  });
  expect(result.status).toBe('success');
}

function requestCancellationEnvelope(
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'request_booking_cancellation'> {
  return {
    kind: 'request_booking_cancellation',
    context: accountContext('account_owner', accountId, idempotencyKey, expectedRevision),
    intent: { bookingId },
  };
}

describe('booking cancellation commands', () => {
  it('cancels with full refund when >=24h before start', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence
      .interval.startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const envelope = requestCancellationEnvelope('cancel-direct-01');
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('cancelled');
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.refundedAmount).toBe(12_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(50_000);
    const claims = [...snapshot.docs.entries()].filter(([path]) =>
      path.startsWith('resource_claims/')
    );
    expect(claims.length).toBe(2);
    expect(claims.every(([, doc]) => doc.data.lifecycle?.status === 'released')).toBe(true);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
    expect(
      snapshot.docs.has(
        `monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`
      )
    ).toBe(true);

    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(2);

    const replay = await commands.execute(envelope);
    expect(replay.status).toBe('success');
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(2);
  });

  it('creates pending_cancellation inside 24h without refund', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(
      environment('2026-01-14T09:00:01.000Z'),
      executor
    );
    const result = await commands.execute(
      requestCancellationEnvelope('cancel-pending-01')
    );
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'pending_cancellation'
    );
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.refundedAmount).toBe(0);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('admin_issues/')).length
    ).toBe(1);
  });

  it('rejects client cancellation at or after startAt', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T09:00:00.000Z'),
      executor
    );
    const result = await commands.execute(
      requestCancellationEnvelope('cancel-late-01')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('invalid_transition');
    }
  });

  it('withdraws pending cancellation back to confirmed', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commandsAt = createProductionCanonicalCommands(
      environment('2026-01-14T09:00:01.000Z'),
      executor
    );
    await commandsAt.execute(
      requestCancellationEnvelope('cancel-pending-02')
    );

    const commands = createProductionCanonicalCommands(
      environment('2026-01-14T10:00:00.000Z'),
      executor
    );
    const result = await commands.execute({
      kind: 'withdraw_booking_cancellation_request',
      context: accountContext('account_owner', accountId, 'withdraw-01', 2),
      intent: { bookingId },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'confirmed'
    );
  });

  it('admin approves pending cancellation with partial refund', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const pendingCommands = createProductionCanonicalCommands(
      environment('2026-01-14T09:00:01.000Z'),
      executor
    );
    await pendingCommands.execute(
      requestCancellationEnvelope('cancel-pending-03')
    );

    const commands = createProductionCanonicalCommands(
      environment('2026-01-14T12:00:00.000Z'),
      executor
    );
    const result = await commands.execute({
      kind: 'resolve_booking_cancellation',
      context: accountContext('administrator', adminAccountId, 'approve-01', 2),
      intent: {
        bookingId,
        decision: 'approve',
        refundAmount: 6_000,
        reasonExplanation: 'Approved 50% refund',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('cancelled');
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.refundedAmount).toBe(6_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(44_000);
  });

  it('admin rejects pending cancellation before endsAt back to confirmed', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const pendingCommands = createProductionCanonicalCommands(
      environment('2026-01-14T09:00:01.000Z'),
      executor
    );
    await pendingCommands.execute(
      requestCancellationEnvelope('cancel-pending-04')
    );

    const commands = createProductionCanonicalCommands(
      environment('2026-01-14T12:00:00.000Z'),
      executor
    );
    const result = await commands.execute({
      kind: 'resolve_booking_cancellation',
      context: accountContext('administrator', adminAccountId, 'reject-01', 2),
      intent: {
        bookingId,
        decision: 'reject',
        reasonExplanation: 'Keep lesson',
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'confirmed'
    );
  });

  it('admin rejects after endsAt using attendance present -> completed', async () => {
    const baseExecutor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(baseExecutor);
    const pendingCommands = createProductionCanonicalCommands(
      environment('2026-01-14T09:00:01.000Z'),
      baseExecutor
    );
    await pendingCommands.execute(
      requestCancellationEnvelope('cancel-pending-05')
    );

    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });
    const executor = forkExecutor(baseExecutor, {
      [`attendance/${attendanceId}`]: AttendanceSchema.parse({
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId,
          participantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId },
        recordedAt: lessonEndsAt,
        lastChangedBy: { kind: 'instructor', instructorId },
        updatedAt: lessonEndsAt,
        revision: 1,
        correlationId,
      }) as unknown as Record<string, unknown>,
    });

    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T11:00:00.000Z'),
      executor
    );
    const result = await commands.execute({
      kind: 'resolve_booking_cancellation',
      context: accountContext('administrator', adminAccountId, 'reject-02', 2),
      intent: {
        bookingId,
        decision: 'reject',
        reasonExplanation: 'Participant attended',
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'completed'
    );
  });

  it('admin rejects after endsAt with missing attendance creates one admin issue', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const pendingCommands = createProductionCanonicalCommands(
      environment('2026-01-14T09:00:01.000Z'),
      executor
    );
    await pendingCommands.execute(
      requestCancellationEnvelope('cancel-pending-06')
    );

    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T11:00:00.000Z'),
      executor
    );
    const envelope = {
      kind: 'resolve_booking_cancellation' as const,
      context: accountContext('administrator', adminAccountId, 'reject-03', 2),
      intent: {
        bookingId,
        decision: 'reject' as const,
        reasonExplanation: 'Need attendance',
      },
    };
    const first = await commands.execute(envelope);
    const second = await commands.execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'confirmed'
    );
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('admin_issues/')).length
    ).toBe(2);
  });
});
