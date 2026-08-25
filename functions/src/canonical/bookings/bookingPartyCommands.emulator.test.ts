import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type QuerySnapshot } from 'firebase-admin/firestore';
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
  activityLogIdFromCommandId,
  calculateFamilyGroupBookingPriceKzt,
  incrementalRequirementIdFromPartyAddition,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  KztMinorUnitsSchema,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-party-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_party_emulator_01');
const accountId = AccountIdSchema.parse('account_party_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_party_emulator_admin');
const unrelatedAccountId = AccountIdSchema.parse('account_party_emulator_unrelated');
const instructorId = InstructorIdSchema.parse('instructor_party_emulator_01');
const bookingId = BookingIdSchema.parse('booking_party_emulator_01');
const bookingTwoId = BookingIdSchema.parse('booking_party_emulator_02');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const LESSON_PRICE = KztMinorUnitsSchema.parse(12_000);

const participantIds = Array.from({ length: 8 }, (_, index) =>
  ParticipantIdSchema.parse(`participant_party_emulator_${String(index + 1).padStart(2, '0')}`)
);
const managementIds = Array.from({ length: 8 }, (_, index) =>
  ParticipantManagementIdSchema.parse(`management_party_emulator_${String(index + 1).padStart(2, '0')}`)
);
const [participantId, participantTwoId, participantThreeId] = participantIds;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'instructors',
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

function environment(at = '2026-01-10T09:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-10T09:00:00.000Z') {
  return createProductionCanonicalCommands(
    environment(at),
    createFirestoreCanonicalTransactionExecutor(firestore)
  );
}

async function clearCollection(collectionName: string): Promise<void> {
  const snapshot: QuerySnapshot = await firestore.collection(collectionName).get();
  if (snapshot.empty) return;
  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function clearAll(): Promise<void> {
  for (const collection of COLLECTIONS_TO_CLEAR) {
    await clearCollection(collection);
  }
}

async function seedBase(walletBalance = 50_000): Promise<void> {
  for (const id of [accountId, adminAccountId, unrelatedAccountId]) {
    await firestore.doc(`users/${id}`).set(
      AccountSchema.parse({
        accountId: id,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: `command_seed_${id}`,
          lastChangedByCommandId: `command_seed_${id}`,
          correlationId,
        },
      })
    );
  }

  for (let index = 0; index < participantIds.length; index += 1) {
    const participant = participantIds[index]!;
    const management = managementIds[index]!;
    await firestore.doc(`participants/${participant}`).set({
      participantId: participant,
      displayName: `Emulator Participant ${index + 1}`,
      age: { kind: 'age_years', years: 20 - index },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: management },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: `command_seed_participant_${index + 1}`,
        lastChangedByCommandId: `command_seed_participant_${index + 1}`,
        correlationId,
      },
    });
    await firestore.doc(`participant_management/${management}`).set({
      participantManagementId: management,
      participantId: participant,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: `command_seed_management_${index + 1}`,
        lastChangedByCommandId: `command_seed_management_${index + 1}`,
        correlationId,
      },
    });
  }

  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Emulator Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: walletBalance,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
}

