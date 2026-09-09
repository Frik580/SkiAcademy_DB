import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  BookingSchema,
  BookingProposalIdSchema,
  CorrelationIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
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
  accountActorRef,
  guestActorRef,
  type Booking,
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
const participantTwoId = ParticipantIdSchema.parse('participant_proposal_cmd_02');
const participantThreeId = ParticipantIdSchema.parse('participant_proposal_cmd_03');
const outsiderParticipantId = ParticipantIdSchema.parse('participant_proposal_cmd_outsider');
const outsiderAccountId = AccountIdSchema.parse('account_proposal_outsider_01');
const managementId = ParticipantManagementIdSchema.parse('management_proposal_cmd_01');
const managementTwoId = ParticipantManagementIdSchema.parse('management_proposal_cmd_02');
const managementThreeId = ParticipantManagementIdSchema.parse('management_proposal_cmd_03');
const outsiderManagementId = ParticipantManagementIdSchema.parse('management_proposal_cmd_outsider');
const instructorId = InstructorIdSchema.parse('instructor_proposal_cmd_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_proposal_cmd_02');
const proposalId = BookingProposalIdSchema.parse('booking_proposal_cmd_01');
const proposalIdB = BookingProposalIdSchema.parse('booking_proposal_cmd_02');
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
    ...(capability === 'instructor' ? { transportMetadata: { instructor_id: instructorId } } : {}),
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

const evidenceOccurrenceId = OccurrenceIdSchema.parse('occurrence_proposal_evidence_01');
const evidenceGuestSubjectId = GuestSubjectIdSchema.parse('guest_subject_proposal_evidence_01');
const evidenceStartsAt = timestampFromDate(new Date('2025-12-01T09:00:00.000Z'));
const evidenceEndsAt = timestampFromDate(new Date('2025-12-01T10:00:00.000Z'));

