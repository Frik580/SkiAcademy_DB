import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantSchema,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-identity-admin-emulator';
const correlationId = CorrelationIdSchema.parse('correlation_identity_admin_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_identity_admin_emulator_01');
const targetAccountId = AccountIdSchema.parse('account_identity_admin_emulator_02');
const participantId = ParticipantIdSchema.parse('participant_identity_admin_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_identity_admin_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

function seedAccount(accountId: typeof adminAccountId, extras: Record<string, unknown> = {}) {
  return {
    ...AccountSchema.parse({
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
    displayName: 'Seed',
    role: 'admin',
    ...extras,
  };
}

function seedParticipant() {
  return ParticipantSchema.parse({
    participantId,
    displayName: 'Dependent',
    age: { kind: 'birth_date', birthDate: '2014-01-15' },
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
  });
}

function adminContext(idempotencyKey: string, expectedRevision = 1) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
    expectedRevision,
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

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

describe.skipIf(!runsOnFirestoreEmulator)('identity administration Firestore emulator', () => {
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
      'instructors',
      'participants',
      'participant_management',
      'participant_management_active_owner',
      'participant_blocks',
      'instructor_relationships',
      'bookings',
      'course_enrollments',
      'activity_logs',
      'domain_outbox',
      'command_idempotency',
    ]);
    await firestore
      .collection('users')
      .doc(adminAccountId)
      .set(seedAccount(adminAccountId, { systemRole: 'owner' }));
    await firestore
      .collection('users')
      .doc(targetAccountId)
      .set(seedAccount(targetAccountId, { role: 'user' }));
    await firestore.collection('participants').doc(participantId).set(seedParticipant());
  });

  it('disables an Account, archives a Participant, and creates Instructor catalog through the Admin SDK', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );

    const disableEnvelope: CommandEnvelope<'disable_account'> = {
      kind: 'disable_account',
      context: adminContext('identity-emulator-disable'),
      intent: { accountId: targetAccountId, reasonExplanation: 'Emulator disable' },
    };
    const archiveEnvelope: CommandEnvelope<'archive_participant'> = {
      kind: 'archive_participant',
      context: adminContext('identity-emulator-archive'),
      intent: { participantId, reasonExplanation: 'Emulator archive' },
    };
    const catalogEnvelope: CommandEnvelope<'create_instructor_catalog_entry'> = {
      kind: 'create_instructor_catalog_entry',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'identity-emulator-catalog',
        correlationId,
        source: 'admin_callable',
      },
      intent: {
        instructorId,
        name: 'Emulator Catalog Coach',
        pricePerHourKZT: 18_000,
        reasonExplanation: 'Emulator catalog create',
      },
    };

    expect((await commands.execute(disableEnvelope)).status).toBe('success');
    expect((await commands.execute(archiveEnvelope)).status).toBe('success');
    expect((await commands.execute(catalogEnvelope)).status).toBe('success');

    const [account, participant, catalog] = await Promise.all([
      firestore.collection('users').doc(targetAccountId).get(),
      firestore.collection('participants').doc(participantId).get(),
      firestore.collection('instructors').doc(instructorId).get(),
    ]);

    expect(account.data()).toMatchObject({
      lifecycle: { status: 'disabled' },
      role: 'user',
    });
    expect(participant.data()).toMatchObject({
      lifecycle: { status: 'archived' },
      displayName: 'Dependent',
    });
    expect(catalog.exists).toBe(true);
    expect(catalog.data()).toMatchObject({
      instructorId,
      name: 'Emulator Catalog Coach',
      isAvailable: true,
    });

    const enableEnvelope: CommandEnvelope<'enable_account'> = {
      kind: 'enable_account',
      context: adminContext('identity-emulator-enable', 2),
      intent: { accountId: targetAccountId, reasonExplanation: 'Emulator enable' },
    };
    expect((await commands.execute(enableEnvelope)).status).toBe('success');
    expect((await firestore.collection('users').doc(targetAccountId).get()).data()).toMatchObject({
      lifecycle: { status: 'active' },
      role: 'user',
    });
  }, 30_000);

  it('changes Account role through the Admin SDK', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );

    const result = await commands.execute({
      kind: 'change_account_role',
      context: adminContext('identity-emulator-role'),
      intent: {
        accountId: targetAccountId,
        role: 'admin',
        reasonExplanation: 'Emulator promote',
      },
    });

    expect(result.status).toBe('success');
    expect((await firestore.collection('users').doc(targetAccountId).get()).data()).toMatchObject({
      role: 'admin',
    });
  }, 30_000);

  it('updates Account contact projection through the Admin SDK without changing email or role', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );
    await firestore.collection('users').doc(targetAccountId).set(
      seedAccount(targetAccountId, {
        role: 'user',
        email: 'keep@example.com',
        displayName: 'Emulator Old',
        phoneNumber: '+77010000000',
      })
    );

    const result = await commands.execute({
      kind: 'update_account_contact_as_administrator',
      context: adminContext('identity-emulator-contact'),
      intent: {
        accountId: targetAccountId,
        displayName: 'Emulator New',
        phoneNumber: '+77019999999',
        reasonExplanation: 'Emulator contact',
      },
    });

    expect(result.status).toBe('success');
    expect((await firestore.collection('users').doc(targetAccountId).get()).data()).toMatchObject({
      displayName: 'Emulator New',
      phoneNumber: '+77019999999',
      email: 'keep@example.com',
      role: 'user',
      lifecycle: { status: 'active' },
    });
    expect((await firestore.collection('participants').doc(participantId).get()).data()).toMatchObject({
      displayName: 'Dependent',
    });
  }, 30_000);
});
