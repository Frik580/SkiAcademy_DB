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
  INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  activityLogIdFromCommandId,
  calculateFamilyGroupBookingPriceKzt,
  incrementalRequirementIdFromPartyAddition,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  canonicalTimestampToEpochMs,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  KztMinorUnitsSchema,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor, type CanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_party_cmd_01');
const accountId = AccountIdSchema.parse('account_party_cmd_01');
const unrelatedAccountId = AccountIdSchema.parse('account_party_unrelated_01');
const adminAccountId = AccountIdSchema.parse('account_party_admin_01');
const participantId = ParticipantIdSchema.parse('participant_party_cmd_01');
const participantTwoId = ParticipantIdSchema.parse('participant_party_cmd_02');
const managementId = ParticipantManagementIdSchema.parse('management_party_cmd_01');
const managementTwoId = ParticipantManagementIdSchema.parse('management_party_cmd_02');
const instructorId = InstructorIdSchema.parse('instructor_party_cmd_01');
const bookingId = BookingIdSchema.parse('booking_party_cmd_01');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

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
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput: {
      localDate: '2026-01-15',
      localTime: '09:00',
      durationMinutes: 60,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function seedBase(walletBalance = 50_000) {
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
    [`users/${unrelatedAccountId}`]: AccountSchema.parse({
      accountId: unrelatedAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_unrelated',
        lastChangedByCommandId: 'command_seed_unrelated',
        correlationId,
      },
    }),
    [`participants/${participantId}`]: {
      participantId,
      displayName: 'Party Participant One',
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
    [`participants/${participantTwoId}`]: {
      participantId: participantTwoId,
      displayName: 'Party Participant Two',
      age: { kind: 'age_years', years: 18 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementTwoId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_participant_two',
        lastChangedByCommandId: 'command_seed_participant_two',
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
    [`participant_management/${managementTwoId}`]: {
      participantManagementId: managementTwoId,
      participantId: participantTwoId,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_management_two',
        lastChangedByCommandId: 'command_seed_management_two',
        correlationId,
      },
    },
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Coach Party',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`users/${accountId}/wallet/state`]: WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: walletBalance,
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

function createAbortFirstTransactionCallbackExecutor(
  inner: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
): CanonicalTransactionExecutor & {
  snapshot: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>['snapshot'];
} {
  let callbackInvocations = 0;
  return {
    snapshot: () => inner.snapshot(),
    async runAtomic(input) {
      return inner.runAtomic({
        ...input,
        run: async (session) => {
          callbackInvocations += 1;
          const result = await input.run(session);
          if (callbackInvocations === 1) {
            throw new Error('TRANSACTION_ABORTED');
          }
          return result;
        },
      });
    },
  };
}

async function createConfirmedBooking(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  const commands = createProductionCanonicalCommands(environment('2026-01-01T00:00:00.000Z'), executor);
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: accountContext('account_owner', accountId, 'create-booking-party-01'),
    intent: { bookingId, instructorId, participantIds: [participantId] },
  });
  expect(result.status).toBe('success');
}

function partyEnvelope(
  input: {
    idempotencyKey: string;
    capability?: 'account_owner' | 'administrator';
    actorAccountId?: typeof accountId | typeof adminAccountId;
    expectedRevision?: number;
    participantIdsToAdd?: (typeof participantId | typeof participantTwoId)[];
    participantIdsToRemove?: (typeof participantId | typeof participantTwoId)[];
    refundPercentBasisPoints?: number;
    reasonExplanation?: string;
  }
): CommandEnvelope<'change_booking_party'> {
  return {
    kind: 'change_booking_party',
    context: accountContext(
      input.capability ?? 'account_owner',
      input.actorAccountId ?? (input.capability === 'administrator' ? adminAccountId : accountId),
      input.idempotencyKey,
      input.expectedRevision ?? 1
    ),
    intent: {
      bookingId,
      ...(input.participantIdsToAdd ? { participantIdsToAdd: input.participantIdsToAdd } : {}),
      ...(input.participantIdsToRemove ? { participantIdsToRemove: input.participantIdsToRemove } : {}),
      ...(input.refundPercentBasisPoints !== undefined
        ? { refundPercentBasisPoints: input.refundPercentBasisPoints }
        : {}),
      ...(input.reasonExplanation ? { reasonExplanation: input.reasonExplanation } : {}),
    },
  };
}

describe('booking party commands', () => {
  it('self-service add >=24h funds full tariff delta and acquires participant claim', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const envelope = partyEnvelope({
      idempotencyKey: 'party-add-01',
      participantIdsToAdd: [participantTwoId],
    });
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.party.participantIds).toEqual([participantId, participantTwoId]);
    expect(booking?.party.kind).toBe('family_group');
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(18_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(32_000);
    const identity = resolveCommandIdempotencyIdentity(envelope);
    const requirementId = incrementalRequirementIdFromPartyAddition({
      commandId: identity.commandKey,
      participantId: participantTwoId,
    });
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.incrementalRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          incrementalRequirementId: requirementId,
          participantId: participantTwoId,
          requiredPriceDelta: 6_000,
          state: 'fully_funded',
        }),
      ])
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(3);
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
    expect(booking?.attribution.bookingOrigin).toBe('account');
  });

  it('rejects self-service add with insufficient wallet funds without mutation', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase(17_000));
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const result = await commands.execute(
      partyEnvelope({ idempotencyKey: 'party-add-insufficient', participantIdsToAdd: [participantTwoId] })
    );
    expect(result.status).toBe('error');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.party.participantIds).toEqual([participantId]);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(12_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(5_000);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });

  it('self-service remove >=24h refunds full tariff difference', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    let commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    await commands.execute(
      partyEnvelope({ idempotencyKey: 'party-add-for-remove', participantIdsToAdd: [participantTwoId] })
    );
    const walletAfterAdd = executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data.balance;
    commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const removeEnvelope = partyEnvelope({
      idempotencyKey: 'party-remove-01',
      participantIdsToRemove: [participantTwoId],
      expectedRevision: 2,
    });
    const result = await commands.execute(removeEnvelope);
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.party.participantIds).toEqual([participantId]);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(12_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(walletAfterAdd + 6_000);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.settledAmount).toBe(12_000);
  });

  it('rejects self-service party change inside 24h', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-14T09:00:01.000Z'), executor);
    const result = await commands.execute(
      partyEnvelope({ idempotencyKey: 'party-late-client', participantIdsToAdd: [participantTwoId] })
    );
    expect(result.status).toBe('error');
  });

  it('allows admin late add with partial wallet funding and incremental requirement', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase(16_000));
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-14T09:00:01.000Z'), executor);
    const envelope = partyEnvelope({
      idempotencyKey: 'party-admin-late-add',
      capability: 'administrator',
      participantIdsToAdd: [participantTwoId],
      reasonExplanation: 'Late family addition approved',
    });
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.party.participantIds).toEqual([
      participantId,
      participantTwoId,
    ]);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(18_000);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.outstandingAmount).toBe(2_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(0);
  });

  it('rolls back only unpaid added participant at service start', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase(16_000));
    await createConfirmedBooking(executor);
    let commands = createProductionCanonicalCommands(environment('2026-01-14T09:00:01.000Z'), executor);
    await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-admin-late-add-rollback',
        capability: 'administrator',
        participantIdsToAdd: [participantTwoId],
        reasonExplanation: 'Late family addition approved',
      })
    );
    commands = createProductionCanonicalCommands(environment('2026-01-15T09:00:00.000Z'), executor);
    const rollbackEnvelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'> = {
      kind: 'rollback_unpaid_booking_party_additions',
      context: {
        actor: systemCommandActor('scheduler_party_rollback'),
        exercisedCapability: 'system',
        idempotencyKey: 'rollback-unpaid-01',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    };
    const result = await commands.execute(rollbackEnvelope);
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.party.participantIds).toEqual([participantId]);
    expect(booking?.lifecycle.status).toBe('confirmed');
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.price).toBe(12_000);
    expect(booking?.occurrence.serviceParty.frozenAt).toBeDefined();
    expect(
      snapshot.docs
        .get(`payments/${paymentId}`)
        ?.data.incrementalRequirements.every(
          (requirement: { state: string }) => requirement.state === 'rolled_back'
        )
    ).toBe(true);
  });

  it('rejects self-service party change from unrelated account', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const result = await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-unauthorized',
        actorAccountId: unrelatedAccountId,
        participantIdsToAdd: [participantTwoId],
      })
    );
    expect(result.status).toBe('error');
  });

  it('freezes service party when rollback finds no unpaid additions', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const commands = createProductionCanonicalCommands(environment('2026-01-15T09:00:00.000Z'), executor);
    const rollbackEnvelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'> = {
      kind: 'rollback_unpaid_booking_party_additions',
      context: {
        actor: systemCommandActor('scheduler_party_rollback'),
        exercisedCapability: 'system',
        idempotencyKey: 'rollback-freeze-only-unit',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    };
    const result = await commands.execute(rollbackEnvelope);
    expect(result.status).toBe('success');
    const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.party.participantIds).toEqual([participantId]);
    expect(booking?.occurrence.serviceParty.frozenAt).toBeDefined();
    expect(executor.snapshot().docs.get(`payments/${paymentId}`)?.data.price).toBe(12_000);
  });

  it('does not duplicate participant claim creates when transaction callback is retried', async () => {
    const inner = createInMemoryCanonicalTransactionExecutor(seedBase(), { simulateRetry: true });
    const executor = createAbortFirstTransactionCallbackExecutor(inner);
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    const result = await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-retry-claim-safe',
        participantIdsToAdd: [participantTwoId],
      })
    );
    expect(result.status).toBe('success');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(3);
  });

  it('replays successful party add without duplicate refund or claim', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedBase());
    await createConfirmedBooking(executor);
    const startsAt = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.occurrence.interval
      .startsAt;
    const requestAt = addMillisecondsToCanonicalTimestamp(
      startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const envelope = partyEnvelope({
      idempotencyKey: 'party-replay-add',
      participantIdsToAdd: [participantTwoId],
    });
    const commands = createProductionCanonicalCommands(environment(isoFromTimestamp(requestAt)), executor);
    await commands.execute(envelope);
    const walletAfterFirst = executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data.balance;
    const replay = await commands.execute(envelope);
    expect(replay.status).toBe('success');
    expect(executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      walletAfterFirst
    );
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(2);
  });
});

describe('family group tariff command expectations', () => {
  it('uses nonlinear tariff not individual times count', () => {
    const individual = KztMinorUnitsSchema.parse(12_000);
    expect(calculateFamilyGroupBookingPriceKzt(individual, 2)).not.toBe(24_000);
    expect(calculateFamilyGroupBookingPriceKzt(individual, 2)).toBe(18_000);
  });
});