function seedEvidenceBooking(input: {
  readonly bookingId: ReturnType<typeof BookingIdSchema.parse>;
  readonly instructorId?: typeof instructorId;
  readonly participantIds?: readonly (typeof participantId)[];
  readonly lifecycle: Booking['lifecycle'];
  readonly bookingOrigin?: 'account' | 'guest';
  readonly archival?: Booking['archival'];
}) {
  const participantIds = input.participantIds ?? [participantId];
  const instructor = input.instructorId ?? instructorId;
  return BookingSchema.parse({
    bookingId: input.bookingId,
    attribution: {
      bookingOrigin: input.bookingOrigin ?? (input.lifecycle.status === 'pending' ? 'guest' : 'account'),
      bookedBy:
        input.bookingOrigin === 'guest' || input.lifecycle.status === 'pending'
          ? guestActorRef(evidenceGuestSubjectId)
          : accountActorRef(accountId),
    },
    party: {
      kind: participantIds.length > 1 ? 'family_group' : 'individual',
      participantIds: [...participantIds],
    },
    occurrence: {
      occurrenceId: evidenceOccurrenceId,
      instructorId: instructor,
      interval: { startsAt: evidenceStartsAt, endsAt: evidenceEndsAt },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [...participantIds], frozenAt: evidenceStartsAt },
    },
    lifecycle: input.lifecycle,
    paymentId: paymentIdFromBookingId(input.bookingId),
    ...(input.archival ? { archival: input.archival } : {}),
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_evidence_booking',
      lastChangedByCommandId: 'command_seed_evidence_booking',
      correlationId,
    },
  });
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
    'lesson_pricing_settings/lesson_booking': {
      settingsId: 'lesson_booking',
      additionalParticipantSurchargePerHourKzt: 6_000,
      maxParticipantsPerLesson: 4,
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

function fixtureWithoutRelationship(extra: Record<string, unknown> = {}) {
  const { [`instructor_relationships/${relationshipId}`]: _removed, ...rest } = baseFixture(extra);
  return rest;
}

function seedManagedParticipantTwo() {
  return {
    [`participants/${participantTwoId}`]: {
      ...seedParticipant(),
      participantId: participantTwoId,
      displayName: 'Proposal Participant Two',
      management: { kind: 'managed', participantManagementId: managementTwoId },
    },
    [`participant_management/${managementTwoId}`]: {
      ...seedManagement(),
      participantManagementId: managementTwoId,
      participantId: participantTwoId,
    },
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

function createAbortFirstTransactionCallbackExecutor(
  inner: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>
) {
  let callbackInvocations = 0;
  return {
    snapshot: () => inner.snapshot(),
    async runAtomic(input: Parameters<typeof inner.runAtomic>[0]) {
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

function createProposalEnvelope(
  overrides: Partial<CommandEnvelope<'create_booking_proposal'>> = {}
): CommandEnvelope<'create_booking_proposal'> {
  return {
    kind: 'create_booking_proposal',
    context: accountContext('instructor', instructorAccountId, 'proposal-create-01'),
    intent: {
      bookingProposalId: proposalId,
      instructorId,
      participantIds: [participantId],
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
    expect(proposal?.participantIds).toEqual([participantId]);
    expect(proposal?.instructorId).toBe(instructorId);
    expect(proposal?.proposedService?.timeZone).toBe('Asia/Almaty');
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(false);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(0);

    const identity = resolveCommandIdempotencyIdentity(createProposalEnvelope());
    expect(
      snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
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
          ...accountContext(
            'instructor',
            instructorAccountId,
            'proposal-create-participant-conflict-01'
          ),
          transportMetadata: { instructor_id: instructorTwoId },
        },
        intent: {
          bookingProposalId: proposalId,
          instructorId: instructorTwoId,
          participantIds: [participantId],
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
    expect(executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle).toEqual(
      {
        status: 'open',
      }
    );
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
    expect(
      executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status
    ).toBe('cancelled');
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
    expect(
      executor2.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status
    ).toBe('declined');
  });

  it('expires an open proposal once the hold window has passed', async () => {
    const createdAt = timestampFromDate(new Date('2026-01-14T10:00:00.000Z'));
    const openProposal: BookingProposal = {
      proposalId,
      participantIds: [participantId],
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

    const result = await proposalCommands(executor, '2026-01-15T09:30:00.000Z').execute(
      expireEnvelope
    );
    expect(result.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status
    ).toBe('expired');
  });

  it('does not duplicate booking creates when accept transaction callback is retried', async () => {
    const inner = createInMemoryCanonicalTransactionExecutor(baseFixture(), {
      simulateRetry: true,
    });
    const executor = createAbortFirstTransactionCallbackExecutor(inner);
    await createOpenProposal(inner);
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('success');
    expect(inner.snapshot().docs.has(`bookings/${bookingId}`)).toBe(true);
    expect(inner.snapshot().docs.has(`payments/${paymentId}`)).toBe(true);
    expect(
      [...inner.snapshot().docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);
    expect(
      [...inner.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });

  it('accepts a proposal for a self participant with account_owner', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(executor);
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('success');
  });

  it('accepts a proposal for a managed child with parent_guardian', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participant_management/${managementId}`]: {
          ...seedManagement(),
          authority: 'parent_guardian',
        },
      })
    );
    await createOpenProposal(executor);
    const result = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('parent_guardian', accountId, 'proposal-accept-parent-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(result.status).toBe('success');
  });

  it('forbids accept_booking_proposal when exercisedCapability does not match authority', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participant_management/${managementId}`]: {
          ...seedManagement(),
          authority: 'parent_guardian',
        },
      })
    );
    await createOpenProposal(executor);
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
      expect(result.error.details).not.toEqual({ resourceKind: 'participant', reason: 'conflict' });
    }
  });

  it('forbids an unrelated account from accepting a proposal', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(executor);
    const result = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', instructorAccountId, 'proposal-accept-unrelated-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('rejects accept_booking_proposal when expectedRevision is stale', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(executor);
    const result = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', accountId, 'proposal-accept-stale-01'),
          expectedRevision: AggregateRevisionSchema.parse(99),
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
    }
  });

  it('accepts a proposal created from Booking evidence without creating a relationship', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_accept_evidence_01');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          lifecycle: { status: 'confirmed' },
        }),
      })
    );
    const createResult = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(createResult.status).toBe('success');
    const result = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', accountId, 'proposal-accept-evidence-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`instructor_relationships/${relationshipId}`)).toBe(false);
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(true);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);
  });

  it('forbids accept_booking_proposal without relationship or qualifying Booking evidence', async () => {
    const seeded = createInMemoryCanonicalTransactionExecutor(baseFixture());
    await createOpenProposal(seeded);
    const docs = Object.fromEntries(
      [...seeded.snapshot().docs.entries()]
        .filter(([path]) => path !== `instructor_relationships/${relationshipId}`)
        .map(([path, doc]) => [path, doc.data])
    );
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const result = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', accountId, 'proposal-accept-no-standing-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
      expect(result.error.details).toEqual({ resourceKind: 'participant', reason: 'conflict' });
    }
  });

  it('creates a proposal from an active instructor_relationship without booking evidence', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.has(`instructor_relationships/${relationshipId}`)).toBe(true);
  });

  it.each([
    ['confirmed', { status: 'confirmed' as const }],
    ['completed', { status: 'completed' as const, completedAt: decidedAt }],
    ['no_show', { status: 'no_show' as const, noShowAt: decidedAt }],
  ] as const)(
    'creates a proposal from %s Booking evidence without creating a relationship',
    async (_label, lifecycle) => {
      const evidenceBookingId = BookingIdSchema.parse(`booking_proposal_evidence_${_label}`);
      const executor = createInMemoryCanonicalTransactionExecutor(
        fixtureWithoutRelationship({
          [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
            bookingId: evidenceBookingId,
            lifecycle,
          }),
        })
      );
      const result = await proposalCommands(executor).execute(createProposalEnvelope());
      expect(result.status).toBe('success');
      expect(executor.snapshot().docs.has(`instructor_relationships/${relationshipId}`)).toBe(false);
      expect(
        [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('resource_claims/'))
          .length
      ).toBe(0);
    }
  );

  it('forbids create_booking_proposal when the only Booking is pending', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_evidence_pending');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          lifecycle: {
            status: 'pending',
            reservationExpiresAt: timestampFromDate(new Date('2026-01-01T01:00:00.000Z')),
          },
        }),
      })
    );
    const result = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
      expect(result.error.details).toEqual({ resourceKind: 'participant', reason: 'conflict' });
    }
  });

  it('forbids create_booking_proposal when the only Booking is cancelled', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_evidence_cancelled');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          lifecycle: {
            status: 'cancelled',
            cancelledAt: decidedAt,
            reasonCode: 'account_owner_cancelled',
          },
        }),
      })
    );
    const result = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('forbids an unrelated instructor even when another instructor has qualifying Booking evidence', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_evidence_other_instructor');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          instructorId,
          lifecycle: { status: 'confirmed' },
        }),
      })
    );
    const result = await proposalCommands(executor).execute(
      createProposalEnvelope({
        context: {
          ...accountContext('instructor', instructorAccountId, 'proposal-unrelated-01'),
          transportMetadata: { instructor_id: instructorTwoId },
        },
        intent: {
          bookingProposalId: proposalId,
          instructorId: instructorTwoId,
          participantIds: [participantId],
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('forbids create_booking_proposal when the participant is not in the Booking party', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_evidence_outsider');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          participantIds: [outsiderParticipantId],
          lifecycle: { status: 'confirmed' },
        }),
      })
    );
    const result = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('creates a proposal for a party member of a multi-participant Booking', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_evidence_family');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        ...seedManagedParticipantTwo(),
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          participantIds: [participantId, participantTwoId],
          lifecycle: { status: 'confirmed' },
        }),
      })
    );
    const result = await proposalCommands(executor).execute(createProposalEnvelope());
    expect(result.status).toBe('success');

    const resultTwo = await proposalCommands(executor).execute(
      createProposalEnvelope({
        context: accountContext('instructor', instructorAccountId, 'proposal-create-party-02'),
        intent: {
          bookingProposalId: proposalIdB,
          instructorId,
          participantIds: [participantTwoId],
        },
      })
    );
    expect(resultTwo.status).toBe('success');
  });
});

