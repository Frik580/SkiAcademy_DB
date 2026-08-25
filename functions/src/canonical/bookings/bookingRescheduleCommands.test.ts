import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  activityLogIdFromCommandId,
  bookingOccurrenceIdFromScheduleRevision,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  canonicalTimestampToEpochMs,
  timestampFromDate,
  accountCommandActor,
  guestCommandActor,
  guestSubjectIdFromBookingId,
  participantManagementIdFromGuestLink,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_reschedule_cmd_01');
const accountId = AccountIdSchema.parse('account_reschedule_cmd_01');
const adminAccountId = AccountIdSchema.parse('account_reschedule_admin_01');
const participantId = ParticipantIdSchema.parse('participant_reschedule_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_reschedule_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_reschedule_cmd_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_reschedule_cmd_02');
const bookingId = BookingIdSchema.parse('booking_reschedule_cmd_01');
const paymentId = paymentIdFromBookingId(bookingId);
const initialOccurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const guestBookingId = BookingIdSchema.parse('booking_guest_reschedule_cmd_01');
const guestParticipantId = ParticipantIdSchema.parse('participant_guest_reschedule_cmd_01');
const guestSubjectId = guestSubjectIdFromBookingId(guestBookingId);
const guestPaymentId = paymentIdFromBookingId(guestBookingId);
const guestInitialOccurrenceId = initialBookingOccurrenceIdFromBookingId(guestBookingId);
const linkAccountId = AccountIdSchema.parse('account_guest_link_reschedule_01');
const unrelatedAccountId = AccountIdSchema.parse('account_unrelated_reschedule_01');
const guestTokenSecret = 'guest-reschedule-test-secret-01';
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(
  capability: 'account_owner' | 'administrator',
  actorAccountId = accountId,
  idempotencyKey = `idem-${Math.random().toString(36).slice(2, 10)}`,
  expectedRevision?: number,
  calendarInput = {
    localDate: '2026-01-16',
    localTime: '11:00',
    durationMinutes: 60,
  }
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput,
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
      displayName: 'Reschedule Participant',
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
      name: 'Coach One',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`instructors/${instructorTwoId}`]: {
      id: instructorTwoId,
      name: 'Coach Two',
      pricePerHourKZT: 18_000,
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

function isoFromTimestamp(timestamp: { seconds: number; nanoseconds: number }) {
  return new Date(canonicalTimestampToEpochMs(timestamp)).toISOString();
}

async function createConfirmedBooking(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  const commands = createProductionCanonicalCommands(environment('2026-01-01T00:00:00.000Z'), executor);
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      ...accountContext('account_owner', accountId, 'create-booking-01', undefined, {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      }),
    },
    intent: { bookingId, instructorId, participantIds: [participantId] },
  });
  expect(result.status).toBe('success');
}

function rescheduleEnvelope(
  idempotencyKey: string,
  capability: 'account_owner' | 'administrator' = 'account_owner',
  expectedRevision = 1,
  calendarInput = {
    localDate: '2026-01-16',
    localTime: '11:00',
    durationMinutes: 60,
  }
): CommandEnvelope<'reschedule_booking'> {
  return {
    kind: 'reschedule_booking',
    context: accountContext(capability, capability === 'administrator' ? adminAccountId : accountId, idempotencyKey, expectedRevision, calendarInput),
    intent: {
      bookingId,
      ...(capability === 'administrator' ? { reasonExplanation: 'Admin reschedule' } : {}),
    },
  };
}

describe('booking reschedule commands', () => {
  it('allows client self-service reschedule >=24h before start and rotates occurrenceId', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const envelope = rescheduleEnvelope('reschedule-client-01');
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.occurrence.occurrenceId).toBe(
      bookingOccurrenceIdFromScheduleRevision(bookingId, 2)
    );
    expect(booking?.occurrence.occurrenceId).not.toBe(initialOccurrenceId);
    expect(booking?.clientSelfServiceRescheduleConsumedAt).toBeDefined();
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(12_000);

    const activeClaims = [...snapshot.docs.entries()].filter(
      ([path, doc]) =>
        path.startsWith('resource_claims/') && doc.data.lifecycle?.status === 'active'
    );
    expect(activeClaims.length).toBe(2);
    expect(activeClaims.every(([, doc]) => doc.data.occurrenceId === booking?.occurrence.occurrenceId)).toBe(
      true
    );

    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });

  it('rejects client self-service reschedule inside 24h', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-14T09:00:01.000Z'), executor);
    const result = await commands.execute(rescheduleEnvelope('reschedule-late-01'));
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.occurrenceId).toBe(
      initialOccurrenceId
    );
  });

  it('rejects second client self-service reschedule', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    await commands.execute(rescheduleEnvelope('reschedule-first'));
    const revision = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.revision;
    const second = await commands.execute(
      rescheduleEnvelope('reschedule-second', 'account_owner', revision)
    );
    expect(second.status).toBe('error');
  });

  it('admin reschedule does not consume client allowance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-14T09:00:01.000Z'), executor);
    const result = await commands.execute(rescheduleEnvelope('reschedule-admin-01', 'administrator'));
    expect(result.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.clientSelfServiceRescheduleConsumedAt
    ).toBeUndefined();
  });

  it('admin instructor change reprices from authoritative tariff', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-01T00:00:00.000Z'), executor);
    const result = await commands.execute({
      kind: 'change_booking_instructor',
      context: accountContext('administrator', adminAccountId, 'change-instructor-01', 1),
      intent: {
        bookingId,
        instructorId: instructorTwoId,
        reasonExplanation: 'Instructor unavailable',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.occurrence.instructorId).toBe(
      instructorTwoId
    );
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(18_000);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(2);
  });

  it('rejects stale expectedRevision', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-01T00:00:00.000Z'), executor);
    const result = await commands.execute(rescheduleEnvelope('stale-revision', 'account_owner', 99));
    expect(result.status).toBe('error');
  });

  it('replays successful reschedule without duplicate mutation', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const envelope = rescheduleEnvelope('reschedule-replay');
    await commands.execute(envelope);
    const occurrenceAfterFirst = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data
      .occurrence.occurrenceId;
    const replay = await commands.execute(envelope);
    expect(replay.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.occurrenceId).toBe(
      occurrenceAfterFirst
    );
    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) =>
        path.startsWith('activity_logs/')
      ).length
    ).toBe(2);
    expect(
      executor.snapshot().docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });
});