function partyContext(
  input: {
    idempotencyKey: string;
    actorAccountId?: typeof accountId | typeof adminAccountId | typeof unrelatedAccountId;
    capability?: 'account_owner' | 'administrator';
    expectedRevision?: number;
    at?: string;
  }
) {
  const capability = input.capability ?? 'account_owner';
  return {
    actor: accountCommandActor(input.actorAccountId ?? accountId),
    exercisedCapability: capability,
    idempotencyKey: input.idempotencyKey,
    correlationId,
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision) }),
    calendarInput: {
      localDate: '2026-01-15',
      localTime: '09:00',
      durationMinutes: 60,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function partyEnvelope(
  input: {
    idempotencyKey: string;
    booking?: typeof bookingId | typeof bookingTwoId;
    participantIdsToAdd?: typeof participantIds;
    participantIdsToRemove?: typeof participantIds;
    capability?: 'account_owner' | 'administrator';
    actorAccountId?: typeof accountId | typeof adminAccountId | typeof unrelatedAccountId;
    expectedRevision?: number;
    reasonExplanation?: string;
  }
): CommandEnvelope<'change_booking_party'> {
  return {
    kind: 'change_booking_party',
    context: partyContext({
      idempotencyKey: input.idempotencyKey,
      actorAccountId: input.actorAccountId,
      capability: input.capability,
      expectedRevision: input.expectedRevision,
    }),
    intent: {
      bookingId: input.booking ?? bookingId,
      ...(input.participantIdsToAdd ? { participantIdsToAdd: input.participantIdsToAdd } : {}),
      ...(input.participantIdsToRemove ? { participantIdsToRemove: input.participantIdsToRemove } : {}),
      ...(input.reasonExplanation ? { reasonExplanation: input.reasonExplanation } : {}),
    },
  };
}

async function createConfirmedBooking(
  targetBookingId: typeof bookingId | typeof bookingTwoId = bookingId,
  participantList: typeof participantIds = [participantId]
): Promise<void> {
  const commands = createCommands('2026-01-01T00:00:00.000Z');
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: partyContext({ idempotencyKey: `create-${targetBookingId}` }),
    intent: { bookingId: targetBookingId, instructorId, participantIds: participantList },
  });
  expect(result.status).toBe('success');
}

async function countCollection(collection: string): Promise<number> {
  return (await firestore.collection(collection).get()).size;
}

async function activeClaimsForBooking(targetBookingId: typeof bookingId) {
  const snapshot = await firestore.collection('resource_claims').get();
  return snapshot.docs.filter(
    (doc) =>
      doc.data().ownerId === targetBookingId && doc.data().lifecycle?.status === 'active'
  );
}

