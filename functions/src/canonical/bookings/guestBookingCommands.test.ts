import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  AdministrativeAvailabilityBlockIdSchema,
  AccountSchema,
  BookingIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  CorrelationIdSchema,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  InstructorIdSchema,
  ParticipantIdSchema,
  SystemActorIdSchema,
  activityLogIdFromCommandId,
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  WalletSchema,
  systemCommandActor,
  resolveRefundDestination,
  type Booking,
  type CommandEnvelope,
  type Payment,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import {
  createInMemoryCanonicalTransactionExecutor,
  type CanonicalTransactionExecutor,
} from '../transactions';
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

  it('stores per-lesson difficulty and notes without changing guest Participant.skillLevel', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixtureWithoutParticipant());
    const commands = runCommands(executor);
    const result = await commands.execute(
      guestCreateEnvelope({
        intent: {
          bookingId,
          instructorId,
          participantIds: [participantId],
          difficulty: 'freeride',
          notes: 'First time off-piste',
        },
      })
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    const participant = snapshot.docs.get(`participants/${participantId}`)?.data;
    expect(booking?.difficulty).toBe('freeride');
    expect(booking?.notes).toBe('First time off-piste');
    expect(participant?.skillLevel).toBe('beginner');
  });

  it('does not overwrite an existing guest Participant.skillLevel from booking difficulty', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = runCommands(executor);
    const result = await commands.execute(
      guestCreateEnvelope({
        intent: {
          bookingId,
          instructorId,
          participantIds: [participantId],
          difficulty: 'advanced',
        },
      })
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data?.difficulty).toBe('advanced');
    expect(snapshot.docs.get(`participants/${participantId}`)?.data?.skillLevel).toBe('beginner');
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

  it('rejects manual confirmation while required Payment is unpaid', async () => {
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
    expect(result.status).toBe('error');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.lifecycle?.status).toBe('pending');
    expect(booking?.attribution.bookingOrigin).toBe('guest');
  });

  it('binds direct confirmation to the requested Booking and its deterministic Payment', async () => {
    const seedExecutor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await seedPending(seedExecutor);
    const docs = Object.fromEntries(
      [...seedExecutor.snapshot().docs.entries()].map(([path, document]) => [path, document.data])
    );
    const requestedBookingPath = `bookings/${bookingId}`;
    const requestedBooking = docs[requestedBookingPath]!;
    const originalPayment = docs[`payments/${paymentId}`]!;
    const foreignBookingId = BookingIdSchema.parse('booking_guest_cmd_foreign');
    const foreignPaymentId = paymentIdFromBookingId(foreignBookingId);

    docs[requestedBookingPath] = { ...requestedBooking, paymentId: foreignPaymentId };
    docs[`bookings/${foreignBookingId}`] = {
      ...requestedBooking,
      bookingId: foreignBookingId,
      paymentId: foreignPaymentId,
    };
    docs[`payments/${foreignPaymentId}`] = {
      ...originalPayment,
      paymentId: foreignPaymentId,
      subjectId: foreignBookingId,
      paidAmount: 12_000,
      retainedAmount: 12_000,
      settledAmount: 12_000,
      outstandingAmount: 0,
      paymentStatus: 'paid',
    };

    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const result = await runCommands(executor).execute({
      kind: 'confirm_guest_booking',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-confirm-subject-mismatch',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingId },
    });

    expect(result.status).toBe('error');
    expect(result.status === 'error' ? result.error.code : '').toBe('validation');
    expect(executor.snapshot().docs.get(requestedBookingPath)?.data.lifecycle.status).toBe(
      'pending'
    );
    expect(executor.snapshot().docs.get(`bookings/${foreignBookingId}`)?.data.lifecycle.status).toBe(
      'pending'
    );
  });

  it('keeps partial Payment pending and confirms atomically when fully funded', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await seedPending(executor);

    const partial = await runCommands(executor).execute({
      kind: 'record_provider_payment_event',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-payment-partial-01',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        amount: 5_000,
        sourceKind: 'manual_external',
        manualReference: 'guest-payment-partial-ref',
      },
    });
    expect(partial.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data?.lifecycle.status).toBe(
      'pending'
    );

    const fullEnvelope: CommandEnvelope<'record_provider_payment_event'> = {
      kind: 'record_provider_payment_event',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-payment-full-01',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(2),
      },
      intent: {
        paymentId,
        amount: 7_000,
        sourceKind: 'manual_external',
        manualReference: 'guest-payment-full-ref',
      },
    };
    const full = await runCommands(executor).execute(fullEnvelope);
    expect(full.status).toBe('success');
    const confirmed = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(confirmed?.lifecycle.status).toBe('confirmed');
    expect(confirmed?.revision).toBe(2);
    expect(confirmed?.occurrence.serviceParty.frozenAt).toBeDefined();

    const replay = await runCommands(executor).execute(fullEnvelope);
    expect(replay.status).toBe('success');
    const replayed = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(replayed?.revision).toBe(2);
    expect(executor.snapshot().docs.get(`payments/${paymentId}`)?.data?.paidAmount).toBe(12_000);
  });

  it('clears a stale confirmation plan when a transaction retry observes terminal lifecycle', async () => {
    const seedExecutor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await seedPending(seedExecutor);
    const seedDocs = Object.fromEntries(
      [...seedExecutor.snapshot().docs.entries()].map(([path, document]) => [path, document.data])
    );
    const booking = seedDocs[`bookings/${bookingId}`]!;
    const payment = seedDocs[`payments/${paymentId}`]!;
    const wallet = WalletSchema.parse({
      accountId: adminAccountId,
      currency: 'KZT',
      balance: 0,
      revision: 1,
      eventRevision: 0,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    });

    const firstAttempt = createInMemoryCanonicalTransactionExecutor({
      ...seedDocs,
      [`payments/${paymentId}`]: {
        ...payment,
        paidAmount: 10_000,
        retainedAmount: 10_000,
        settledAmount: 10_000,
        outstandingAmount: 2_000,
        paymentStatus: 'partially_paid',
      },
      [`users/${adminAccountId}/wallet/state`]: wallet,
    });
    const retryAttempt = createInMemoryCanonicalTransactionExecutor({
      ...seedDocs,
      [`bookings/${bookingId}`]: {
        ...booking,
        lifecycle: {
          status: 'completed',
          completedAt: decidedAt,
        },
        revision: 2,
      },
      [`payments/${paymentId}`]: {
        ...payment,
        paidAmount: 12_000,
        retainedAmount: 12_000,
        settledAmount: 12_000,
        outstandingAmount: 0,
        paymentStatus: 'paid',
      },
      [`users/${adminAccountId}/wallet/state`]: wallet,
    });
    let firstInvocation = true;
    const retryExecutor: CanonicalTransactionExecutor & {
      snapshot: typeof retryAttempt.snapshot;
    } = {
      snapshot: () => retryAttempt.snapshot(),
      async runAtomic(input) {
        if (firstInvocation) {
          firstInvocation = false;
          try {
            await firstAttempt.runAtomic({
              ...input,
              run: async (session) => {
                await input.run(session);
                throw new Error('TRANSACTION_ABORTED');
              },
            });
          } catch (error) {
            if (!(error instanceof Error) || error.message !== 'TRANSACTION_ABORTED') throw error;
          }
        }
        return retryAttempt.runAtomic(input);
      },
    };

    const result = await createProductionCanonicalCommands(
      environment('2026-01-01T10:30:00.000Z'),
      retryExecutor,
      { guestActionTokenSecret: tokenSecret }
    ).execute({
      kind: 'adjust_service_price',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-price-retry-clears-confirmation',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        newPrice: 10_000,
        walletAccountId: adminAccountId,
        reasonExplanation: 'Retry observes terminal guest booking',
      },
    });

    expect(result.status).toBe('success');
    const snapshot = retryExecutor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe('completed');
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.revision).toBe(2);
    const log = snapshot.docs.get(
      `activity_logs/${activityLogIdFromCommandId(
        resolveCommandIdempotencyIdentity({
          kind: 'adjust_service_price',
          context: {
            actor: accountCommandActor(adminAccountId),
            exercisedCapability: 'administrator',
            idempotencyKey: 'guest-price-retry-clears-confirmation',
            correlationId,
            source: 'admin_callable',
            expectedRevision: AggregateRevisionSchema.parse(1),
          },
          intent: {
            paymentId,
            newPrice: 10_000,
            walletAccountId: adminAccountId,
            reasonExplanation: 'Retry observes terminal guest booking',
          },
        }).commandKey
      )}`
    )?.data;
    expect(log?.effects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'booking_lifecycle_changed' })])
    );
  });
});