function guestFixture() {
  return {
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Coach One',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`participants/${guestParticipantId}`]: {
      participantId: guestParticipantId,
      displayName: 'Guest Reschedule Participant',
      age: { kind: 'age_years', years: 25 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_guest_participant',
        lastChangedByCommandId: 'command_seed_guest_participant',
        correlationId,
      },
    },
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
    [`users/${linkAccountId}`]: AccountSchema.parse({
      accountId: linkAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_link_account',
        lastChangedByCommandId: 'command_seed_link_account',
        correlationId,
      },
    }),
    [`users/${unrelatedAccountId}`]: AccountSchema.parse({
      accountId: unrelatedAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_unrelated_account',
        lastChangedByCommandId: 'command_seed_unrelated_account',
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
  };
}

function guestCommands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  at = '2026-01-01T10:00:00.000Z'
) {
  return createProductionCanonicalCommands(environment(at), executor, {
    guestActionTokenSecret: guestTokenSecret,
  });
}

async function seedConfirmedGuestBooking(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  const commands = guestCommands(executor);
  const createResult = await commands.execute({
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectId),
      exercisedCapability: 'guest',
      idempotencyKey: 'guest-create-reschedule',
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId: guestBookingId,
      instructorId,
      participantIds: [guestParticipantId],
    },
  });
  expect(createResult.status).toBe('success');

  const confirmResult = await commands.execute({
    kind: 'confirm_guest_booking',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: 'guest-confirm-reschedule',
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
    },
    intent: { bookingId: guestBookingId },
  });
  expect(confirmResult.status).toBe('success');
}

