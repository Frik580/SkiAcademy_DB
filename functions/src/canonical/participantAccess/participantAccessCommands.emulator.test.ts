import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountCommandActor,
  participantManagementIdFromSelfProvisioning,
  participantBlockIdFromDirection,
  selfParticipantIdFromAccountId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { queryManagedParticipantPickerReadModels } from '../readModels/managedParticipantPickerReadModels';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'demo-ski-school-e2e';
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
      'participant_blocks',
    ]);
    await firestore.collection('users').doc(accountA).set(seedAccount(accountA));
    await firestore.collection('users').doc(accountB).set(seedAccount(accountB));
    await firestore
      .collection('participants')
      .doc(participantId)
      .set({
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

  it('blocks and unblocks a provisioned self Participant atomically', async () => {
    await firestore
      .collection('users')
      .doc(accountA)
      .set({
        ...seedAccount(accountA),
        displayName: 'Self Emulator Client',
        role: 'user',
      });
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const context = {
      actor: accountCommandActor(accountA),
      exercisedCapability: 'account_owner' as const,
      idempotencyKey: 'provision-self-for-block',
      correlationId,
      source: 'client_callable' as const,
    };
    expect(
      await commands.execute({ kind: 'provision_self_participant', context, intent: {} })
    ).toMatchObject({ status: 'success' });
    const selfId = selfParticipantIdFromAccountId(accountA);
    const instructorId = InstructorIdSchema.parse('instructor_block_emulator');
    const blockId = participantBlockIdFromDirection({
      participantId: selfId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const block: CommandEnvelope<'block_participant'> = {
      kind: 'block_participant',
      context: { ...context, idempotencyKey: 'block-self' },
      intent: { participantBlockId: blockId, participantId: selfId, instructorId, reason: 'Block' },
    };
    expect(await commands.execute(block)).toMatchObject({ status: 'success' });
    expect(
      (await firestore.collection('participant_blocks').doc(blockId).get()).data()
    ).toMatchObject({ status: 'active', revision: 1 });
    expect(await commands.execute(block)).toMatchObject({ status: 'success' });
    expect(
      await commands.execute({
        kind: 'unblock_participant',
        context: {
          ...context,
          idempotencyKey: 'unblock-self',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: { participantBlockId: blockId },
      })
    ).toMatchObject({ status: 'success' });
    expect(
      (await firestore.collection('participant_blocks').doc(blockId).get()).data()
    ).toMatchObject({ status: 'removed', revision: 2 });
    const reblock = {
      ...block,
      context: { ...context, idempotencyKey: 'reblock-self' },
    };
    expect(await commands.execute(reblock)).toMatchObject({ status: 'success' });
    // A new logical attempt must read the active document rather than create it again.
    expect(
      await commands.execute({
        ...block,
        context: { ...context, idempotencyKey: 'block-self-after-reblock' },
      })
    ).toMatchObject({ status: 'success' });
    const reblocked = (await firestore.collection('participant_blocks').doc(blockId).get()).data();
    expect(reblocked).toMatchObject({ status: 'active', revision: 3 });
    expect(reblocked).not.toHaveProperty('removedAt');
    expect(reblocked).not.toHaveProperty('removedBy');
    // Reproduce the exact persisted shape left by the previously deployed reactivation.
    const blockRef = firestore.collection('participant_blocks').doc(blockId);
    await blockRef.update({ removedAt: decidedAt, removedBy: reblocked!.createdBy });
    const logsBeforeForeignBlock = (await firestore.collection('activity_logs').get()).size;
    const idempotencyBeforeForeignBlock = (await firestore.collection('command_idempotency').get()).size;
    expect(await commands.execute({
      ...block, context: { ...context, actor: accountCommandActor(accountB), idempotencyKey: 'foreign-block' },
    })).toMatchObject({ status: 'error', error: { code: 'forbidden' } });
    expect((await firestore.collection('activity_logs').get()).size).toBe(logsBeforeForeignBlock);
    expect((await firestore.collection('command_idempotency').get()).size).toBe(idempotencyBeforeForeignBlock);
    expect(
      await commands.execute({
        ...block,
        context: { ...context, idempotencyKey: 'block-with-stale-removal-fields' },
      })
    ).toMatchObject({ status: 'success' });
    expect(
      await commands.execute({
        kind: 'unblock_participant',
        context: {
          ...context,
          actor: accountCommandActor(accountB),
          idempotencyKey: 'foreign-unblock',
          expectedRevision: AggregateRevisionSchema.parse(3),
        },
        intent: { participantBlockId: blockId },
      })
    ).toMatchObject({ status: 'error', error: { code: 'forbidden' } });
    expect((await blockRef.get()).data()).toMatchObject({ status: 'active', revision: 3 });
    expect(
      await commands.execute({
        kind: 'unblock_participant',
        context: {
          ...context,
          idempotencyKey: 'unblock-self-again',
          expectedRevision: AggregateRevisionSchema.parse(3),
        },
        intent: { participantBlockId: blockId },
      })
    ).toMatchObject({ status: 'success' });
  }, 30_000);

  it.each([
    ['block_participant', 'missing'],
    ['block_participant', 'incompatible'],
    ['unblock_participant', 'missing'],
    ['unblock_participant', 'incompatible'],
  ] as const)('denies %s with %s management without partial writes', async (kind, state) => {
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const context = {
      actor: accountCommandActor(accountA),
      exercisedCapability: 'parent_guardian' as const,
      idempotencyKey: 'assign-for-block',
      correlationId,
      source: 'client_callable' as const,
    };
    expect(
      await commands.execute({
        kind: 'assign_participant_management',
        context,
        intent: {
          participantId,
          participantManagementId: managementA,
          authority: 'parent_guardian',
        },
      })
    ).toMatchObject({ status: 'success' });
    const instructorId = InstructorIdSchema.parse('instructor_block_emulator');
    const blockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const block: CommandEnvelope<'block_participant'> = {
      kind: 'block_participant',
      context: { ...context, idempotencyKey: 'block-managed' },
      intent: { participantBlockId: blockId, participantId, instructorId, reason: 'Block' },
    };
    if (kind === 'unblock_participant') {
      expect(await commands.execute(block)).toMatchObject({ status: 'success' });
    }
    const management = firestore.collection('participant_management').doc(managementA);
    if (state === 'missing') await management.delete();
    else await management.set({ status: 'active', accountId: accountA });
    const blockRef = firestore.collection('participant_blocks').doc(blockId);
    const before = (await blockRef.get()).data();
    const logsBefore = (await firestore.collection('activity_logs').get()).size;
    const idempotencyBefore = (await firestore.collection('command_idempotency').get()).size;
    const command =
      kind === 'block_participant'
        ? block
        : {
            kind,
            context: {
              ...context,
              idempotencyKey: 'unblock-managed',
              expectedRevision: AggregateRevisionSchema.parse(1),
            },
            intent: { participantBlockId: blockId },
          };
    await expect(commands.execute(command)).resolves.toMatchObject({
      status: 'error',
      error: { code: 'forbidden' },
    });
    expect((await blockRef.get()).data()).toEqual(before);
    expect((await firestore.collection('activity_logs').get()).size).toBe(logsBefore);
    expect((await firestore.collection('command_idempotency').get()).size).toBe(idempotencyBefore);
  });

  it(
    'provisions one self Participant under concurrent retries and exposes it to the picker',
    async () => {
      await firestore.collection('participants').doc(participantId).delete();
      await firestore.collection('users').doc(accountA).set({
        uid: accountA,
        email: 'existing@example.com',
        displayName: 'Existing Emulator Client',
        role: 'user',
        isClientActive: true,
      });

      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const environment = {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
      };
      const commands = createProductionCanonicalCommands(environment, executor);
      const makeEnvelope = (
        idempotencyKey: string,
        value: string
      ): CommandEnvelope<'provision_self_participant'> => ({
        kind: 'provision_self_participant',
        context: {
          actor: accountCommandActor(accountA),
          exercisedCapability: 'account_owner',
          idempotencyKey,
          correlationId: CorrelationIdSchema.parse(value),
          source: 'client_callable',
        },
        intent: {},
      });

      const [first, second] = await Promise.all([
        commands.execute(
          makeEnvelope('concurrent-self-provision-a', 'correlation_self_emulator_01')
        ),
        commands.execute(
          makeEnvelope('concurrent-self-provision-b', 'correlation_self_emulator_02')
        ),
      ]);

      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const selfParticipantId = selfParticipantIdFromAccountId(accountA);
      const selfManagementId = participantManagementIdFromSelfProvisioning(accountA);
      const [participants, managements, guard, account, picker] = await Promise.all([
        firestore.collection('participants').where('participantId', '==', selfParticipantId).get(),
        firestore
          .collection('participant_management')
          .where('accountId', '==', accountA)
          .where('authority', '==', 'self')
          .get(),
        firestore.collection('participant_management_active_owner').doc(selfParticipantId).get(),
        firestore.collection('users').doc(accountA).get(),
        queryManagedParticipantPickerReadModels(firestore, accountA),
      ]);

      expect(participants.docs).toHaveLength(1);
      expect(managements.docs).toHaveLength(1);
      expect(managements.docs[0]?.id).toBe(selfManagementId);
      expect(guard.exists).toBe(true);
      expect(account.data()?.accountId).toBe(accountA);
      expect(picker.items).toEqual([
        expect.objectContaining({
          participantId: selfParticipantId,
          displayName: 'Existing Emulator Client',
          authority: 'self',
        }),
      ]);
    },
    30_000
  );

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
