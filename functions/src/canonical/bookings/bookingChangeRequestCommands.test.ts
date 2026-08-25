import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  bookingOccurrenceIdFromScheduleRevision,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { BOOKING_REVISION_TRANSPORT_KEY } from './bookingChangeRequestAuthorization';
import { createBookingChangeRequestCommandHandlers } from './bookingChangeRequestCommands';

const correlationId = CorrelationIdSchema.parse('correlation_change_req_cmd_01');
const instructorAccountId = AccountIdSchema.parse('account_change_req_instructor_01');
const adminAccountId = AccountIdSchema.parse('account_change_req_admin_01');
const accountId = AccountIdSchema.parse('account_change_req_owner_01');
const participantId = ParticipantIdSchema.parse('participant_change_req_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_change_req_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_change_req_cmd_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_change_req_cmd_02');
const bookingId = BookingIdSchema.parse('booking_change_req_cmd_01');
const changeRequestId = BookingChangeRequestIdSchema.parse('booking_change_request_change_req_01');
const paymentId = paymentIdFromBookingId(bookingId);
const initialOccurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function instructorContext(idempotencyKey: string, expectedRevision?: number) {
  return {
    actor: accountCommandActor(instructorAccountId),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: instructorId },
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
  };
}

function adminContext(
  idempotencyKey: string,
  expectedRevision?: number,
  calendarInput = {
    localDate: '2026-01-16',
    localTime: '11:00',
    durationMinutes: 60,
  },
  transportMetadata: Record<string, string> = {}
) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput,
    timezone: 'Asia/Almaty' as const,
    transportMetadata,
  };
}

