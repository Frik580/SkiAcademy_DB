import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  InstructorIdSchema,
  ParticipantIdSchema,
  SystemActorIdSchema,
  activityLogIdFromCommandId,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { queryLessonBookingReadModels } from '../readModels/lessonBookingReadModels';

const correlationId = CorrelationIdSchema.parse('correlation_guest_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_cmd_01');
const participantId = ParticipantIdSchema.parse('participant_guest_cmd_01');
const bookingId = BookingIdSchema.parse('booking_guest_cmd_01');
const paymentId = paymentIdFromBookingId(bookingId);
const guestSubjectId = guestSubjectIdFromBookingId(bookingId);
const adminAccountId = AccountIdSchema.parse('account_guest_admin_01');
const linkAccountId = AccountIdSchema.parse('account_guest_link_01');
const tokenSecret = 'guest-command-test-secret-01';
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

function environment(at = '2026-01-01T10:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function seedInstructor() {
  return {
    id: instructorId,
    name: 'Guest Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  };
}

function seedGuestParticipant() {
  return {
    participantId,
    displayName: 'Guest Participant',
    age: { kind: 'age_years', years: 25 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant',
      lastChangedByCommandId: 'command_seed_participant',
      correlationId,
    },
  };
}

function seedAccount(accountId: string) {
  return {
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
  };
}

function baseFixture(extra: Record<string, unknown> = {}) {
  return {
    [`instructors/${instructorId}`]: seedInstructor(),
    [`participants/${participantId}`]: seedGuestParticipant(),
    [`users/${adminAccountId}`]: seedAccount(adminAccountId),
    [`users/${linkAccountId}`]: seedAccount(linkAccountId),
    ...extra,
  };
}

function guestParticipantTransport() {
  return guestParticipantTransportMetadataFromProfile({
    displayName: 'Guest Participant',
    skillLevel: 'beginner',
    discipline: 'ski',
    ageYears: 25,
  });
}

function guestCreateEnvelope(
  overrides: Partial<CommandEnvelope<'create_guest_booking_request'>> = {}
): CommandEnvelope<'create_guest_booking_request'> {
  return {
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectId),
      exercisedCapability: 'guest',
      idempotencyKey: 'guest-create-01',
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransport(),
      ...overrides.context,
    },
    intent: {
      bookingId,
      instructorId,
      participantIds: [participantId],
    },
    ...overrides,
  };
}

function fixtureWithoutParticipant(extra: Record<string, unknown> = {}) {
  const base = baseFixture();
  delete base[`participants/${participantId}`];
  return { ...base, ...extra };
}

function runCommands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  at = '2026-01-01T10:00:00.000Z'
) {
  return createProductionCanonicalCommands(environment(at), executor, {
    guestActionTokenSecret: tokenSecret,
  });
}

describe('create_guest_booking_request command', () => {
  it('creates a pending guest booking with payment and claims', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = runCommands(executor);
    const result = await commands.execute(guestCreateEnvelope());
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.attribution).toEqual({
      bookingOrigin: 'guest',
      bookedBy: { kind: 'guest', guestSubjectId },
    });
    expect(booking?.lifecycle.status).toBe('pending');
    expect(booking?.lifecycle.reservationExpiresAt).toBeDefined();
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    expect(snapshot.docs.has(`users/${guestSubjectId}/wallet/state`)).toBe(false);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);
    expect(result.payload?.guestActionCredential).toMatchObject({
      bookingId,
      guestSubjectId,
    });
    expect(result.payload?.guestActionCredential?.nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(result.payload?.guestActionCredential?.signature).toMatch(/^[0-9a-fA-F]{64}$/);
  });

  it('provisions an unmanaged guest participant atomically when missing', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixtureWithoutParticipant());
    const commands = runCommands(executor);
    const result = await commands.execute(guestCreateEnvelope());
    expect(result.status).toBe('success');

    const participant = executor.snapshot().docs.get(`participants/${participantId}`)?.data;
    expect(participant?.management).toEqual({ kind: 'unmanaged_guest' });
    expect(participant?.displayName).toBe('Guest Participant');
    expect(participant?.initialManagementEligibleAccountId).toBeUndefined();
  });

  it('replays without duplicates and returns the stored credential', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixtureWithoutParticipant());
    const commands = runCommands(executor);
    const envelope = guestCreateEnvelope();
    const first = await commands.execute(envelope);
    const second = await commands.execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(second.payload?.guestActionCredential).toEqual(first.payload?.guestActionCredential);

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)).toBeDefined();
    expect(snapshot.docs.get(`participants/${participantId}`)).toBeDefined();
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('activity_logs/')).length).toBe(
      1
    );
  });

  it('rejects provisioning without guest participant transport metadata', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixtureWithoutParticipant());
    const commands = runCommands(executor);
    const result = await commands.execute(
      guestCreateEnvelope({
        context: {
          actor: guestCommandActor(guestSubjectId),
          exercisedCapability: 'guest',
          idempotencyKey: 'guest-create-missing-transport',
          correlationId,
          source: 'guest_callable',
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
    expect(executor.snapshot().docs.has(`participants/${participantId}`)).toBe(false);
  });

  it('fails fast when guest action token secret is not configured', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixtureWithoutParticipant());
    const commands = createProductionCanonicalCommands(environment(), executor, {});
    const result = await commands.execute(guestCreateEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.details).toEqual({ field: 'guestActionTokenSecret', reason: 'required' });
    }
  });

  it('authorizes guest_single reads with the returned credential', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixtureWithoutParticipant());
    const commands = runCommands(executor);
    const createResult = await commands.execute(
      guestCreateEnvelope({ context: { ...guestCreateEnvelope().context, idempotencyKey: 'guest-read-01' } })
    );
    expect(createResult.status).toBe('success');
    const credential = createResult.payload?.guestActionCredential;
    expect(credential).toBeDefined();

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    const instructor = snapshot.docs.get(`instructors/${instructorId}`)?.data;
    const participant = snapshot.docs.get(`participants/${participantId}`)?.data;

    const firestore = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const path = `${name}/${id}`;
            const data = snapshot.docs.get(path)?.data;
            return {
              exists: data !== undefined,
              data: () => data,
            };
          },
        }),
        where: () => ({
          limit: () => ({
            get: async () => ({ docs: [] }),
          }),
        }),
      }),
    } as unknown as import('firebase-admin/firestore').Firestore;

    const authorized = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'guest_single',
        bookingId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: tokenSecret, now: new Date('2026-01-01T10:30:00.000Z') }
    );
    expect(authorized.items).toHaveLength(1);
    expect(authorized.items[0]?.bookingId).toBe(bookingId);

    const wrongSubject = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'guest_single',
        bookingId: BookingIdSchema.parse('booking_guest_cmd_other'),
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: tokenSecret, now: new Date('2026-01-01T10:30:00.000Z') }
    );
    expect(wrongSubject.items).toHaveLength(0);

    const expired = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'guest_single',
        bookingId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: tokenSecret, now: new Date('2026-01-01T12:30:00.000Z') }
    );
    expect(expired.items).toHaveLength(0);

    expect(booking).toBeDefined();
    expect(instructor).toBeDefined();
    expect(participant).toBeDefined();
  });
});

