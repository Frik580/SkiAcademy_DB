import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  SystemActorIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  bookingIdFromAcceptedProposal,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  systemCommandActor,
  timestampFromDate,
  accountCommandActor,
  type BookingProposal,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { createBookingProposalCommandHandlers } from './bookingProposalCommands';
import { createBookingCommandHandlers } from './bookingCommands';

const correlationId = CorrelationIdSchema.parse('correlation_proposal_cmd_01');
const accountId = AccountIdSchema.parse('account_proposal_cmd_01');
const instructorAccountId = AccountIdSchema.parse('account_proposal_instructor_01');
const participantId = ParticipantIdSchema.parse('participant_proposal_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_proposal_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_proposal_cmd_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_proposal_cmd_02');
const proposalId = BookingProposalIdSchema.parse('booking_proposal_cmd_01');
const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
const bookingId = bookingIdFromAcceptedProposal(proposalId);
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const systemActorId = SystemActorIdSchema.parse('system_proposal_cmd_01');

const calendarInput = {
  localDate: '2026-01-15',
  localTime: '09:00',
  durationMinutes: 60,
} as const;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(
  capability: 'account_owner' | 'parent_guardian' | 'instructor',
  actorAccountId = accountId,
  idempotencyKey = `idem-${Math.random().toString(36).slice(2, 10)}`
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    calendarInput,
    timezone: 'Asia/Almaty' as const,
    ...(capability === 'instructor'
      ? { transportMetadata: { instructor_id: instructorId } }
      : {}),
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
    displayName: 'Proposal Participant',
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

function seedManagement() {
  return {
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
  };
}

function seedInstructor() {
  return {
    id: instructorId,
    name: 'Coach Proposal',
    avatarUrl: 'https://example.com/avatar.png',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  };
}

function seedRelationship() {
  return {
    instructorRelationshipId: relationshipId,
    participantId,
    instructorId,
    basis: {
      kind: 'guardian_permission',
      participantManagementId: managementId,
      grantedByAccountId: accountId,
    },
    validFrom: decidedAt,
    expiresAt: instructorRelationshipExpiresAt(decidedAt),
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_relationship',
      lastChangedByCommandId: 'command_seed_relationship',
      correlationId,
    },
  };
}

function seedWallet(balance: number) {
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

function baseFixture(extra: Record<string, unknown> = {}) {
  return {
    [`users/${accountId}`]: seedAccount(),
    [`users/${instructorAccountId}`]: seedAccount(instructorAccountId),
    [`participants/${participantId}`]: seedParticipant(),
    [`participant_management/${managementId}`]: seedManagement(),
    [`instructor_relationships/${relationshipId}`]: seedRelationship(),
    [`instructors/${instructorId}`]: seedInstructor(),
    [`instructors/${instructorTwoId}`]: {
      id: instructorTwoId,
      name: 'Coach Proposal Two',
      avatarUrl: 'https://example.com/avatar-2.png',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`users/${accountId}/wallet/state`]: seedWallet(50_000),
    ...extra,
  };
}

function proposalCommands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  at = '2026-01-01T00:00:00.000Z'
) {
  return createCanonicalCommands(createBookingProposalCommandHandlers(executor), environment(at));
}

function bookingCommands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  at = '2026-01-01T00:00:00.000Z'
) {
  return createCanonicalCommands(createBookingCommandHandlers(executor), environment(at));
}

function createProposalEnvelope(
  overrides: Partial<CommandEnvelope<'create_booking_proposal'>> = {}
): CommandEnvelope<'create_booking_proposal'> {
  return {
    kind: 'create_booking_proposal',
    context: accountContext('instructor', instructorAccountId, 'proposal-create-01'),
    intent: {
      bookingProposalId: proposalId,
      instructorId,
      participantId,
    },
    ...overrides,
  };
}

function acceptProposalEnvelope(
  overrides: Partial<CommandEnvelope<'accept_booking_proposal'>> = {}
): CommandEnvelope<'accept_booking_proposal'> {
  return {
    kind: 'accept_booking_proposal',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: 'proposal-accept-01',
      correlationId,
      source: 'client_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
    },
    intent: { bookingProposalId: proposalId },
    ...overrides,
  };
}

async function createOpenProposal(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  const result = await proposalCommands(executor).execute(createProposalEnvelope());
  expect(result.status).toBe('success');
}