describe('expire_guest_reservation command', () => {
  it('cancels expired pending guest bookings and releases claims', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const createCommands = runCommands(executor, '2026-01-01T10:00:00.000Z');
    await createCommands.execute(guestCreateEnvelope());

    const expireCommands = runCommands(executor, '2026-01-01T11:30:00.000Z');
    const envelope: CommandEnvelope<'expire_guest_reservation'> = {
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
    };
    const result = await expireCommands.execute(envelope);
    expect(result.status).toBe('success');
    expect((await expireCommands.execute(envelope)).status).toBe('success');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.lifecycle.status).toBe('cancelled');
    expect(booking?.lifecycle.reasonCode).toBe('reservation_expired');
    const claims = [...executor.snapshot().docs.entries()].filter(([path]) =>
      path.startsWith('resource_claims/')
    );
    expect(claims.every(([, doc]) => doc.data.lifecycle?.status === 'released')).toBe(true);
  });

  it('rejects a late full settlement after expiry without mutating Payment', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await runCommands(executor, '2026-01-01T10:00:00.000Z').execute(guestCreateEnvelope());
    await runCommands(executor, '2026-01-01T11:30:00.000Z').execute({
      kind: 'expire_guest_reservation',
      context: {
        actor: systemCommandActor(SystemActorIdSchema.parse('system_guest_expiry_late_payment')),
        exercisedCapability: 'system',
        idempotencyKey: 'guest-expire-before-payment',
        correlationId,
        source: 'scheduler',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingId },
    });

    const result = await runCommands(executor, '2026-01-01T11:31:00.000Z').execute({
      kind: 'record_provider_payment_event',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-late-payment-after-expiry',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        amount: 12_000,
        sourceKind: 'manual_external',
        manualReference: 'guest-late-payment-after-expiry-ref',
      },
    });

    expect(result.status).toBe('error');
    expect(result.status === 'error' ? result.error.code : '').toBe('invalid_transition');
    expect(executor.snapshot().docs.get(`payments/${paymentId}`)?.data).toMatchObject({
      paidAmount: 0,
      settledAmount: 0,
      outstandingAmount: 12_000,
      revision: 1,
    });
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle.status).toBe(
      'cancelled'
    );
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
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${linkAccountId}/wallet/state`]: WalletSchema.parse({
          accountId: linkAccountId,
          currency: 'KZT',
          balance: 18_000,
          revision: 1,
          eventRevision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        }),
      })
    );
    const commands = runCommands(executor);
    await commands.execute(guestCreateEnvelope());
    const before = executor.snapshot();
    const bookingBefore = before.docs.get(`bookings/${bookingId}`)?.data;
    const paymentBefore = before.docs.get(`payments/${paymentId}`)?.data;
    expect(bookingBefore?.payerAccountId).toBeUndefined();
    expect(paymentBefore?.payerAccountId).toBeUndefined();
    expect(
      resolveRefundDestination({
        booking: bookingBefore as unknown as Booking,
        payment: paymentBefore as unknown as Payment,
      })
    ).toBe('manual_external');

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
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    const payment = snapshot.docs.get(`payments/${paymentId}`)?.data;
    expect(snapshot.docs.get(`participants/${participantId}`)?.data.management.kind).toBe('managed');
    expect(booking?.attribution.bookingOrigin).toBe('guest');
    expect(booking?.attribution.bookedBy).toEqual({
      kind: 'guest',
      guestSubjectId,
    });
    expect(booking?.lifecycle.status).toBe('pending');
    expect(booking?.payerAccountId).toBe(linkAccountId);
    expect(payment?.payerAccountId).toBe(linkAccountId);
    expect(booking?.payerAccountId).toBe(payment?.payerAccountId);
    expect(payment?.paidAmount).toBe(paymentBefore?.paidAmount);
    expect(payment?.outstandingAmount).toBe(paymentBefore?.outstandingAmount);
    expect(payment?.paymentStatus).toBe(paymentBefore?.paymentStatus);
    expect(payment?.eventRevision).toBe(paymentBefore?.eventRevision);
    expect(
      resolveRefundDestination({
        booking: booking as unknown as Booking,
        payment: payment as unknown as Payment,
      })
    ).toBe('wallet');
    expect(snapshot.docs.get(`users/${linkAccountId}/wallet/state`)?.data.balance).toBe(18_000);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/'))
    ).toEqual([]);
  });
});

describe('guest booking schedule occupancy guards', () => {
  const adminAccountId = AccountIdSchema.parse('account_guest_schedule_admin');
  const otherInstructorId = InstructorIdSchema.parse('instructor_guest_schedule_other');
  const existingBookingId = BookingIdSchema.parse('booking_guest_schedule_existing');
  const guestBookingId = BookingIdSchema.parse('booking_guest_schedule_attempt');

  function scheduleFixture(extra: Record<string, unknown> = {}) {
    return baseFixture({
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
      [`instructors/${otherInstructorId}`]: {
        id: otherInstructorId,
        name: 'Other Coach',
        pricePerHourKZT: 12_000,
        isAvailable: true,
      },
      ...extra,
    });
  }

  function guestEnvelopeForAttempt(
    bookingIdValue: string,
    localTime: string,
    instructor = instructorId,
    idempotencyKey = `guest-schedule-${bookingIdValue}-${localTime}`
  ): CommandEnvelope<'create_guest_booking_request'> {
    const parsedBookingId = BookingIdSchema.parse(bookingIdValue);
    return {
      kind: 'create_guest_booking_request',
      context: {
        actor: guestCommandActor(guestSubjectIdFromBookingId(parsedBookingId)),
        exercisedCapability: 'guest',
        idempotencyKey,
        correlationId,
        source: 'guest_callable',
        calendarInput: {
          localDate: '2026-01-15',
          localTime,
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
        transportMetadata: guestParticipantTransport(),
      },
      intent: {
        bookingId: parsedBookingId,
        instructorId: instructor,
        participantIds: [participantId],
      },
    };
  }

  async function seedConfirmedLesson(input: {
    bookingId: string;
    localTime: string;
    instructor?: string;
    participantIdValue?: string;
  }) {
    const payerAccountId = AccountIdSchema.parse('account_guest_schedule_payer');
    const managementId = `management_${input.bookingId}`;
    const localParticipantId = ParticipantIdSchema.parse(
      input.participantIdValue ?? 'participant_guest_schedule_existing'
    );
    const docs = scheduleFixture({
      [`users/${payerAccountId}`]: seedAccount(payerAccountId),
      [`users/${payerAccountId}/wallet/state`]: WalletSchema.parse({
        accountId: payerAccountId,
        currency: 'KZT',
        balance: 50_000,
        revision: 1,
        eventRevision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      }),
      [`participants/${localParticipantId}`]: {
        participantId: localParticipantId,
        displayName: 'Existing Participant',
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
        participantId: localParticipantId,
        accountId: payerAccountId,
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
    });
    const seededExecutor = createInMemoryCanonicalTransactionExecutor(docs);
    const commands = runCommands(seededExecutor);
    const result = await commands.execute({
      kind: 'create_confirmed_booking',
      context: {
        actor: accountCommandActor(payerAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: `seed-confirmed-${input.bookingId}`,
        correlationId,
        source: 'client_callable',
        calendarInput: {
          localDate: '2026-01-15',
          localTime: input.localTime,
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
      },
      intent: {
        bookingId: BookingIdSchema.parse(input.bookingId),
        instructorId: InstructorIdSchema.parse(input.instructor ?? instructorId),
        participantIds: [localParticipantId],
      },
    });
    expect(result.status).toBe('success');
    return seededExecutor;
  }

  async function seedAdministrativeBlock(
    executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
    input: {
      blockId: string;
      kind: 'break' | 'day_off';
      localTime: string;
      durationMinutes: number;
    }
  ) {
    const commands = runCommands(executor);
    const result = await commands.execute({
      kind: 'create_administrative_availability_block',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: `seed-block-${input.blockId}`,
        correlationId,
        source: 'admin_callable',
        calendarInput: {
          localDate: '2026-01-15',
          localTime: input.localTime,
          durationMinutes: input.durationMinutes,
        },
        timezone: 'Asia/Almaty',
      },
      intent: {
        blockId: AdministrativeAvailabilityBlockIdSchema.parse(input.blockId),
        instructorId,
        kind: input.kind,
        notes: input.kind,
        reasonExplanation: 'Guest schedule guard test',
      },
    });
    expect(result.status).toBe('success');
  }

  it('allows guest booking on a free slot', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(scheduleFixture());
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '09:00')
    );
    expect(result.status).toBe('success');
  });

  it('rejects guest booking overlapping an existing lesson booking', async () => {
    const executor = await seedConfirmedLesson({
      bookingId: existingBookingId,
      localTime: '10:00',
    });
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '10:30')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('instructor_conflict');
    }
    expect(executor.snapshot().docs.has(`bookings/${guestBookingId}`)).toBe(false);
  });

  it('rejects guest booking overlapping an active break', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(scheduleFixture());
    await seedAdministrativeBlock(executor, {
      blockId: 'block_guest_schedule_break',
      kind: 'break',
      localTime: '12:00',
      durationMinutes: 60,
    });
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '12:30')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('instructor_conflict');
    }
  });

  it('rejects guest booking overlapping an active day_off', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(scheduleFixture());
    await seedAdministrativeBlock(executor, {
      blockId: 'block_guest_schedule_day_off',
      kind: 'day_off',
      localTime: '08:00',
      durationMinutes: 660,
    });
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '09:00')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('instructor_conflict');
    }
  });

  it('rejects guest booking overlapping a CourseDay instructor occupancy', async () => {
    const courseId = CourseIdSchema.parse('course_guest_schedule');
    const courseDayId = CourseDayIdSchema.parse('course_day_guest_schedule');
    const placeholderEnd = timestampFromDate(new Date('2026-01-15T03:00:00.000Z'));
    const executor = createInMemoryCanonicalTransactionExecutor(
      scheduleFixture({
        [`courses/${courseId}`]: {
          courseId,
          title: 'Guest Schedule Course',
          lifecycle: 'active',
          price: 12_000,
          capacity: { totalSeats: 8, availableSeats: 8 },
          instructorRosterIds: [instructorId],
          startAt: placeholderEnd,
          scheduleProjection: {
            courseDayCount: 1,
            finalCourseDayEndsAt: placeholderEnd,
            courseScheduleRevision: 1,
          },
          revision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: 'command_seed_course',
            lastChangedByCommandId: 'command_seed_course',
            correlationId,
          },
        },
      })
    );
    const createDay = await runCommands(executor).execute({
      kind: 'create_course_day',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'seed-course-day-guest-schedule',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
        calendarInput: {
          localDate: '2026-01-15',
          localTime: '14:00',
          durationMinutes: 120,
        },
        timezone: 'Asia/Almaty',
      },
      intent: { courseDayId, courseId, instructorId },
    });
    expect(createDay.status).toBe('success');

    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '15:00')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('instructor_conflict');
    }
    expect(executor.snapshot().docs.has(`bookings/${guestBookingId}`)).toBe(false);
  });

  it('allows adjacent guest booking immediately after an existing lesson', async () => {
    const executor = await seedConfirmedLesson({
      bookingId: existingBookingId,
      localTime: '09:00',
    });
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '10:00')
    );
    expect(result.status).toBe('success');
  });

  it('allows the same interval for a different instructor', async () => {
    const executor = await seedConfirmedLesson({
      bookingId: existingBookingId,
      localTime: '10:00',
      instructor: instructorId,
      participantIdValue: 'participant_guest_schedule_other_lesson',
    });
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '10:00', otherInstructorId)
    );
    expect(result.status).toBe('success');
  });

  it('does not block guest booking after an administrative block is released', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(scheduleFixture());
    const blockId = AdministrativeAvailabilityBlockIdSchema.parse('block_guest_schedule_released');
    await seedAdministrativeBlock(executor, {
      blockId,
      kind: 'break',
      localTime: '14:00',
      durationMinutes: 60,
    });
    const release = await runCommands(executor).execute({
      kind: 'release_administrative_availability_block',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-schedule-release-block',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { blockId, reasonExplanation: 'Guest schedule guard release test' },
    });
    expect(release.status).toBe('success');
    const result = await runCommands(executor).execute(
      guestEnvelopeForAttempt(guestBookingId, '14:00')
    );
    expect(result.status).toBe('success');
  });

  it('replays the same guest create command without duplicate writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(scheduleFixture());
    const envelope = guestEnvelopeForAttempt(guestBookingId, '11:00', instructorId, 'guest-idem');
    const first = await runCommands(executor).execute(envelope);
    const second = await runCommands(executor).execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${guestBookingId}`)).toBeDefined();
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('activity_logs/')).length
    ).toBe(1);
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
