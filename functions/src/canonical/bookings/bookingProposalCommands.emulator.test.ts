import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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
  accountCommandActor,
  bookingIdFromAcceptedProposal,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  paymentIdFromBookingId,
  systemCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-proposal-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_proposal_emulator_01');
const accountId = AccountIdSchema.parse('account_proposal_emulator_01');
const instructorAccountId = AccountIdSchema.parse('account_proposal_emulator_instructor_01');
const participantId = ParticipantIdSchema.parse('participant_proposal_emulator_01');
const participantIdB = ParticipantIdSchema.parse('participant_proposal_emulator_02');
const managementId = ParticipantManagementIdSchema.parse('management_proposal_emulator_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_proposal_emulator_02');
const instructorId = InstructorIdSchema.parse('instructor_proposal_emulator_01');
const instructorIdB = InstructorIdSchema.parse('instructor_proposal_emulator_02');
const proposalId = BookingProposalIdSchema.parse('booking_proposal_emulator_01');
const proposalIdB = BookingProposalIdSchema.parse('booking_proposal_emulator_02');
const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
const relationshipIdB = instructorRelationshipIdFromPair({ participantId, instructorId: instructorIdB });
const relationshipIdParticipantB = instructorRelationshipIdFromPair({
  participantId: participantIdB,
  instructorId: instructorIdB,
});
const bookingId = bookingIdFromAcceptedProposal(proposalId);
const paymentId = paymentIdFromBookingId(bookingId);
const systemActorId = SystemActorIdSchema.parse('system_proposal_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const BOOKING_PRICE_KZT = 12_000;
const WALLET_START_KZT = 50_000;
const WALLET_CONTENTION_KZT = 15_000;
const WALLET_CONTENTION_PRICE_KZT = 10_000;

const calendarInput = {
  localDate: '2026-01-15',
  localTime: '09:00',
  durationMinutes: 60,
} as const;

const calendarInputB = {
  localDate: '2026-01-16',
  localTime: '11:00',
  durationMinutes: 60,
} as const;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'instructor_relationships',
  'instructors',
  'booking_proposals',
  'booking_proposal_open_index',
  'bookings',
  'payments',
  'monetary_events',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
] as const;

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
}

