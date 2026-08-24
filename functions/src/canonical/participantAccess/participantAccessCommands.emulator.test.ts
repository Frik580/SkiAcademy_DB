import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-participant-access-test';
const correlationId = CorrelationIdSchema.parse('correlation_participant_emulator_01');
const accountA = AccountIdSchema.parse('account_participant_emulator_a');
const accountB = AccountIdSchema.parse('account_participant_emulator_b');
const participantId = ParticipantIdSchema.parse('participant_participant_emulator_01');
const managementA = ParticipantManagementIdSchema.parse('management_participant_emulator_a');
const managementB = ParticipantManagementIdSchema.parse('management_participant_emulator_b');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

function seedAccount(accountId: typeof accountA) {
  return AccountSchema.parse({
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
  });
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

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

describe.skipIf(!runsOnFirestoreEmulator)('participant access emulator concurrency', () => {
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
    await clearCollections([
      'users',
      'participants',
      'participant_management',
      'participant_management_active_owner',
      'activity_logs',
      'command_idempotency',
    ]);
    await firestore.collection('users').doc(accountA).set(seedAccount(accountA));
    await firestore.collection('users').doc(accountB).set(seedAccount(accountB));
    await firestore.collection('participants').doc(participantId).set({
      participantId,
      displayName: 'Concurrent Dependent',
      age: { kind: 'age_years', years: 11 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      initialManagementEligibleAccountId: accountA,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_participant',
        lastChangedByCommandId: 'command_seed_participant',
        correlationId,
      },
    });
  });

  it(
    'serializes concurrent active owner acquisition for one participant',
    async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const environment = {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
      };
      const commands = createProductionCanonicalCommands(environment, executor);

      const envelopeA: CommandEnvelope<'assign_participant_management'> = {
        kind: 'assign_participant_management',
        context: {
          actor: accountCommandActor(accountA),
          exercisedCapability: 'parent_guardian',
          idempotencyKey: 'concurrent-owner-a',
          correlationId,
          source: 'client_callable',
        },
        intent: {
          participantManagementId: managementA,
          participantId,
          authority: 'parent_guardian',
        },
      };

      const envelopeB: CommandEnvelope<'assign_participant_management'> = {
        kind: 'assign_participant_management',
        context: {
          actor: accountCommandActor(accountA),
          exercisedCapability: 'parent_guardian',
          idempotencyKey: 'concurrent-owner-b',
          correlationId: CorrelationIdSchema.parse('correlation_participant_emulator_02'),
          source: 'client_callable',
        },
        intent: {
          participantManagementId: managementB,
          participantId,
          authority: 'parent_guardian',
        },
      };

      const [resultA, resultB] = await Promise.all([
        commands.execute(envelopeA),
        commands.execute(envelopeB),
      ]);

      const successes = [resultA, resultB].filter((result) => result.status === 'success');
      const blocked = [resultA, resultB].filter(
        (result) => result.status === 'error' && result.error.code === 'blocked_relationship'
      );

      expect(successes).toHaveLength(1);
      expect(blocked).toHaveLength(1);

      const guardSnapshot = await firestore
        .collection('participant_management_active_owner')
        .doc(participantId)
        .get();
      expect(guardSnapshot.exists).toBe(true);
    },
    30_000
  );
});