describe('booking proposal commands', () => {
  it('creates an open proposal without booking, payment, wallet, or claims', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const proposal = snapshot.docs.get(`booking_proposals/${proposalId}`)?.data;
    expect(proposal?.lifecycle).toEqual({ status: 'open' });
    expect(proposal?.participantId).toBe(participantId);
    expect(proposal?.instructorId).toBe(instructorId);
    expect(proposal?.proposedService?.timeZone).toBe('Asia/Almaty');
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(false);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(0);

    const identity = resolveCommandIdempotencyIdentity(createProposalEnvelope());
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
  });

  it('accepts a proposal into a fully funded instructor-origin booking', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(executor);

    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const proposal = snapshot.docs.get(`booking_proposals/${proposalId}`)?.data;
    expect(proposal?.lifecycle.status).toBe('accepted');
    expect(proposal?.lifecycle.resultingBookingId).toBe(bookingId);

    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.attribution).toEqual({
      bookingOrigin: 'instructor',
      bookedBy: { kind: 'account', accountId },
    });
    expect(booking?.lifecycle).toEqual({ status: 'confirmed' });
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(38_000);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);

    const identity = resolveCommandIdempotencyIdentity(acceptProposalEnvelope());
    expect(
      snapshot.docs.has(
        `monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`
      )
    ).toBe(true);
  });

  it('leaves the proposal open when acceptance fails for insufficient funds', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${accountId}/wallet/state`]: seedWallet(1_000),
      })
    );
    await createOpenProposal(executor);

    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('insufficient_funds');
    }

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle).toEqual({
      status: 'open',
    });
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(false);
  });

  it('marks a proposal unavailable when the instructor slot conflicts during acceptance', async () => {
    const conflictingBookingId = BookingIdSchema.parse('booking_proposal_conflict_01');
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const bookingResult = await bookingCommands(executor).execute({
      kind: 'create_confirmed_booking',
      context: accountContext('account_owner', accountId, 'conflict-booking-01'),
      intent: {
        bookingId: conflictingBookingId,
        instructorId,
        participantIds: [participantId],
      },
    });
    expect(bookingResult.status).toBe('success');

    const createResult = await proposalCommands(executor).execute(
      createProposalEnvelope({
        context: accountContext('instructor', instructorAccountId, 'proposal-create-conflict-01'),
      })
    );
    expect(createResult.status).toBe('success');

    const acceptResult = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', accountId, 'proposal-accept-conflict-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(acceptResult.status).toBe('success');

    const proposal = executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data;
    expect(proposal?.lifecycle.status).toBe('unavailable');
    expect(executor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
  });

  it('keeps the proposal open when participant acceptance hits a participant conflict', async () => {
    const conflictingBookingId = BookingIdSchema.parse('booking_proposal_participant_conflict_01');
    const instructorTwoRelationshipId = instructorRelationshipIdFromPair({
      participantId,
      instructorId: instructorTwoId,
    });
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`instructor_relationships/${instructorTwoRelationshipId}`]: {
          ...seedRelationship(),
          instructorRelationshipId: instructorTwoRelationshipId,
          instructorId: instructorTwoId,
        },
      })
    );
    const bookingResult = await bookingCommands(executor).execute({
      kind: 'create_confirmed_booking',
      context: accountContext('account_owner', accountId, 'participant-conflict-booking-01'),
      intent: {
        bookingId: conflictingBookingId,
        instructorId,
        participantIds: [participantId],
      },
    });
    expect(bookingResult.status).toBe('success');

    const createResult = await proposalCommands(executor).execute(
      createProposalEnvelope({
        context: {
          ...accountContext('instructor', instructorAccountId, 'proposal-create-participant-conflict-01'),
          transportMetadata: { instructor_id: instructorTwoId },
        },
        intent: {
          bookingProposalId: proposalId,
          instructorId: instructorTwoId,
          participantId,
        },
      })
    );
    expect(createResult.status).toBe('success');

    const acceptResult = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', accountId, 'proposal-accept-participant-conflict-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(acceptResult.status).toBe('error');
    if (acceptResult.status === 'error') {
      expect(resultErrorCode(acceptResult)).toBe('participant_conflict');
    }
    expect(executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle).toEqual({
      status: 'open',
    });
  });

  it('cancels by instructor and declines by account owner', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(executor);

    const instructorCancel = await proposalCommands(executor).execute({
      kind: 'cancel_booking_proposal',
      context: {
        ...accountContext('instructor', instructorAccountId, 'proposal-cancel-instructor-01'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingProposalId: proposalId },
    });
    expect(instructorCancel.status).toBe('success');
    expect(executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status).toBe(
      'cancelled'
    );
    expect(
      executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.reasonCode
    ).toBe('instructor_withdrawn');

    const executor2 = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(executor2);
    const ownerDecline = await proposalCommands(executor2).execute({
      kind: 'cancel_booking_proposal',
      context: {
        ...accountContext('account_owner', accountId, 'proposal-decline-owner-01'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingProposalId: proposalId },
    });
    expect(ownerDecline.status).toBe('success');
    expect(executor2.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status).toBe(
      'declined'
    );
  });

  it('expires an open proposal once the hold window has passed', async () => {
    const createdAt = timestampFromDate(new Date('2026-01-14T10:00:00.000Z'));
    const openProposal: BookingProposal = {
      proposalId,
      participantId,
      instructorId,
      proposedService: {
        interval: {
          startsAt: timestampFromDate(new Date('2026-01-15T09:00:00.000Z')),
          endsAt: timestampFromDate(new Date('2026-01-15T10:00:00.000Z')),
        },
        timeZone: 'Asia/Almaty',
      },
      lifecycle: { status: 'open' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed_proposal',
        lastChangedByCommandId: 'command_seed_proposal',
        correlationId,
      },
    };

    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`booking_proposals/${proposalId}`]: openProposal,
      })
    );

    const expireEnvelope: CommandEnvelope<'expire_booking_proposal'> = {
      kind: 'expire_booking_proposal',
      context: {
        actor: systemCommandActor(systemActorId),
        exercisedCapability: 'system',
        idempotencyKey: 'proposal-expire-01',
        correlationId,
        source: 'scheduler',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingProposalId: proposalId },
    };

    const result = await proposalCommands(executor, '2026-01-15T09:30:00.000Z').execute(expireEnvelope);
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status).toBe(
      'expired'
    );
  });
});

function resultErrorCode(result: { status: 'error'; error: { code: string } } | { status: string }) {
  return result.status === 'error' ? result.error.code : undefined;
}