function relationshipFor(targetParticipantId: typeof participantId) {
  const relationshipIdForPair = instructorRelationshipIdFromPair({
    participantId: targetParticipantId,
    instructorId,
  });
  return {
    [`instructor_relationships/${relationshipIdForPair}`]: {
      ...seedRelationship(),
      instructorRelationshipId: relationshipIdForPair,
      participantId: targetParticipantId,
    },
  };
}

function seedManagedParticipantThree() {
  return {
    [`participants/${participantThreeId}`]: {
      ...seedParticipant(),
      participantId: participantThreeId,
      displayName: 'Proposal Participant Three',
      management: { kind: 'managed', participantManagementId: managementThreeId },
    },
    [`participant_management/${managementThreeId}`]: {
      ...seedManagement(),
      participantManagementId: managementThreeId,
      participantId: participantThreeId,
    },
  };
}

function threePartyFixture(extra: Record<string, unknown> = {}) {
  return baseFixture({
    ...seedManagedParticipantTwo(),
    ...seedManagedParticipantThree(),
    ...relationshipFor(participantTwoId),
    ...relationshipFor(participantThreeId),
    ...extra,
  });
}

function createPartyProposalEnvelope(
  participantIds: readonly (typeof participantId)[],
  overrides: Partial<CommandEnvelope<'create_booking_proposal'>> = {}
): CommandEnvelope<'create_booking_proposal'> {
  return createProposalEnvelope({
    ...overrides,
    intent: {
      bookingProposalId: proposalId,
      instructorId,
      participantIds: [...participantIds],
      ...overrides.intent,
    },
  });
}