async function linkGuestBookingToAccount(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  actorAccountId = linkAccountId
) {
  const commands = guestCommands(executor);
  const bookingRevision = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.revision;
  const result = await commands.execute({
    kind: 'link_guest_booking_to_account',
    context: {
      actor: accountCommandActor(actorAccountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: `guest-link-${actorAccountId}`,
      correlationId,
      source: 'client_callable',
      expectedRevision: AggregateRevisionSchema.parse(bookingRevision ?? 1),
    },
    intent: { bookingId: guestBookingId, participantId: guestParticipantId },
  });
  expect(result.status).toBe('success');
}

function guestRescheduleEnvelope(
  actorAccountId: typeof linkAccountId | typeof unrelatedAccountId | typeof accountId,
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'reschedule_booking'> {
  return {
    kind: 'reschedule_booking',
    context: accountContext('account_owner', actorAccountId, idempotencyKey, expectedRevision, {
      localDate: '2026-01-16',
      localTime: '11:00',
      durationMinutes: 60,
    }),
    intent: { bookingId: guestBookingId },
  };
}

describe('linked guest-origin reschedule authorization', () => {
  it('forbids unrelated account from rescheduling unlinked confirmed guest-origin booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(executor);
    const commands = guestCommands(executor);
    const result = await commands.execute(
      guestRescheduleEnvelope(unrelatedAccountId, 'guest-unlinked-unrelated')
    );
    expect(result.status).toBe('error');
    expect(
      executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence.occurrenceId
    ).toBe(guestInitialOccurrenceId);
  });

  it('forbids guest_callable reschedule on confirmed guest-origin booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(executor);
    const commands = guestCommands(executor);
    const result = await commands.execute({
      kind: 'reschedule_booking',
      context: {
        actor: guestCommandActor(guestSubjectId),
        exercisedCapability: 'guest',
        idempotencyKey: 'guest-callable-reschedule',
        correlationId,
        source: 'guest_callable',
        calendarInput: {
          localDate: '2026-01-16',
          localTime: '11:00',
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
        expectedRevision: AggregateRevisionSchema.parse(2),
      },
      intent: { bookingId: guestBookingId },
    });
    expect(result.status).toBe('error');
  });

  it('allows linked guest-origin booking reschedule for authorized manager and preserves provenance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(executor);
    await linkGuestBookingToAccount(executor);

    const startsAt = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence
      .interval.startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = guestCommands(executor, isoFromTimestamp(requestAt));
    const envelope = guestRescheduleEnvelope(linkAccountId, 'guest-linked-authorized', 3);
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const booking = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data;
    expect(booking?.attribution).toEqual({
      bookingOrigin: 'guest',
      bookedBy: { kind: 'guest', guestSubjectId },
    });
    expect(booking?.occurrence.occurrenceId).toBe(
      bookingOccurrenceIdFromScheduleRevision(guestBookingId, 2)
    );
    expect(booking?.clientSelfServiceRescheduleConsumedAt).toBeDefined();
    expect(executor.snapshot().docs.get(`payments/${guestPaymentId}`)?.data.price).toBe(12_000);

    const replay = await commands.execute(envelope);
    expect(replay.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence.occurrenceId
    ).toBe(bookingOccurrenceIdFromScheduleRevision(guestBookingId, 2));
  });

  it('forbids linked guest-origin booking reschedule for unauthorized account', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(executor);
    await linkGuestBookingToAccount(executor);

    const startsAt = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence
      .interval.startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = guestCommands(executor, isoFromTimestamp(requestAt));
    const result = await commands.execute(
      guestRescheduleEnvelope(unrelatedAccountId, 'guest-linked-unauthorized', 3)
    );
    expect(result.status).toBe('error');
    expect(
      executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence.occurrenceId
    ).toBe(guestInitialOccurrenceId);
  });

  it('forbids linked guest-origin booking reschedule when participant management is revoked', async () => {
    const setupExecutor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(setupExecutor);
    await linkGuestBookingToAccount(setupExecutor);

    const managementId = participantManagementIdFromGuestLink({
      participantId: guestParticipantId,
      accountId: linkAccountId,
    });
    const revokedDocs: Record<string, Record<string, unknown>> = {};
    for (const [path, doc] of setupExecutor.snapshot().docs.entries()) {
      revokedDocs[path] = { ...doc.data };
    }
    revokedDocs[`participant_management/${managementId}`] = {
      ...revokedDocs[`participant_management/${managementId}`],
      status: 'ended',
    };

    const executor = createInMemoryCanonicalTransactionExecutor(revokedDocs);
    const startsAt = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence
      .interval.startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = guestCommands(executor, isoFromTimestamp(requestAt));
    const bookingRevision = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.revision;
    const result = await commands.execute(
      guestRescheduleEnvelope(linkAccountId, 'guest-revoked-management', bookingRevision)
    );
    expect(result.status).toBe('error');
    expect(
      executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence.occurrenceId
    ).toBe(guestInitialOccurrenceId);
  });

  it('does not grant reschedule authority from payerAccountId without participant management', async () => {
    const setupExecutor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(setupExecutor);
    await linkGuestBookingToAccount(setupExecutor);

    const linkedDocs: Record<string, Record<string, unknown>> = {};
    for (const [path, doc] of setupExecutor.snapshot().docs.entries()) {
      linkedDocs[path] = { ...doc.data };
    }
    linkedDocs[`payments/${guestPaymentId}`] = {
      ...linkedDocs[`payments/${guestPaymentId}`],
      payerAccountId: unrelatedAccountId,
    };

    const executor = createInMemoryCanonicalTransactionExecutor(linkedDocs);
    const startsAt = executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.occurrence
      .interval.startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const commands = guestCommands(executor, isoFromTimestamp(requestAt));
    const unauthorized = await commands.execute(
      guestRescheduleEnvelope(unrelatedAccountId, 'guest-payer-no-mgmt', 3)
    );
    expect(unauthorized.status).toBe('error');

    const authorized = await commands.execute(
      guestRescheduleEnvelope(linkAccountId, 'guest-payer-authorized', 3)
    );
    expect(authorized.status).toBe('success');
  });

  it('allows admin to reschedule unlinked confirmed guest-origin booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(guestFixture());
    await seedConfirmedGuestBooking(executor);
    const commands = guestCommands(executor, '2026-01-14T09:00:01.000Z');
    const result = await commands.execute({
      kind: 'reschedule_booking',
      context: accountContext('administrator', adminAccountId, 'guest-admin-reschedule', 2, {
        localDate: '2026-01-16',
        localTime: '11:00',
        durationMinutes: 60,
      }),
      intent: {
        bookingId: guestBookingId,
        reasonExplanation: 'Admin reschedule guest booking',
      },
    });
    expect(result.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.attribution.bookingOrigin
    ).toBe('guest');
    expect(
      executor.snapshot().docs.get(`bookings/${guestBookingId}`)?.data.clientSelfServiceRescheduleConsumedAt
    ).toBeUndefined();
  });
});