function seedAccount(account = accountId) {
  return AccountSchema.parse({
    accountId: account,
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

function seedParticipantRecord(input: {
  participantId: typeof participantId;
  managementId: typeof managementId;
}) {
  return {
    participantId: input.participantId,
    displayName: `Emulator Participant ${input.participantId}`,
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: input.managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };
}

function seedManagementRecord(input: {
  managementId: typeof managementId;
  participantId: typeof participantId;
}) {
  return {
    participantManagementId: input.managementId,
    participantId: input.participantId,
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
  };
}

function seedRelationship(input: {
  relationshipId: typeof relationshipId;
  participantId: typeof participantId;
  instructorId: typeof instructorId;
  managementId: typeof managementId;
}) {
  return {
    instructorRelationshipId: input.relationshipId,
    participantId: input.participantId,
    instructorId: input.instructorId,
    basis: {
      kind: 'guardian_permission',
      participantManagementId: input.managementId,
      grantedByAccountId: accountId,
    },
    validFrom: decidedAt,
    expiresAt: instructorRelationshipExpiresAt(decidedAt),
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };
}

async function clearCollections(collections: readonly string[]): Promise<void> {
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function seedInstructor(
  id: typeof instructorId,
  tariff: Readonly<{ pricePerHourKZT?: number; pricePerHour?: number }>
): Promise<void> {
  await firestore.collection('instructors').doc(id).set({
    id,
    name: `Emulator Instructor ${id}`,
    isAvailable: true,
    ...tariff,
  });
}

async function seedSharedFixture(
  walletBalance = WALLET_START_KZT,
  options: {
    instructorPriceKzt?: number;
    includeSecondInstructor?: boolean;
  } = {}
): Promise<void> {
  const instructorPriceKzt = options.instructorPriceKzt ?? BOOKING_PRICE_KZT;
  await firestore.collection('users').doc(accountId).set(seedAccount());
  await firestore.collection('users').doc(instructorAccountId).set(seedAccount(instructorAccountId));
  await firestore
    .collection('users')
    .doc(accountId)
    .collection('wallet')
    .doc('state')
    .set(seedWallet(walletBalance));

  await firestore.collection('participants').doc(participantId).set(
    seedParticipantRecord({ participantId, managementId })
  );
  await firestore.collection('participants').doc(participantIdB).set(
    seedParticipantRecord({ participantId: participantIdB, managementId: managementIdB })
  );

  await firestore.collection('participant_management').doc(managementId).set(
    seedManagementRecord({ managementId, participantId })
  );
  await firestore.collection('participant_management').doc(managementIdB).set(
    seedManagementRecord({ managementId: managementIdB, participantId: participantIdB })
  );

  await firestore.collection('instructor_relationships').doc(relationshipId).set(
    seedRelationship({ relationshipId, participantId, instructorId, managementId })
  );
  await seedInstructor(instructorId, { pricePerHourKZT: instructorPriceKzt });

  if (options.includeSecondInstructor) {
    await firestore.collection('instructor_relationships').doc(relationshipIdB).set(
      seedRelationship({
        relationshipId: relationshipIdB,
        participantId,
        instructorId: instructorIdB,
        managementId,
      })
    );
    await firestore.collection('instructor_relationships').doc(relationshipIdParticipantB).set(
      seedRelationship({
        relationshipId: relationshipIdParticipantB,
        participantId: participantIdB,
        instructorId: instructorIdB,
        managementId: managementIdB,
      })
    );
    await seedInstructor(instructorIdB, { pricePerHourKZT: instructorPriceKzt });
  }
}

function instructorContext(
  idempotencyKey: string,
  input: {
    instructorId?: typeof instructorId;
    calendarInput?: typeof calendarInput;
  } = {}
) {
  const resolvedInstructorId = input.instructorId ?? instructorId;
  return {
    actor: accountCommandActor(instructorAccountId),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    calendarInput: input.calendarInput ?? calendarInput,
    timezone: 'Asia/Almaty' as const,
    transportMetadata: { instructor_id: resolvedInstructorId },
  };
}

function ownerContext(idempotencyKey: string, expectedRevision?: number) {
  return {
    actor: accountCommandActor(accountId),
    exercisedCapability: 'account_owner' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
  };
}

function createProposalEnvelope(
  input: {
    idempotencyKey?: string;
    bookingProposalId?: typeof proposalId;
    instructorId?: typeof instructorId;
    participantId?: typeof participantId;
    calendarInput?: typeof calendarInput;
  } = {}
): CommandEnvelope<'create_booking_proposal'> {
  return {
    kind: 'create_booking_proposal',
    context: instructorContext(input.idempotencyKey ?? 'proposal-create-emulator', {
      instructorId: input.instructorId,
      calendarInput: input.calendarInput,
    }),
    intent: {
      bookingProposalId: input.bookingProposalId ?? proposalId,
      instructorId: input.instructorId ?? instructorId,
      participantId: input.participantId ?? participantId,
    },
  };
}

function acceptProposalEnvelope(
  input: {
    idempotencyKey: string;
    bookingProposalId?: typeof proposalId;
    expectedRevision?: number;
  }
): CommandEnvelope<'accept_booking_proposal'> {
  return {
    kind: 'accept_booking_proposal',
    context: ownerContext(input.idempotencyKey, input.expectedRevision ?? 1),
    intent: { bookingProposalId: input.bookingProposalId ?? proposalId },
  };
}

function declineProposalEnvelope(
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'cancel_booking_proposal'> {
  return {
    kind: 'cancel_booking_proposal',
    context: ownerContext(idempotencyKey, expectedRevision),
    intent: { bookingProposalId: proposalId },
  };
}

function expireProposalEnvelope(
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'expire_booking_proposal'> {
  return {
    kind: 'expire_booking_proposal',
    context: {
      actor: systemCommandActor(systemActorId),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: { bookingProposalId: proposalId },
  };
}

async function createOpenProposal(
  commands: ReturnType<typeof createCommands>,
  input: Parameters<typeof createProposalEnvelope>[0] = {}
): Promise<void> {
  const result = await commands.execute(createProposalEnvelope(input));
  expect(result.status).toBe('success');
}

async function activeParticipantClaimsFor(participant: typeof participantId) {
  const claims = await firestore.collection('resource_claims').get();
  return claims.docs.filter(
    (doc) =>
      doc.data().resourceKind === 'participant' &&
      doc.data().resourceId === participant &&
      doc.data().lifecycle?.status === 'active'
  );
}

async function durableCounts() {
  const [bookings, payments, monetaryEvents, activityLogs, idempotency, claims, proposals, wallet] =
    await Promise.all([
      firestore.collection('bookings').get(),
      firestore.collection('payments').get(),
      firestore.collection('monetary_events').get(),
      firestore.collection('activity_logs').get(),
      firestore.collection('command_idempotency').get(),
      firestore.collection('resource_claims').get(),
      firestore.collection('booking_proposals').get(),
      firestore.doc(`users/${accountId}/wallet/state`).get(),
    ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );

  return {
    bookings: bookings.size,
    payments: payments.size,
    monetaryEvents: monetaryEvents.size,
    activityLogs: activityLogs.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    proposals: proposals.size,
    walletBalance: wallet.data()?.balance as number | undefined,
    bookingIds: bookings.docs.map((doc) => doc.id),
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('booking proposal emulator races', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
    firestore = getFirestore(app);
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    await clearCollections([...COLLECTIONS_TO_CLEAR]);
    await seedSharedFixture();
  }, 30_000);

  it(
    'A. proposal creation reserves nothing (no booking/payment/claims/wallet change)',
    async () => {
      const commands = createCommands();
      const result = await commands.execute(createProposalEnvelope());
      expect(result.status).toBe('success');

      const state = await durableCounts();
      const proposal = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();

      expect(proposal?.lifecycle).toEqual({ status: 'open' });
      expect(state.bookings).toBe(0);
      expect(state.payments).toBe(0);
      expect(state.monetaryEvents).toBe(0);
      expect(state.claims).toBe(0);
      expect(state.walletBalance).toBe(WALLET_START_KZT);
      expect(state.proposals).toBe(1);
      expect(state.activityLogs).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
    },
    30_000
  );

  it(
    'B. accept vs decline concurrent - one wins',
    async () => {
      const commands = createCommands();
      await createOpenProposal(commands);

      const results = await Promise.allSettled([
        commands.execute(acceptProposalEnvelope({ idempotencyKey: 'proposal-accept-race-01' })),
        commands.execute(declineProposalEnvelope('proposal-decline-race-01')),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBe(1);

      const proposal = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();
      const state = await durableCounts();
      const terminalStatus = proposal?.lifecycle?.status;

      if (terminalStatus === 'accepted') {
        expect(state.bookings).toBe(1);
        expect(state.payments).toBe(1);
        expect(state.claims).toBe(2);
        expect(proposal?.lifecycle?.resultingBookingId).toBe(bookingId);
      } else {
        expect(terminalStatus).toBe('declined');
        expect(state.bookings).toBe(0);
        expect(state.payments).toBe(0);
        expect(state.claims).toBe(0);
      }

      expect(
        terminalStatus === 'accepted' && proposal?.lifecycle?.status === 'declined'
      ).toBe(false);
    },
    30_000
  );

  it(
    'C. double accept - one booking',
    async () => {
      const commands = createCommands();
      await createOpenProposal(commands);

      const results = await Promise.allSettled([
        commands.execute(acceptProposalEnvelope({ idempotencyKey: 'proposal-double-accept-01' })),
        commands.execute(acceptProposalEnvelope({ idempotencyKey: 'proposal-double-accept-02' })),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBeGreaterThanOrEqual(1);

      const state = await durableCounts();
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.bookingIds).toEqual([bookingId]);
    },
    30_000
  );

  it(
    'D. accept vs instructor contention',
    async () => {
      const commands = createCommands();
      await createOpenProposal(commands);

      const conflictingBookingId = BookingIdSchema.parse('booking_proposal_emulator_conflict');
      const bookingEnvelope: CommandEnvelope<'create_confirmed_booking'> = {
        kind: 'create_confirmed_booking',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'proposal-contention-booking',
          correlationId,
          source: 'client_callable',
          calendarInput,
          timezone: 'Asia/Almaty',
        },
        intent: {
          bookingId: conflictingBookingId,
          instructorId,
          participantIds: [participantId],
        },
      };

      const results = await Promise.allSettled([
        commands.execute(acceptProposalEnvelope({ idempotencyKey: 'proposal-contention-accept' })),
        commands.execute(bookingEnvelope),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBeGreaterThanOrEqual(1);

      const state = await durableCounts();
      const proposal = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();

      expect(state.bookings).toBeLessThanOrEqual(2);
      if (proposal?.lifecycle?.status === 'accepted') {
        expect(state.bookings).toBe(1);
        expect(state.bookingIds).toContain(bookingId);
      } else {
        expect(['unavailable', 'open']).toContain(proposal?.lifecycle?.status);
        expect(state.bookings).toBeGreaterThanOrEqual(1);
      }
    },
    30_000
  );

  it(
    'E. accept vs participant contention - proposal stays open on participant_conflict',
    async () => {
      await seedInstructor(instructorIdB, { pricePerHourKZT: BOOKING_PRICE_KZT });
      await firestore.collection('instructor_relationships').doc(relationshipIdB).set(
        seedRelationship({
          relationshipId: relationshipIdB,
          participantId,
          instructorId: instructorIdB,
          managementId,
        })
      );

      const commands = createCommands();
      await createOpenProposal(commands, { idempotencyKey: 'proposal-participant-contention-create' });

      const conflictingBookingId = BookingIdSchema.parse('booking_proposal_emulator_participant_conflict');
      const participantConflictBooking: CommandEnvelope<'create_confirmed_booking'> = {
        kind: 'create_confirmed_booking',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'proposal-participant-contention-booking',
          correlationId,
          source: 'client_callable',
          calendarInput,
          timezone: 'Asia/Almaty',
        },
        intent: {
          bookingId: conflictingBookingId,
          instructorId: instructorIdB,
          participantIds: [participantId],
        },
      };

      const results = await Promise.allSettled([
        commands.execute(
          acceptProposalEnvelope({ idempotencyKey: 'proposal-participant-contention-accept' })
        ),
        commands.execute(participantConflictBooking),
      ]);
      const outcomes = results.map((result) =>
        result.status === 'fulfilled' ? result.value : undefined
      );
      const acceptOutcome = outcomes[0];
      const bookingOutcome = outcomes[1];

      const proposal = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();
      const state = await durableCounts();
      const participantClaims = await activeParticipantClaimsFor(participantId);

      expect(participantClaims.length).toBe(1);

      if (bookingOutcome?.status === 'success') {
        expect(proposal?.lifecycle).toEqual({ status: 'open' });
        expect(acceptOutcome?.status).toBe('error');
        if (acceptOutcome?.status === 'error') {
          expect(acceptOutcome.error.code).toBe('participant_conflict');
        }
        expect(state.bookings).toBe(1);
        expect(state.bookingIds).toEqual([conflictingBookingId]);
        expect(state.payments).toBe(1);
        expect(state.monetaryEvents).toBe(1);
        expect(state.walletBalance).toBe(WALLET_START_KZT - BOOKING_PRICE_KZT);
        expect(state.claims).toBe(2);
        expect(proposal?.lifecycle?.status).not.toBe('unavailable');
      } else {
        expect(proposal?.lifecycle.status).toBe('accepted');
        expect(acceptOutcome?.status).toBe('success');
        expect(state.bookings).toBe(1);
        expect(state.bookingIds).toEqual([bookingId]);
      }
    },
    30_000
  );

  it(
    'F. concurrent acceptances share one Wallet - one succeeds, one insufficient_funds',
    async () => {
      await seedSharedFixture(WALLET_CONTENTION_KZT, {
        instructorPriceKzt: WALLET_CONTENTION_PRICE_KZT,
        includeSecondInstructor: true,
      });

      const commands = createCommands();
      await createOpenProposal(commands, {
        idempotencyKey: 'wallet-contention-create-a',
        bookingProposalId: proposalId,
        instructorId,
        participantId,
        calendarInput,
      });
      await createOpenProposal(commands, {
        idempotencyKey: 'wallet-contention-create-b',
        bookingProposalId: proposalIdB,
        instructorId: instructorIdB,
        participantId: participantIdB,
        calendarInput: calendarInputB,
      });

      const results = await Promise.allSettled([
        commands.execute(
          acceptProposalEnvelope({
            idempotencyKey: 'wallet-contention-accept-a',
            bookingProposalId: proposalId,
          })
        ),
        commands.execute(
          acceptProposalEnvelope({
            idempotencyKey: 'wallet-contention-accept-b',
            bookingProposalId: proposalIdB,
          })
        ),
      ]);
      const outcomes = results.map((result) =>
        result.status === 'fulfilled' ? result.value : undefined
      );
      const successes = outcomes.filter((outcome) => outcome?.status === 'success');
      const insufficientFunds = outcomes.filter(
        (outcome) => outcome?.status === 'error' && outcome.error.code === 'insufficient_funds'
      );

      expect(successes.length).toBe(1);
      expect(insufficientFunds.length).toBe(1);

      const proposalA = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();
      const proposalB = (await firestore.doc(`booking_proposals/${proposalIdB}`).get()).data();
      const state = await durableCounts();
      const acceptedProposals = [proposalA, proposalB].filter(
        (proposal) => proposal?.lifecycle?.status === 'accepted'
      );
      const openProposals = [proposalA, proposalB].filter(
        (proposal) => proposal?.lifecycle?.status === 'open'
      );

      expect(acceptedProposals.length).toBe(1);
      expect(openProposals.length).toBe(1);
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(WALLET_CONTENTION_KZT - WALLET_CONTENTION_PRICE_KZT);
      expect(state.walletBalance).toBeGreaterThanOrEqual(0);
      expect(state.successfulIdempotency).toBe(3);
      expect(state.activityLogs).toBe(3);
    },
    30_000
  );

  it(
    'G. successful accept replay - no duplicate durable state',
    async () => {
      const commands = createCommands();
      await createOpenProposal(commands);

      const envelope = acceptProposalEnvelope({ idempotencyKey: 'proposal-accept-replay-g' });
      const first = await commands.execute(envelope);
      const second = await commands.execute(envelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const state = await durableCounts();
      const proposal = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();
      const outbox = await firestore.collection('domain_outbox').get();

      expect(proposal?.lifecycle.status).toBe('accepted');
      expect(proposal?.lifecycle.resultingBookingId).toBe(bookingId);
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(WALLET_START_KZT - BOOKING_PRICE_KZT);
      expect(state.successfulIdempotency).toBe(2);
      expect(state.activityLogs).toBe(2);
      expect(outbox.size).toBeGreaterThanOrEqual(1);
      expect((await firestore.doc(`payments/${paymentId}`).get()).exists).toBe(true);
    },
    30_000
  );

  it(
    'H. accept vs expire race - exactly one terminal outcome',
    async () => {
      const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
      await createOpenProposal(createCommandsAt, 'proposal-expire-race-create');

      const commands = createCommands('2026-01-03T00:00:00.000Z');
      const results = await Promise.allSettled([
        commands.execute(acceptProposalEnvelope({ idempotencyKey: 'proposal-expire-race-accept' })),
        commands.execute(expireProposalEnvelope('proposal-expire-race-expire')),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBe(1);

      const proposal = (await firestore.doc(`booking_proposals/${proposalId}`).get()).data();
      const state = await durableCounts();
      const terminalStatus = proposal?.lifecycle?.status;

      if (terminalStatus === 'accepted') {
        expect(state.bookings).toBe(1);
        expect(state.payments).toBe(1);
        expect(proposal?.lifecycle.resultingBookingId).toBe(bookingId);
      } else {
        expect(terminalStatus).toBe('expired');
        expect(state.bookings).toBe(0);
        expect(state.payments).toBe(0);
        expect(state.claims).toBe(0);
        expect(state.walletBalance).toBe(WALLET_START_KZT);
      }
      expect(proposal?.lifecycle.status === 'accepted' && proposal?.lifecycle?.status === 'expired').toBe(
        false
      );
    },
    30_000
  );
});
