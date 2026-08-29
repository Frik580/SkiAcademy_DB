import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  WalletSchema,
  accountCommandActor,
  participantManagementIdFromSelfProvisioning,
  selfParticipantIdFromAccountId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_wallet_funding_source');
const accountId = AccountIdSchema.parse('account_wallet_funding_source');
const instructorId = InstructorIdSchema.parse('instructor_wallet_funding_source');
const bookingId = BookingIdSchema.parse('booking_wallet_funding_source');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const selfParticipantId = selfParticipantIdFromAccountId(accountId);
const selfManagementId = participantManagementIdFromSelfProvisioning(accountId);

const BOOKING_PRICE_KZT = 12_000;
const CANONICAL_WALLET_BALANCE_KZT = 50_000;
const LEGACY_DISPLAYED_KZT = 500_000;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function legacyProfileFixture(extra: Record<string, unknown> = {}) {
  const canonicalAccount = AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  return {
    ...canonicalAccount,
    uid: accountId,
    email: 'wallet-source@example.com',
    displayName: 'Wallet Source Client',
    role: 'user',
    isClientActive: true,
    balanceUSD: 250,
    walletBalances: { USD: 250, KZT: LEGACY_DISPLAYED_KZT },
    ...extra,
  };
}

function seedInstructor() {
  return {
    id: instructorId,
    name: 'Wallet Source Instructor',
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  };
}

function seedCanonicalWallet(balance: number) {
  return WalletSchema.parse({
    accountId,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function bookingEnvelope(idempotencyKey: string): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId,
      instructorId,
      participantIds: [selfParticipantIdFromAccountId(accountId)],
    },
  };
}

function provisionEnvelope(idempotencyKey: string): CommandEnvelope<'provision_self_participant'> {
  return {
    kind: 'provision_self_participant',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
    },
    intent: {},
  };
}

describe('authenticated booking wallet funding source', () => {
  it('rejects booking when legacy walletBalances.KZT is funded but canonical wallet is missing', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: legacyProfileFixture(),
      [`instructors/${instructorId}`]: seedInstructor(),
      [`participants/${selfParticipantId}`]: {
        participantId: selfParticipantId,
        displayName: 'Wallet Source Client',
        age: { kind: 'age_years', years: 18 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: selfManagementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'seed',
          lastChangedByCommandId: 'seed',
          correlationId,
        },
      },
      [`participant_management/${selfManagementId}`]: {
        participantManagementId: selfManagementId,
        participantId: selfParticipantId,
        accountId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'seed',
          lastChangedByCommandId: 'seed',
          correlationId,
        },
      },
      [`participant_management_active_owner/${selfParticipantId}`]: {
        participantId: selfParticipantId,
        accountId,
        participantManagementId: selfManagementId,
        managementRevision: 1,
        updatedAt: decidedAt,
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);

    const result = await commands.execute(bookingEnvelope('booking-legacy-kzt-only'));

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('insufficient_funds');
    }
    expect(executor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(executor.snapshot().docs.has(`users/${accountId}/wallet/state`)).toBe(false);
  });

  it('provisions self participant and books lesson when canonical wallet is funded', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: legacyProfileFixture({ walletBalances: { USD: 250, KZT: 0 } }),
      [`users/${accountId}/wallet/state`]: seedCanonicalWallet(CANONICAL_WALLET_BALANCE_KZT),
      [`instructors/${instructorId}`]: seedInstructor(),
    });
    const commands = createProductionCanonicalCommands(environment(), executor);

    const provisioned = await commands.execute(provisionEnvelope('provision-self-wallet-source'));
    expect(provisioned.status).toBe('success');

    const booked = await commands.execute(bookingEnvelope('booking-canonical-wallet-funded'));
    expect(booked.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      CANONICAL_WALLET_BALANCE_KZT - BOOKING_PRICE_KZT
    );
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(true);
    expect(snapshot.docs.get(`participants/${selfParticipantId}`)?.data.displayName).toBe(
      'Wallet Source Client'
    );
  });
});