describe.skipIf(!runsOnFirestoreEmulator)('booking party commands emulator', () => {
  beforeAll(() => {
    if (!runsOnFirestoreEmulator) return;
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    await clearAll();
  }, 30_000);

  it('A. serializes concurrent party mutations from the same booking revision', async () => {
    await seedBase();
    await createConfirmedBooking();
    const commands = createCommands();
    const [addTwoResult, addThreeResult] = await Promise.all([
      commands.execute(
        partyEnvelope({
          idempotencyKey: 'party-emulator-add-two',
          participantIdsToAdd: [participantTwoId],
          expectedRevision: 1,
        })
      ),
      commands.execute(
        partyEnvelope({
          idempotencyKey: 'party-emulator-add-three',
          participantIdsToAdd: [participantThreeId],
          expectedRevision: 1,
        })
      ),
    ]);

    const outcomes = [addTwoResult.status, addThreeResult.status];
    expect(outcomes.filter((status) => status === 'success').length).toBe(1);
    expect(outcomes.filter((status) => status === 'error').length).toBe(1);

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const party = booking?.party.participantIds ?? [];
    expect(party.length).toBe(2);
    expect(party).toContain(participantId);
    expect([participantTwoId, participantThreeId].filter((id) => party.includes(id)).length).toBe(1);
    expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.price).toBe(18_000);
  }, 30_000);

  it('B. rejects party add when participant claim is already taken for the interval', async () => {
    await seedBase();
    await createConfirmedBooking(bookingId, [participantId]);
    const commands = createCommands();
    const [addResult, createResult] = await Promise.allSettled([
      commands.execute(
        partyEnvelope({
          idempotencyKey: 'party-claim-contention-add',
          participantIdsToAdd: [participantTwoId],
          expectedRevision: 1,
        })
      ),
      commands.execute({
        kind: 'create_confirmed_booking',
        context: partyContext({ idempotencyKey: 'party-claim-contention-create' }),
        intent: { bookingId: bookingTwoId, instructorId, participantIds: [participantTwoId] },
      }),
    ]);
    const outcomes = [addResult, createResult].map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value.status : 'rejected'
    );
    expect(outcomes.filter((status) => status === 'success').length).toBe(1);

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const bookingTwo = (await firestore.doc(`bookings/${bookingTwoId}`).get()).data();
    const p2OnOne = booking?.party.participantIds.includes(participantTwoId) ?? false;
    const p2OnTwo = bookingTwo?.party.participantIds.includes(participantTwoId) ?? false;
    expect(p2OnOne !== p2OnTwo).toBe(true);
    if (p2OnOne) {
      expect(booking?.party.participantIds).toEqual([participantId, participantTwoId]);
      expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.price).toBe(18_000);
    } else {
      expect(booking?.party.participantIds).toEqual([participantId]);
      expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.price).toBe(12_000);
    }
    expect(
      (await activeClaimsForBooking(bookingId)).filter(
        (doc) => doc.data().resourceId === participantTwoId
      ).length
    ).toBe(p2OnOne ? 1 : 0);
  }, 30_000);

  it('C. rejects self-service add atomically when Wallet cannot fund the tariff delta', async () => {
    await seedBase(17_000);
    await createConfirmedBooking(bookingId, [participantId]);
    const commands = createCommands();
    const envelope = partyEnvelope({
      idempotencyKey: 'party-insufficient-wallet',
      participantIdsToAdd: [participantTwoId],
      expectedRevision: 1,
    });
    const result = await commands.execute(envelope);
    expect(result.status).toBe('error');

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.party.participantIds).toEqual([participantId]);
    expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.price).toBe(12_000);
    expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(5_000);
    expect(
      (await activeClaimsForBooking(bookingId)).some(
        (doc) => doc.data().resourceId === participantTwoId
      )
    ).toBe(false);
    expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.incrementalRequirements).toEqual(
      []
    );
    expect(await countCollection('monetary_events')).toBe(1);
    expect(await countCollection('activity_logs')).toBe(1);
    expect((await firestore.collection('command_idempotency').get()).docs.some((doc) => doc.id.includes('party-insufficient-wallet'))).toBe(false);
  }, 30_000);

  it('D. prevents Wallet overspend when two party adds compete for the same Wallet', async () => {
    await seedBase(30_000);
    await createConfirmedBooking(bookingId, [participantId]);
    const commands = createCommands();
    await commands.execute({
      kind: 'create_confirmed_booking',
      context: partyContext({ idempotencyKey: 'create-booking-two' }),
      intent: { bookingId: bookingTwoId, instructorId, participantIds: [participantThreeId] },
    });

    const [addOne, addTwo] = await Promise.allSettled([
      commands.execute(
        partyEnvelope({
          booking: bookingId,
          idempotencyKey: 'wallet-race-booking-one',
          participantIdsToAdd: [participantTwoId],
          expectedRevision: 1,
        })
      ),
      commands.execute(
        partyEnvelope({
          booking: bookingTwoId,
          idempotencyKey: 'wallet-race-booking-two',
          participantIdsToAdd: [participantTwoId],
          expectedRevision: 1,
        })
      ),
    ]);
    const outcomes = [addOne, addTwo].map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value.status : 'rejected'
    );
    expect(outcomes.filter((status) => status === 'success').length).toBe(1);
    expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBeGreaterThanOrEqual(0);

    const bookingOne = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const bookingTwo = (await firestore.doc(`bookings/${bookingTwoId}`).get()).data();
    const addedToOne = bookingOne?.party.participantIds.includes(participantTwoId) ?? false;
    const addedToTwo = bookingTwo?.party.participantIds.includes(participantTwoId) ?? false;
    expect(addedToOne !== addedToTwo).toBe(true);
  }, 30_000);

  it('E. commits self-service remove, refund, and claim release atomically', async () => {
    await seedBase();
    await createConfirmedBooking();
    const commands = createCommands();
    await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-add-before-remove',
        participantIdsToAdd: [participantTwoId],
        expectedRevision: 1,
      })
    );
    const walletAfterAdd = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance;
    const removeEnvelope = partyEnvelope({
      idempotencyKey: 'party-remove-refund',
      participantIdsToRemove: [participantTwoId],
      expectedRevision: 2,
    });
    const result = await commands.execute(removeEnvelope);
    expect(result.status).toBe('success');

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(booking?.party.participantIds).toEqual([participantId]);
    expect(booking?.occurrence.serviceParty.participantIds).toEqual([participantId]);
    expect(payment?.price).toBe(12_000);
    expect(payment?.settledAmount).toBe(12_000);
    expect(payment?.refundedAmount).toBe(6_000);
    expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(
      walletAfterAdd + 6_000
    );
    expect(
      (await activeClaimsForBooking(bookingId)).some(
        (doc) => doc.data().resourceId === participantTwoId
      )
    ).toBe(false);
    expect(await countCollection('monetary_events')).toBe(3);
    const identity = resolveCommandIdempotencyIdentity(removeEnvelope);
    expect(
      (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get()).exists
    ).toBe(true);
  }, 30_000);

  it('F. replays self-service remove without duplicate refund or claim effects', async () => {
    await seedBase();
    await createConfirmedBooking();
    const commands = createCommands();
    await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-add-before-remove-replay',
        participantIdsToAdd: [participantTwoId],
        expectedRevision: 1,
      })
    );
    const removeEnvelope = partyEnvelope({
      idempotencyKey: 'party-remove-replay',
      participantIdsToRemove: [participantTwoId],
      expectedRevision: 2,
    });
    const first = await commands.execute(removeEnvelope);
    expect(first.status).toBe('success');
    const walletAfterFirst = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance;
    const paymentAfterFirst = (await firestore.doc(`payments/${paymentId}`).get()).data();
    const monetaryEventsAfterFirst = await countCollection('monetary_events');
    const replay = await commands.execute(removeEnvelope);
    expect(replay.status).toBe('success');
    expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(
      walletAfterFirst
    );
    expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.refundedAmount).toBe(
      paymentAfterFirst?.refundedAmount
    );
    expect(await countCollection('monetary_events')).toBe(monetaryEventsAfterFirst);
  }, 30_000);

  it('G. admin late add persists incremental requirement and partial Wallet funding', async () => {
    await seedBase(16_000);
    await createConfirmedBooking(bookingId, [participantId]);
    const commands = createCommands('2026-01-14T09:00:01.000Z');
    const envelope = partyEnvelope({
      idempotencyKey: 'party-admin-late-add',
      capability: 'administrator',
      actorAccountId: adminAccountId,
      participantIdsToAdd: [participantTwoId],
      reasonExplanation: 'Late family addition approved',
      expectedRevision: 1,
    });
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(booking?.party.participantIds).toEqual([participantId, participantTwoId]);
    expect(payment?.price).toBe(18_000);
    expect(payment?.outstandingAmount).toBe(2_000);
    expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(0);
    const identity = resolveCommandIdempotencyIdentity(envelope);
    const requirementId = incrementalRequirementIdFromPartyAddition({
      commandId: identity.commandKey,
      participantId: participantTwoId,
    });
    expect(payment?.incrementalRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          incrementalRequirementId: requirementId,
          participantId: participantTwoId,
          requiredPriceDelta: 6_000,
          allocatedSettledAmount: 4_000,
          state: 'active',
        }),
      ])
    );
    expect(
      (await activeClaimsForBooking(bookingId)).some(
        (doc) => doc.data().resourceId === participantTwoId
      )
    ).toBe(true);
    expect(await countCollection('monetary_events')).toBe(2);
    const replay = await commands.execute(envelope);
    expect(replay.status).toBe('success');
    expect(await countCollection('monetary_events')).toBe(2);
  }, 30_000);

  it('H. rolls back only unpaid admin addition and freezes the final service party', async () => {
    await seedBase(16_000);
    await createConfirmedBooking(bookingId, [participantId]);
    let commands = createCommands('2026-01-14T09:00:01.000Z');
    const addEnvelope = partyEnvelope({
      idempotencyKey: 'party-admin-late-add-rollback',
      capability: 'administrator',
      actorAccountId: adminAccountId,
      participantIdsToAdd: [participantTwoId],
      reasonExplanation: 'Late family addition approved',
      expectedRevision: 1,
    });
    await commands.execute(addEnvelope);
    commands = createCommands('2026-01-15T09:00:00.000Z');
    const rollbackEnvelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'> = {
      kind: 'rollback_unpaid_booking_party_additions',
      context: {
        actor: systemCommandActor('scheduler_party_rollback'),
        exercisedCapability: 'system',
        idempotencyKey: 'rollback-unpaid-emulator',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    };
    const result = await commands.execute(rollbackEnvelope);
    expect(result.status).toBe('success');

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
    expect(booking?.party.participantIds).toEqual([participantId]);
    expect(booking?.occurrence.serviceParty.participantIds).toEqual([participantId]);
    expect(booking?.occurrence.serviceParty.frozenAt).toBeDefined();
    expect(payment?.price).toBe(12_000);
    expect(payment?.outstandingAmount).toBe(0);
    expect(
      payment?.incrementalRequirements.find((entry) => entry.participantId === participantTwoId)?.state
    ).toBe('rolled_back');
    expect(
      payment?.incrementalRequirements.find((entry) => entry.participantId === participantTwoId)
        ?.allocatedSettledAmount
    ).toBe(0);
    expect(
      (await activeClaimsForBooking(bookingId)).some(
        (doc) => doc.data().resourceId === participantTwoId
      )
    ).toBe(false);
    expect(
      (await activeClaimsForBooking(bookingId)).some(
        (doc) => doc.data().resourceId === participantId
      )
    ).toBe(true);
    const replay = await commands.execute(rollbackEnvelope);
    expect(replay.status).toBe('success');
    expect(await countCollection('monetary_events')).toBe(3);
  }, 30_000);

  it('I. rolls back only unpaid additions when another admin addition is fully funded', async () => {
    await seedBase(20_000);
    await createConfirmedBooking(bookingId, [participantId]);
    let commands = createCommands('2026-01-14T09:00:01.000Z');
    await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-admin-funded-add',
        capability: 'administrator',
        actorAccountId: adminAccountId,
        participantIdsToAdd: [participantTwoId],
        reasonExplanation: 'Funded late addition',
        expectedRevision: 1,
      })
    );
    await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-admin-unpaid-add',
        capability: 'administrator',
        actorAccountId: adminAccountId,
        participantIdsToAdd: [participantThreeId],
        reasonExplanation: 'Unpaid late addition',
        expectedRevision: 2,
      })
    );
    commands = createCommands('2026-01-15T09:00:00.000Z');
    const result = await commands.execute({
      kind: 'rollback_unpaid_booking_party_additions',
      context: {
        actor: systemCommandActor('scheduler_party_rollback'),
        exercisedCapability: 'system',
        idempotencyKey: 'rollback-mixed-funded',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    });
    expect(result.status).toBe('success');

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(booking?.party.participantIds).toEqual([participantId, participantTwoId]);
    expect(payment?.price).toBe(18_000);
    expect(
      payment?.incrementalRequirements.find((entry) => entry.participantId === participantThreeId)?.state
    ).toBe('rolled_back');
    expect(
      payment?.incrementalRequirements.find((entry) => entry.participantId === participantTwoId)?.state
    ).toBe('fully_funded');
  }, 30_000);

  it('J. uses authoritative nonlinear tariff when rolling back unpaid additions', async () => {
    await seedBase(16_000);
    await createConfirmedBooking(bookingId, [participantId]);
    const commands = createCommands('2026-01-14T09:00:01.000Z');
    await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-admin-nonlinear',
        capability: 'administrator',
        actorAccountId: adminAccountId,
        participantIdsToAdd: [participantTwoId, participantThreeId],
        reasonExplanation: 'Batch late addition',
        expectedRevision: 1,
      })
    );
    const rollbackCommands = createCommands('2026-01-15T09:00:00.000Z');
    await rollbackCommands.execute({
      kind: 'rollback_unpaid_booking_party_additions',
      context: {
        actor: systemCommandActor('scheduler_party_rollback'),
        exercisedCapability: 'system',
        idempotencyKey: 'rollback-nonlinear',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    });
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(payment?.price).toBe(
      calculateFamilyGroupBookingPriceKzt(LESSON_PRICE, 1)
    );
  }, 30_000);

  it('K. allows the 8th participant and rejects the 9th without side effects', async () => {
    await seedBase(500_000);
    const commands = createCommands('2026-01-01T00:00:00.000Z');
    await commands.execute({
      kind: 'create_confirmed_booking',
      context: partyContext({ idempotencyKey: 'create-party-eight' }),
      intent: { bookingId, instructorId, participantIds: [participantIds[0]!] },
    });
    let revision = 1;
    for (let index = 1; index < 7; index += 1) {
      const addResult = await commands.execute(
        partyEnvelope({
          idempotencyKey: `party-add-${index}`,
          participantIdsToAdd: [participantIds[index]!],
          expectedRevision: revision,
        })
      );
      expect(addResult.status).toBe('success');
      revision += 1;
    }
    const eighth = await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-add-eighth',
        participantIdsToAdd: [participantIds[7]!],
        expectedRevision: revision,
      })
    );
    expect(eighth.status).toBe('success');
    const beforeNinthPayment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    const beforeNinthWallet = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance;
    const ninthParticipantId = ParticipantIdSchema.parse('participant_party_emulator_09');
    await firestore.doc(`participants/${ninthParticipantId}`).set({
      participantId: ninthParticipantId,
      displayName: 'Emulator Participant Nine',
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: {
        kind: 'managed',
        participantManagementId: ParticipantManagementIdSchema.parse('management_party_emulator_09'),
      },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_participant_09',
        lastChangedByCommandId: 'command_seed_participant_09',
        correlationId,
      },
    });
    await firestore.doc(`participant_management/management_party_emulator_09`).set({
      participantManagementId: ParticipantManagementIdSchema.parse('management_party_emulator_09'),
      participantId: ninthParticipantId,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_management_09',
        lastChangedByCommandId: 'command_seed_management_09',
        correlationId,
      },
    });
    const ninth = await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-add-ninth',
        participantIdsToAdd: [ninthParticipantId],
        expectedRevision: revision + 1,
      })
    );
    expect(ninth.status).toBe('error');
    expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.party.participantIds.length).toBe(8);
    expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.price).toBe(beforeNinthPayment?.price);
    expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(
      beforeNinthWallet
    );
  }, 30_000);

  it('L. freezes service party at start when there are no unpaid additions', async () => {
    await seedBase();
    await createConfirmedBooking();
    const commands = createCommands('2026-01-15T09:00:00.000Z');
    const rollbackEnvelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'> = {
      kind: 'rollback_unpaid_booking_party_additions',
      context: {
        actor: systemCommandActor('scheduler_party_rollback'),
        exercisedCapability: 'system',
        idempotencyKey: 'rollback-freeze-only',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    };
    const result = await commands.execute(rollbackEnvelope);
    expect(result.status).toBe('success');
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.party.participantIds).toEqual([participantId]);
    expect(booking?.occurrence.serviceParty.frozenAt).toBeDefined();
    expect((await firestore.doc(`payments/${paymentId}`).get()).data()?.price).toBe(12_000);
    expect(await countCollection('monetary_events')).toBe(1);
  }, 30_000);

  it('M. rejects unauthorized self-service party mutation from unrelated account', async () => {
    await seedBase();
    await createConfirmedBooking();
    const commands = createCommands();
    const result = await commands.execute(
      partyEnvelope({
        idempotencyKey: 'party-unauthorized-account',
        actorAccountId: unrelatedAccountId,
        participantIdsToAdd: [participantTwoId],
        expectedRevision: 1,
      })
    );
    expect(result.status).toBe('error');
    expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.party.participantIds).toEqual([
      participantId,
    ]);
  }, 30_000);
});
