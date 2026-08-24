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
const managementId = ParticipantManagementIdSchema.parse('management_booking_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_booking_cmd_01');
const bookingId = BookingIdSchema.parse('booking_booking_cmd_01');
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
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
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

function baseFixture(extra: Record<string, unknown> = {}) {
  return {
    [`users/${accountId}`]: seedAccount(),
    [`users/${adminAccountId}`]: seedAccount(adminAccountId),
    [`participants/${participantId}`]: seedParticipant(),
    [`participant_management/${managementId}`]: seedManagement(),
    [`instructors/${instructorId}`]: seedInstructor(),
    [`users/${accountId}/wallet/state`]: seedWallet(50_000),
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
    expect(booking?.occurrence?.occurrenceId).toBe(initialBookingOccurrenceIdFromBookingId(bookingId));
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(38_000);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
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
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.attribution.bookingOrigin).toBe(
      'admin'
    );
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
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });
});
