import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { accountCommandActor } from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { participantBlockIdFromDirection } from '@ski-academy/shared-domain';

const correlationId = CorrelationIdSchema.parse('correlation_booking_cmd_01');
const accountId = AccountIdSchema.parse('account_booking_cmd_01');
const adminAccountId = AccountIdSchema.parse('account_booking_admin_01');
const participantId = ParticipantIdSchema.parse('participant_booking_cmd_01');
const participantTwoId = ParticipantIdSchema.parse('participant_booking_cmd_02');
const participantThreeId = ParticipantIdSchema.parse('participant_booking_cmd_03');
const participantFourId = ParticipantIdSchema.parse('participant_booking_cmd_04');
const managementId = ParticipantManagementIdSchema.parse('management_booking_cmd_01');
const managementTwoId = ParticipantManagementIdSchema.parse('management_booking_cmd_02');
const managementThreeId = ParticipantManagementIdSchema.parse('management_booking_cmd_03');
const managementFourId = ParticipantManagementIdSchema.parse('management_booking_cmd_04');
const instructorId = InstructorIdSchema.parse('instructor_booking_cmd_01');
const bookingId = BookingIdSchema.parse('booking_booking_cmd_01');
const bookingTwoId = BookingIdSchema.parse('booking_booking_cmd_02');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(
  capability: 'account_owner' | 'parent_guardian' | 'administrator',
  actorAccountId = accountId,
  idempotencyKey = `idem-${Math.random().toString(36).slice(2, 10)}`
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source:
      capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    calendarInput: {
      localDate: '2026-01-15',
      localTime: '09:00',
      durationMinutes: 60,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function seedAccount(account = accountId) {
  return AccountSchema.parse({
    accountId: account,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    },
  });
}

function seedParticipant() {
  return {
    participantId,
    displayName: 'Booking Participant',
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
  };
}

function seedAdditionalParticipant(
  targetParticipantId: typeof participantId,
  targetManagementId: typeof managementId
) {
  return {
    ...seedParticipant(),
    participantId: targetParticipantId,
    displayName: `Booking Participant ${targetParticipantId}`,
    management: { kind: 'managed', participantManagementId: targetManagementId },
  };
}

function seedManagement(account = accountId) {
  return {
    participantManagementId: managementId,
    participantId,
    accountId: account,
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
  };
}

function seedAdditionalManagement(
  targetParticipantId: typeof participantId,
  targetManagementId: typeof managementId,
  account = accountId
) {
  return {
    ...seedManagement(account),
    participantManagementId: targetManagementId,
    participantId: targetParticipantId,
  };
}

function seedInstructor() {
  return {
    id: instructorId,
    name: 'Coach Booking',
    avatarUrl: 'https://example.com/avatar.png',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  };
}

function seedWallet(balance: number, account = accountId) {
  return WalletSchema.parse({
    accountId: account,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function baseFixture(extra: Record<string, unknown> = {}, maxParticipantsPerLesson = 4) {
  return {
    [`users/${accountId}`]: seedAccount(),
    [`users/${adminAccountId}`]: seedAccount(adminAccountId),
    [`participants/${participantId}`]: seedParticipant(),
    [`participants/${participantTwoId}`]: seedAdditionalParticipant(
      participantTwoId,
      managementTwoId
    ),
    [`participants/${participantThreeId}`]: seedAdditionalParticipant(
      participantThreeId,
      managementThreeId
    ),
    [`participants/${participantFourId}`]: seedAdditionalParticipant(
      participantFourId,
      managementFourId
    ),
    [`participant_management/${managementId}`]: seedManagement(),
    [`participant_management/${managementTwoId}`]: seedAdditionalManagement(
      participantTwoId,
      managementTwoId
    ),
    [`participant_management/${managementThreeId}`]: seedAdditionalManagement(
      participantThreeId,
      managementThreeId
    ),
    [`participant_management/${managementFourId}`]: seedAdditionalManagement(
      participantFourId,
      managementFourId
    ),
    [`instructors/${instructorId}`]: seedInstructor(),
    [`users/${accountId}/wallet/state`]: seedWallet(50_000),
    'lesson_pricing_settings/lesson_booking': {
      settingsId: 'lesson_booking',
      additionalParticipantSurchargePerHourKzt: 6_000,
      maxParticipantsPerLesson,
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_pricing',
        lastChangedByCommandId: 'command_seed_pricing',
        correlationId,
      },
    },
    ...extra,
  };
}

function createEnvelope(
  overrides: Partial<CommandEnvelope<'create_confirmed_booking'>> = {}
): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: accountContext('account_owner', accountId, 'booking-create-01'),
    intent: {
      bookingId,
      instructorId,
      participantIds: [participantId],
    },
    ...overrides,
  };
}

async function runCommand(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  envelope: CommandEnvelope<'create_confirmed_booking'>
) {
  const commands = createProductionCanonicalCommands(environment(), executor);
  return commands.execute(envelope);
}

describe('create_confirmed_booking command', () => {
  it('creates a fully funded individual booking with payment, claims, and audit', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const envelope = createEnvelope();
    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.attribution).toEqual({
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId },
    });
    expect(booking?.lifecycle).toEqual({ status: 'confirmed' });
    expect(booking?.occurrence?.occurrenceId).toBe(
      initialBookingOccurrenceIdFromBookingId(bookingId)
    );
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(38_000);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(
      snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
    expect(
      snapshot.docs.has(
        `monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`
      )
    ).toBe(true);
  });

  it('rejects authenticated creation when wallet funds are insufficient', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${accountId}/wallet/state`]: seedWallet(1_000),
      })
    );
    const result = await runCommand(executor, createEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('insufficient_funds');
    }
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(false);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(0);
  });

  it('rejects creation when an active block exists', async () => {
    const blockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participant_blocks/${blockId}`]: {
          participantBlockId: blockId,
          participantId,
          instructorId,
          status: 'active',
          reason: 'Manager blocked instructor for participant',
          createdBy: {
            kind: 'participant_manager',
            accountId,
            participantManagementId: managementId,
          },
          revision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: 'command_seed_block',
            lastChangedByCommandId: 'command_seed_block',
            correlationId,
          },
        },
      })
    );
    const result = await runCommand(executor, createEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('blocked_relationship');
    }
  });

  it('allows admin underfunded creation with mandatory reason', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${accountId}/wallet/state`]: seedWallet(5_000),
      })
    );
    const envelope = createEnvelope({
      context: accountContext('administrator', adminAccountId, 'booking-admin-01'),
      intent: {
        bookingId,
        instructorId,
        participantIds: [participantId],
        reasonExplanation: 'Approved admin underpayment for trusted client',
      },
    });
    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');
    const payment = executor.snapshot().docs.get(`payments/${paymentId}`)?.data;
    expect(payment?.outstandingAmount).toBeGreaterThan(0);
    expect(payment?.paymentStatus).toBe('partially_paid');
    expect(
      executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.attribution.bookingOrigin
    ).toBe('admin');
  });

  it('allows admin creation with a zero wallet without staging zero-value funding', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${accountId}/wallet/state`]: seedWallet(0),
      })
    );
    const envelope = createEnvelope({
      context: accountContext('administrator', adminAccountId, 'booking-admin-zero-wallet'),
      intent: {
        bookingId,
        instructorId,
        participantIds: [participantId],
        reasonExplanation: 'Approved admin booking with an unpaid balance',
      },
    });

    const result = await runCommand(executor, envelope);

    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    const payment = snapshot.docs.get(`payments/${paymentId}`)?.data;
    expect(payment?.paidAmount).toBe(0);
    expect(payment?.outstandingAmount).toBe(12_000);
    expect(payment?.paymentStatus).toBe('unpaid');
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/'))
    ).toHaveLength(0);
  });

  it('replays the same idempotency key without duplicate writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const envelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'booking-replay-01'),
    });
    const first = await runCommand(executor, envelope);
    const second = await runCommand(executor, envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('bookings/')).length
    ).toBe(1);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/'))
        .length
    ).toBe(1);
  });

  it('persists per-lesson difficulty and notes on create_confirmed_booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await runCommand(
      executor,
      createEnvelope({
        intent: {
          bookingId,
          instructorId,
          participantIds: [participantId],
          difficulty: 'intermediate',
          notes: '  Focus on carving  ',
        },
      })
    );
    expect(result.status).toBe('success');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.difficulty).toBe('intermediate');
    expect(booking?.notes).toBe('Focus on carving');
  });

  it('omits empty notes and does not invent a beginner difficulty', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await runCommand(
      executor,
      createEnvelope({
        intent: {
          bookingId,
          instructorId,
          participantIds: [participantId],
          notes: '   ',
        },
      })
    );
    expect(result.status).toBe('success');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.difficulty).toBeUndefined();
    expect(booking?.notes).toBeUndefined();
  });

  it.each([
    [[participantId, participantTwoId], 18_000],
    [[participantId, participantTwoId, participantThreeId], 24_000],
    [[participantId, participantTwoId, participantThreeId, participantFourId], 30_000],
  ] as const)(
    'creates one Booking and one Payment for %s with the 60-minute per-hour surcharge',
    async (party, expectedPrice) => {
      const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
      const envelope = createEnvelope({
        intent: { bookingId, instructorId, participantIds: [...party] },
      });
      const result = await runCommand(executor, envelope);
      expect(result.status).toBe('success');
      const snapshot = executor.snapshot();
      expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.party.participantIds).toEqual([
        ...party,
      ]);
      expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(expectedPrice);
      expect([...snapshot.docs.keys()].filter((path) => path.startsWith('bookings/'))).toHaveLength(
        1
      );
      expect([...snapshot.docs.keys()].filter((path) => path.startsWith('payments/'))).toHaveLength(
        1
      );
      const claims = [...snapshot.docs.values()]
        .map((entry) => entry.data)
        .filter((data) => data.claimKind === 'instructor_booking_occurrence');
      expect(claims).toHaveLength(1);
    }
  );

  it.each([
    [1, 30, 6_000],
    [1, 60, 12_000],
    [1, 90, 18_000],
    [1, 120, 24_000],
    [2, 30, 9_000],
    [2, 60, 18_000],
    [2, 90, 27_000],
    [2, 120, 36_000],
    [3, 30, 12_000],
    [3, 60, 24_000],
    [3, 90, 36_000],
    [3, 120, 48_000],
  ] as const)(
    'authoritatively prices %i participants for %i minutes from canonical duration',
    async (participantCount, durationMinutes, expectedPrice) => {
      const party = [participantId, participantTwoId, participantThreeId].slice(
        0,
        participantCount
      );
      const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
      const envelope = createEnvelope({
        context: {
          ...accountContext(
            'account_owner',
            accountId,
            `booking-duration-${participantCount}-${durationMinutes}`
          ),
          calendarInput: { localDate: '2026-01-15', localTime: '09:00', durationMinutes },
        },
        intent: { bookingId, instructorId, participantIds: party },
      });
      const result = await runCommand(executor, envelope);
      expect(result.status).toBe('success');
      const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
      const payment = executor.snapshot().docs.get(`payments/${paymentId}`)?.data;
      expect(payment?.price).toBe(expectedPrice);
      expect(booking?.pricingSnapshot).toMatchObject({
        strategyVersion: 'lesson_party:v1',
        additionalParticipantSurchargePerHourKzt: 6_000,
        lessonDurationMinutes: durationMinutes,
        participantCount,
        totalPriceKzt: expectedPrice,
        settingsRevision: 1,
      });
    }
  );

  it('requires canonical lesson settings for authenticated creation', async () => {
    const fixture: Record<string, unknown> = baseFixture();
    delete fixture['lesson_pricing_settings/lesson_booking'];

    const singleExecutor = createInMemoryCanonicalTransactionExecutor(fixture);
    expect((await runCommand(singleExecutor, createEnvelope())).status).toBe('error');
    expect(singleExecutor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);

    const multiExecutor = createInMemoryCanonicalTransactionExecutor(fixture);
    const multiResult = await runCommand(
      multiExecutor,
      createEnvelope({
        intent: { bookingId, instructorId, participantIds: [participantId, participantTwoId] },
      })
    );
    expect(multiResult.status).toBe('error');
    expect(multiResult.error?.code).toBe('validation');
    expect(multiExecutor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(multiExecutor.snapshot().docs.has(`payments/${paymentId}`)).toBe(false);
  });

  it.each([
    [1, [participantId], true],
    [1, [participantId, participantTwoId], false],
    [2, [participantId, participantTwoId], true],
    [4, [participantId, participantTwoId, participantThreeId, participantFourId], true],
  ] as const)(
    'enforces current max=%i for a forged party of %s',
    async (maxParticipantsPerLesson, party, succeeds) => {
      const executor = createInMemoryCanonicalTransactionExecutor(
        baseFixture({}, maxParticipantsPerLesson)
      );
      const result = await runCommand(
        executor,
        createEnvelope({ intent: { bookingId, instructorId, participantIds: [...party] } })
      );
      expect(result.status).toBe(succeeds ? 'success' : 'error');
      const snapshot = executor.snapshot();
      expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(succeeds);
      expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(succeeds);
      const createdClaims = [...snapshot.docs.keys()].filter((path) =>
        path.startsWith('resource_claims/')
      );
      expect(createdClaims.length === 0).toBe(!succeeds);
    }
  );

  it('allows one account to book self and a managed dependent with guardian authority', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participant_management/${managementTwoId}`]: {
          ...seedAdditionalManagement(participantTwoId, managementTwoId),
          authority: 'parent_guardian',
        },
      })
    );
    const result = await runCommand(
      executor,
      createEnvelope({
        context: accountContext('parent_guardian', accountId, 'booking-self-and-dependent'),
        intent: { bookingId, instructorId, participantIds: [participantId, participantTwoId] },
      })
    );
    expect(result.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.party.participantIds
    ).toEqual([participantId, participantTwoId]);
  });

  it('rejects duplicate and unauthorized participant IDs with zero economic mutations', async () => {
    const duplicateExecutor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const duplicate = await runCommand(
      duplicateExecutor,
      createEnvelope({
        intent: { bookingId, instructorId, participantIds: [participantId, participantId] },
      })
    );
    expect(duplicate.status).toBe('error');
    expect(duplicateExecutor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(duplicateExecutor.snapshot().docs.has(`payments/${paymentId}`)).toBe(false);

    const foreignAccountId = AccountIdSchema.parse('account_booking_foreign_01');
    const unauthorizedExecutor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${foreignAccountId}`]: seedAccount(foreignAccountId),
        [`participant_management/${managementThreeId}`]: seedAdditionalManagement(
          participantThreeId,
          managementThreeId,
          foreignAccountId
        ),
      })
    );
    const unauthorized = await runCommand(
      unauthorizedExecutor,
      createEnvelope({
        intent: { bookingId, instructorId, participantIds: [participantId, participantThreeId] },
      })
    );
    expect(unauthorized.status).toBe('error');
    expect(unauthorizedExecutor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(unauthorizedExecutor.snapshot().docs.has(`payments/${paymentId}`)).toBe(false);
  });

  it('normalizes participant ordering for storage and idempotency', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const firstEnvelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'booking-order-normalized'),
      intent: { bookingId, instructorId, participantIds: [participantTwoId, participantId] },
    });
    const replayEnvelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'booking-order-normalized'),
      intent: { bookingId, instructorId, participantIds: [participantId, participantTwoId] },
    });
    expect((await runCommand(executor, firstEnvelope)).status).toBe('success');
    expect((await runCommand(executor, replayEnvelope)).status).toBe('success');
    expect(
      executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.party.participantIds
    ).toEqual([participantId, participantTwoId]);
  });

  it('applies an Admin surcharge change only to new Booking Payments', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (
        await commands.execute(
          createEnvelope({
            intent: { bookingId, instructorId, participantIds: [participantId, participantTwoId] },
          })
        )
      ).status
    ).toBe('success');
    const oldPaymentPrice = executor.snapshot().docs.get(`payments/${paymentId}`)?.data.price;
    const settingsResult = await commands.execute({
      kind: 'update_lesson_pricing_settings',
      context: {
        ...accountContext('administrator', adminAccountId, 'pricing-update-01'),
        expectedRevision: 1,
      },
      intent: {
        additionalParticipantSurchargePerHourKzt: 8_000,
        maxParticipantsPerLesson: 4,
        reasonExplanation: 'Seasonal pricing update',
      },
    } as CommandEnvelope<'update_lesson_pricing_settings'>);
    expect(settingsResult.status).toBe('success');
    const newEnvelope = createEnvelope({
      context: {
        ...accountContext('account_owner', accountId, 'booking-create-after-pricing'),
        calendarInput: { localDate: '2026-01-15', localTime: '11:00', durationMinutes: 60 },
      },
      intent: {
        bookingId: bookingTwoId,
        instructorId,
        participantIds: [participantId, participantTwoId],
      },
    });
    expect((await commands.execute(newEnvelope)).status).toBe('success');
    expect(executor.snapshot().docs.get(`payments/${paymentId}`)?.data.price).toBe(oldPaymentPrice);
    expect(
      executor.snapshot().docs.get(`payments/${paymentIdFromBookingId(bookingTwoId)}`)?.data.price
    ).toBe(20_000);
  });

  it('grandfathers an existing party after max reduction and rejects a new oversized party', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const party = [participantId, participantTwoId, participantThreeId];
    expect(
      (
        await commands.execute(
          createEnvelope({ intent: { bookingId, instructorId, participantIds: party } })
        )
      ).status
    ).toBe('success');
    const existingPaymentPrice = executor.snapshot().docs.get(`payments/${paymentId}`)?.data.price;

    expect(
      (
        await commands.execute({
          kind: 'update_lesson_pricing_settings',
          context: {
            ...accountContext('administrator', adminAccountId, 'pricing-max-reduce'),
            expectedRevision: 1,
          },
          intent: {
            additionalParticipantSurchargePerHourKzt: 6_000,
            maxParticipantsPerLesson: 2,
            reasonExplanation: 'Reduce new lesson party size',
          },
        } as CommandEnvelope<'update_lesson_pricing_settings'>)
      ).status
    ).toBe('success');

    const newBooking = createEnvelope({
      context: {
        ...accountContext('account_owner', accountId, 'booking-after-max-reduction'),
        calendarInput: { localDate: '2026-01-15', localTime: '11:00', durationMinutes: 60 },
      },
      intent: { bookingId: bookingTwoId, instructorId, participantIds: party },
    });
    const rejected = await commands.execute(newBooking);
    expect(rejected.status).toBe('error');
    expect(executor.snapshot().docs.has(`bookings/${bookingTwoId}`)).toBe(false);
    expect(executor.snapshot().docs.has(`payments/${paymentIdFromBookingId(bookingTwoId)}`)).toBe(
      false
    );
    expect(
      executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.party.participantIds
    ).toEqual(party);
    expect(executor.snapshot().docs.get(`payments/${paymentId}`)?.data.price).toBe(
      existingPaymentPrice
    );
  });
});