describe('confirm_guest_booking command', () => {
  async function seedPending(executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>) {
    const commands = runCommands(executor);
    await commands.execute(guestCreateEnvelope());
  }

  it('confirms a pending guest booking without wallet funding', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await seedPending(executor);
    const commands = runCommands(executor);
    const result = await commands.execute({
      kind: 'confirm_guest_booking',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-confirm-01',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingId },
    });
    expect(result.status).toBe('success');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.lifecycle?.status).toBe('confirmed');
    expect(booking?.attribution.bookingOrigin).toBe('guest');
  });
});

describe('expire_guest_reservation command', () => {
  it('cancels expired pending guest bookings and releases claims', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const createCommands = runCommands(executor, '2026-01-01T10:00:00.000Z');
    await createCommands.execute(guestCreateEnvelope());

    const expireCommands = runCommands(executor, '2026-01-01T11:30:00.000Z');
    const result = await expireCommands.execute({
      kind: 'expire_guest_reservation',
      context: {
        actor: systemCommandActor(SystemActorIdSchema.parse('system_guest_expiry_01')),
        exercisedCapability: 'system',
        idempotencyKey: 'guest-expire-01',
        correlationId,
        source: 'scheduler',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingId },
    });
    expect(result.status).toBe('success');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.lifecycle.status).toBe('cancelled');
    expect(booking?.lifecycle.reasonCode).toBe('reservation_expired');
    const claims = [...executor.snapshot().docs.entries()].filter(([path]) =>
      path.startsWith('resource_claims/')
    );
    expect(claims.every(([, doc]) => doc.data.lifecycle?.status === 'released')).toBe(true);
  });
});

describe('guest pending cancellation command', () => {
  it('cancels via guest token without wallet effects', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = runCommands(executor);
    const createResult = await commands.execute(guestCreateEnvelope());
    const credential = createResult.payload?.guestActionCredential;
    expect(credential).toBeDefined();
    const nonce = credential!.nonce;
    const signature = credential!.signature;

    const result = await commands.execute({
      kind: 'request_booking_cancellation',
      context: {
        actor: guestCommandActor(guestSubjectId),
        exercisedCapability: 'guest',
        idempotencyKey: 'guest-cancel-01',
        correlationId,
        source: 'guest_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
        transportMetadata: {
          [GUEST_ACTION_NONCE_TRANSPORT_KEY]: nonce,
          [GUEST_ACTION_SIGNATURE_TRANSPORT_KEY]: signature,
        },
      },
      intent: { bookingId },
    });
    expect(result.status).toBe('success');
    const updated = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(updated?.lifecycle).toMatchObject({
      status: 'cancelled',
      reasonCode: 'guest_cancelled',
    });
  });
});

describe('link_guest_booking_to_account command', () => {
  it('links unmanaged guest participant without rewriting booking origin', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = runCommands(executor);
    await commands.execute(guestCreateEnvelope());
    const result = await commands.execute({
      kind: 'link_guest_booking_to_account',
      context: {
        actor: accountCommandActor(linkAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'guest-link-01',
        correlationId,
        source: 'client_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingId, participantId },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`participants/${participantId}`)?.data.management.kind).toBe('managed');
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.attribution.bookingOrigin).toBe('guest');
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.attribution.bookedBy).toEqual({
      kind: 'guest',
      guestSubjectId,
    });
  });
});

describe('guest booking audit registry', () => {
  it('creates one activity log per mutation', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = runCommands(executor);
    const envelope = guestCreateEnvelope();
    await commands.execute(envelope);
    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(
      executor.snapshot().docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
  });
});