function seedBase() {
  return {
    [`users/${instructorAccountId}`]: AccountSchema.parse({
      accountId: instructorAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_instructor_account',
        lastChangedByCommandId: 'command_seed_instructor_account',
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
    [`participants/${participantId}`]: {
      participantId,
      displayName: 'Change Request Participant',
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
      name: 'Coach Change Request',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`instructors/${otherInstructorId}`]: {
      id: otherInstructorId,
      name: 'Other Coach',
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

async function createConfirmedBooking(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  const commands = createProductionCanonicalCommands(environment('2026-01-01T00:00:00.000Z'), executor);
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: 'create-booking-change-req-01',
      correlationId,
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: { bookingId, instructorId, participantIds: [participantId] },
  });
  expect(result.status).toBe('success');
}

async function createOpenChangeRequest(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  idempotencyKey = 'create-change-request-01'
) {
  const handlers = createBookingChangeRequestCommandHandlers(executor);
  const result = await handlers.create_booking_change_request(
    {
      kind: 'create_booking_change_request',
      context: instructorContext(idempotencyKey, 1),
      intent: {
        bookingChangeRequestId: changeRequestId,
        bookingId,
        reason: 'Instructor cannot deliver the confirmed occurrence.',
      },
    },
    environment('2026-01-02T00:00:00.000Z')
  );
  expect(result.status).toBe('success');
}

describe('booking change request commands', () => {
  it('creates an open instructor_unavailable request without mutating the booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const envelope: CommandEnvelope<'create_booking_change_request'> = {
      kind: 'create_booking_change_request',
      context: instructorContext('create-change-request-success', 1),
      intent: {
        bookingChangeRequestId: changeRequestId,
        bookingId,
        reason: 'Instructor cannot deliver the confirmed occurrence.',
      },
    };

    const result = await handlers.create_booking_change_request(
      envelope,
      environment('2026-01-02T00:00:00.000Z')
    );
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('confirmed');
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.revision).toBe(1);
    const request = snapshot.docs.get(`booking_change_requests/${changeRequestId}`)?.data;
    expect(request?.requestType).toBe('instructor_unavailable');
    expect(request?.lifecycle.status).toBe('open');
    expect(request?.reason).toBe('Instructor cannot deliver the confirmed occurrence.');

    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length).toBe(
      2
    );
  });

  it('rejects create from a non-assigned instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const result = await handlers.create_booking_change_request(
      {
        kind: 'create_booking_change_request',
        context: {
          ...instructorContext('create-change-request-forbidden', 1),
          transportMetadata: { instructor_id: otherInstructorId },
        },
        intent: {
          bookingChangeRequestId: changeRequestId,
          bookingId,
          reason: 'Unavailable',
        },
      },
      environment('2026-01-02T00:00:00.000Z')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('withdraws an open request without mutating the booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    await createOpenChangeRequest(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const envelope: CommandEnvelope<'withdraw_booking_change_request'> = {
      kind: 'withdraw_booking_change_request',
      context: instructorContext('withdraw-change-request-01', 1),
      intent: { bookingChangeRequestId: changeRequestId },
    };
    const result = await handlers.withdraw_booking_change_request(
      envelope,
      environment('2026-01-03T00:00:00.000Z')
    );
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`booking_change_requests/${changeRequestId}`)?.data.lifecycle.status).toBe(
      'cancelled'
    );
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('confirmed');
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.revision).toBe(1);
  });

  it('resolves with rescheduled without consuming client self-service allowance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    await createOpenChangeRequest(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const envelope: CommandEnvelope<'resolve_booking_change_request'> = {
      kind: 'resolve_booking_change_request',
      context: adminContext('resolve-rescheduled-01', 1, undefined, {
        [BOOKING_REVISION_TRANSPORT_KEY]: '1',
      }),
      intent: {
        bookingChangeRequestId: changeRequestId,
        resolution: 'rescheduled',
        reasonExplanation: 'Client agreed to reschedule after instructor unavailability.',
      },
    };
    const result = await handlers.resolve_booking_change_request(
      envelope,
      environment('2026-01-04T00:00:00.000Z')
    );
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.lifecycle.status).toBe('confirmed');
    expect(booking?.clientSelfServiceRescheduleConsumedAt).toBeUndefined();
    expect(booking?.revision).toBe(2);
    expect(booking?.occurrence.scheduleRevision).toBe(2);
    expect(booking?.occurrence.occurrenceId).toBe(
      bookingOccurrenceIdFromScheduleRevision(bookingId, 2)
    );
    expect(snapshot.docs.get(`booking_change_requests/${changeRequestId}`)?.data.lifecycle).toEqual({
      status: 'resolved',
      resolution: 'rescheduled',
      resolvedAt: expect.anything(),
    });
    const claims = [...snapshot.docs.entries()].filter(([path]) => path.startsWith('resource_claims/'));
    expect(claims.some(([, doc]) => doc.data.occurrenceId === initialOccurrenceId)).toBe(true);
    expect(
      claims.some(([, doc]) => doc.data.occurrenceId === bookingOccurrenceIdFromScheduleRevision(bookingId, 2))
    ).toBe(true);
  });

  it('resolves with booking_cancelled and applies refund with booking_change_request reason', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    await createOpenChangeRequest(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const envelope: CommandEnvelope<'resolve_booking_change_request'> = {
      kind: 'resolve_booking_change_request',
      context: adminContext('resolve-cancelled-01', 1, undefined, {
        [BOOKING_REVISION_TRANSPORT_KEY]: '1',
      }),
      intent: {
        bookingChangeRequestId: changeRequestId,
        resolution: 'booking_cancelled',
        refundAmount: 12_000,
        reasonExplanation: 'Client agreed to cancel after instructor unavailability.',
      },
    };
    const result = await handlers.resolve_booking_change_request(
      envelope,
      environment('2026-01-04T00:00:00.000Z')
    );
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'cancelled',
      cancelledAt: expect.anything(),
      reasonCode: 'booking_change_request',
    });
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.refundedAmount).toBe(12_000);
    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(
      snapshot.docs.has(`monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`)
    ).toBe(true);
    const claims = [...snapshot.docs.entries()].filter(([path]) => path.startsWith('resource_claims/'));
    expect(claims.every(([, doc]) => doc.data.lifecycle?.status === 'released')).toBe(true);
  });

  it('resolves with no_change and leaves the booking untouched', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    await createOpenChangeRequest(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const result = await handlers.resolve_booking_change_request(
      {
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-no-change-01', 1),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'no_change',
        },
      },
      environment('2026-01-04T00:00:00.000Z')
    );
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.revision).toBe(1);
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('confirmed');
    expect(snapshot.docs.get(`booking_change_requests/${changeRequestId}`)?.data.lifecycle).toEqual({
      status: 'resolved',
      resolution: 'no_change',
      resolvedAt: expect.anything(),
    });
  });

  it('rejects resolve from non-administrator callers', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    await createOpenChangeRequest(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const result = await handlers.resolve_booking_change_request(
      {
        kind: 'resolve_booking_change_request',
        context: instructorContext('resolve-forbidden-01', 1),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'no_change',
        },
      },
      environment('2026-01-04T00:00:00.000Z')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('rejects resolve when booking revision is stale via transport metadata', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    await createOpenChangeRequest(executor);

    const commands = createProductionCanonicalCommands(environment('2026-01-03T00:00:00.000Z'), executor);
    const rescheduleResult = await commands.execute({
      kind: 'reschedule_booking',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'stale-change-request-reschedule',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
        calendarInput: {
          localDate: '2026-01-16',
          localTime: '10:00',
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
      },
      intent: {
        bookingId,
        reasonExplanation: 'Admin reschedule before stale change-request resolve',
      },
    });
    expect(rescheduleResult.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.revision).toBe(2);

    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const resolveResult = await handlers.resolve_booking_change_request(
      {
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-stale-booking-rev', 1, undefined, {
          [BOOKING_REVISION_TRANSPORT_KEY]: '1',
        }),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'booking_cancelled',
          refundAmount: 12_000,
          reasonExplanation: 'Client agreed to cancel after instructor unavailability.',
        },
      },
      environment('2026-01-04T00:00:00.000Z')
    );
    expect(resolveResult.status).toBe('error');
    if (resolveResult.status === 'error') {
      expect(resolveResult.error.code).toBe('stale_version');
    }

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.revision).toBe(2);
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('confirmed');
    expect(snapshot.docs.get(`booking_change_requests/${changeRequestId}`)?.data.lifecycle.status).toBe(
      'open'
    );
  });

  it('replays idempotent create successfully', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const handlers = createBookingChangeRequestCommandHandlers(executor);
    const envelope: CommandEnvelope<'create_booking_change_request'> = {
      kind: 'create_booking_change_request',
      context: instructorContext('create-change-request-replay', 1),
      intent: {
        bookingChangeRequestId: changeRequestId,
        bookingId,
        reason: 'Instructor cannot deliver the confirmed occurrence.',
      },
    };
    const first = await handlers.create_booking_change_request(
      envelope,
      environment('2026-01-02T00:00:00.000Z')
    );
    const second = await handlers.create_booking_change_request(
      envelope,
      environment('2026-01-02T00:00:00.000Z')
    );
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) =>
        path.startsWith('booking_change_requests/')
      ).length
    ).toBe(1);
  });
});