describe('multi-participant booking proposal commands', () => {
  it('creates one proposal for three participants without booking, payment, or claims', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(threePartyFixture());
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId, participantThreeId])
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    const proposalDocs = [...snapshot.docs.keys()].filter((path) =>
      path.startsWith('booking_proposals/')
    );
    expect(proposalDocs).toEqual([`booking_proposals/${proposalId}`]);
    expect(snapshot.docs.get(`booking_proposals/${proposalId}`)?.data.participantIds).toEqual([
      participantId,
      participantTwoId,
      participantThreeId,
    ]);
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(false);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(0);
  });

  it('rejects duplicate participantIds on create', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantId])
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
  });

  it('rejects create when the party exceeds current maxParticipantsPerLesson', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      threePartyFixture({
        'lesson_pricing_settings/lesson_booking': {
          settingsId: 'lesson_booking',
          additionalParticipantSurchargePerHourKzt: 6_000,
          maxParticipantsPerLesson: 2,
          revision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: 'command_seed_pricing',
            lastChangedByCommandId: 'command_seed_pricing',
            correlationId,
          },
        },
      })
    );
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId, participantThreeId])
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
  });

  it('creates a proposal when the instructor has authority on every participant', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(threePartyFixture());
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId, participantThreeId])
    );
    expect(result.status).toBe('success');
  });

  it('forbids the whole create when authority is missing for one participant', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        ...seedManagedParticipantTwo(),
      })
    );
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId])
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
    expect(executor.snapshot().docs.has(`booking_proposals/${proposalId}`)).toBe(false);
  });

  it('creates a multi-participant proposal from relationship authority', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        ...seedManagedParticipantTwo(),
        ...relationshipFor(participantTwoId),
      })
    );
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId])
    );
    expect(result.status).toBe('success');
  });

  it('creates a multi-participant proposal from booking-scoped evidence', async () => {
    const evidenceBookingId = BookingIdSchema.parse('booking_proposal_party_evidence_01');
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixtureWithoutRelationship({
        ...seedManagedParticipantTwo(),
        [`bookings/${evidenceBookingId}`]: seedEvidenceBooking({
          bookingId: evidenceBookingId,
          participantIds: [participantId, participantTwoId],
          lifecycle: { status: 'confirmed' },
        }),
      })
    );
    const result = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId])
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.has(`instructor_relationships/${relationshipId}`)).toBe(false);
  });

  it('accepts a party when the client manages every participant', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(threePartyFixture());
    const createResult = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId, participantThreeId])
    );
    expect(createResult.status).toBe('success');
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('success');
  });

  it('forbids accept when the client does not manage one participant', async () => {
    const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participants/${participantTwoId}`]: {
          ...seedParticipant(),
          participantId: participantTwoId,
          displayName: 'Outsider Party Member',
          management: { kind: 'managed', participantManagementId: outsiderManagementId },
        },
        [`participant_management/${outsiderManagementId}`]: {
          ...seedManagement(),
          participantManagementId: outsiderManagementId,
          participantId: participantTwoId,
          accountId: outsiderAccountId,
        },
        [`users/${outsiderAccountId}`]: seedAccount(outsiderAccountId),
        ...relationshipFor(participantTwoId),
        [`booking_proposals/${proposalId}`]: {
          proposalId,
          participantIds: [participantId, participantTwoId],
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
            createdByCommandId: 'command_seed_mixed_party_proposal',
            lastChangedByCommandId: 'command_seed_mixed_party_proposal',
            correlationId,
          },
        },
      })
    );
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
    expect(executor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
  });

  it('accepts a multi-participant proposal into one Booking, one Payment, one instructor claim and N participant claims', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(threePartyFixture());
    await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId, participantThreeId])
    );
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(true);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    const claims = [...snapshot.docs.entries()]
      .filter(([path]) => path.startsWith('resource_claims/'))
      .map(([, doc]) => doc.data);
    expect(claims).toHaveLength(4);
    expect(claims.filter((claim) => claim.claimKind === 'instructor_booking_occurrence')).toHaveLength(
      1
    );
    expect(
      claims.filter((claim) => claim.claimKind === 'participant_booking_occurrence')
    ).toHaveLength(3);
  });

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
    'prices %i participants × %i minutes at %i KZT',
    async (participantCount, durationMinutes, expectedTotal) => {
      const party = [participantId, participantTwoId, participantThreeId].slice(0, participantCount);
      const executor = createInMemoryCanonicalTransactionExecutor(threePartyFixture());
      const createResult = await proposalCommands(executor).execute(
        createPartyProposalEnvelope(party, {
          context: {
            ...accountContext('instructor', instructorAccountId, `proposal-price-${participantCount}-${durationMinutes}`),
            calendarInput: {
              localDate: '2026-01-15',
              localTime: '09:00',
              durationMinutes,
            },
          },
          intent: {
            bookingProposalId: proposalId,
            instructorId,
            participantIds: [...party],
          },
        })
      );
      expect(createResult.status).toBe('success');
      const result = await proposalCommands(executor).execute(
        acceptProposalEnvelope({
          context: {
            ...accountContext(
              'account_owner',
              accountId,
              `proposal-accept-price-${participantCount}-${durationMinutes}`
            ),
            expectedRevision: AggregateRevisionSchema.parse(1),
          },
        })
      );
      expect(result.status).toBe('success');
      const booking = executor.snapshot().docs.get(`bookings/${bookingId}`)?.data;
      expect(booking?.pricingSnapshot).toEqual({
        strategyVersion: 'lesson_party:v1',
        baseLessonPriceKzt: Math.round((12_000 * durationMinutes) / 60),
        additionalParticipantSurchargePerHourKzt: 6_000,
        settingsRevision: 1,
        lessonDurationMinutes: durationMinutes,
        participantCount,
        totalPriceKzt: expectedTotal,
      });
    }
  );

  it('fails the whole accept atomically when one party member has a participant conflict', async () => {
    const conflictingBookingId = BookingIdSchema.parse('booking_proposal_party_member_conflict_01');
    const executor = createInMemoryCanonicalTransactionExecutor(
      threePartyFixture()
    );
    const bookingResult = await bookingCommands(executor).execute({
      kind: 'create_confirmed_booking',
      context: accountContext('account_owner', accountId, 'party-member-conflict-booking-01'),
      intent: {
        bookingId: conflictingBookingId,
        instructorId: instructorTwoId,
        participantIds: [participantTwoId],
      },
    });
    expect(bookingResult.status).toBe('success');
    const createResult = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId, participantThreeId], {
        context: accountContext('instructor', instructorAccountId, 'proposal-create-party-conflict-01'),
      })
    );
    expect(createResult.status).toBe('success');
    const acceptResult = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext('account_owner', accountId, 'proposal-accept-party-conflict-01'),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(acceptResult.status).toBe('error');
    if (acceptResult.status === 'error') {
      expect(acceptResult.error.code).toBe('participant_conflict');
    }
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle).toEqual({
      status: 'open',
    });
    expect(snapshot.docs.has(`bookings/${bookingId}`)).toBe(false);
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(false);
  });

  it('marks a multi-participant proposal unavailable when the instructor slot conflicts', async () => {
    const conflictingBookingId = BookingIdSchema.parse('booking_proposal_party_instructor_conflict_01');
    const executor = createInMemoryCanonicalTransactionExecutor(threePartyFixture());
    const bookingResult = await bookingCommands(executor).execute({
      kind: 'create_confirmed_booking',
      context: accountContext('account_owner', accountId, 'party-instructor-conflict-booking-01'),
      intent: {
        bookingId: conflictingBookingId,
        instructorId,
        participantIds: [participantId],
      },
    });
    expect(bookingResult.status).toBe('success');
    const createResult = await proposalCommands(executor).execute(
      createPartyProposalEnvelope([participantId, participantTwoId], {
        context: accountContext(
          'instructor',
          instructorAccountId,
          'proposal-create-party-instructor-conflict-01'
        ),
      })
    );
    expect(createResult.status).toBe('success');
    const acceptResult = await proposalCommands(executor).execute(
      acceptProposalEnvelope({
        context: {
          ...accountContext(
            'account_owner',
            accountId,
            'proposal-accept-party-instructor-conflict-01'
          ),
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(acceptResult.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`booking_proposals/${proposalId}`)?.data.lifecycle.status
    ).toBe('unavailable');
    expect(executor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(false);
  });

  it('accepts a legacy single-participant Proposal stored with participantId', async () => {
    const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`booking_proposals/${proposalId}`]: {
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
            createdByCommandId: 'command_seed_legacy_proposal',
            lastChangedByCommandId: 'command_seed_legacy_proposal',
            correlationId,
          },
        },
      })
    );
    const result = await proposalCommands(executor).execute(acceptProposalEnvelope());
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.has(`bookings/${bookingId}`)).toBe(true);
    expect(executor.snapshot().docs.has(`payments/${paymentId}`)).toBe(true);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('resource_claims/'))
        .length
    ).toBe(2);
  });
});

function resultErrorCode(
  result: { status: 'error'; error: { code: string } } | { status: string }
) {
  return result.status === 'error' ? result.error.code : undefined;
}
