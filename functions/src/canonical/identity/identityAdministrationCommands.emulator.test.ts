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
import { queryAdminIdentityReadModels } from '../readModels/adminIdentityReadModels';

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

  it('enforces owner-only role mutations and excludes uninitialized targets from authorizedActions', async () => {
    const ordinaryAdminId = AccountIdSchema.parse('account_identity_admin_emulator_ordinary');
    const statsId = AccountIdSchema.parse('school_global_stats');
    await firestore.collection('users').doc(ordinaryAdminId).set(
      seedAccount(ordinaryAdminId, { role: 'admin', displayName: 'Ordinary Admin' })
    );
    await firestore.collection('users').doc(statsId).set({
      displayName: 'School Global Stats',
    });
    await firestore.collection('users').doc(targetAccountId).set(
      seedAccount(targetAccountId, { role: 'admin', displayName: 'Demote Target' })
    );

    const ownerActor = { kind: 'administrator' as const, accountId: adminAccountId };
    const ordinaryActor = { kind: 'administrator' as const, accountId: ordinaryAdminId };

    const ownerList = await queryAdminIdentityReadModels(firestore, ownerActor, {
      scope: 'admin_account_list',
      role: 'admin',
      pageSize: 50,
    });
    expect(ownerList.scope).toBe('admin_account_list');
    if (ownerList.scope !== 'admin_account_list') return;
    expect(ownerList.items.some((item) => item.accountId === adminAccountId)).toBe(true);
    const demoteTarget = ownerList.items.find((item) => item.accountId === targetAccountId);
    expect(demoteTarget?.authorizedActions.some((a) => a.kind === 'change_account_role')).toBe(
      true
    );

    const statsDetail = await queryAdminIdentityReadModels(firestore, ownerActor, {
      scope: 'admin_account_detail',
      accountId: statsId,
    });
    expect(statsDetail.scope).toBe('admin_account_detail');
    if (statsDetail.scope !== 'admin_account_detail') return;
    expect(statsDetail.item?.lifecycle).toBe('uninitialized');
    expect(
      statsDetail.item?.authorizedActions.some((a) => a.kind === 'change_account_role')
    ).toBe(false);

    const ordinaryList = await queryAdminIdentityReadModels(firestore, ordinaryActor, {
      scope: 'admin_account_list',
      role: 'admin',
      pageSize: 50,
    });
    expect(ordinaryList.scope).toBe('admin_account_list');
    if (ordinaryList.scope !== 'admin_account_list') return;
    expect(
      ordinaryList.items.every(
        (item) => !item.authorizedActions.some((a) => a.kind === 'change_account_role')
      )
    ).toBe(true);

    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );

    const ordinaryAttempt = await commands.execute({
      kind: 'change_account_role',
      context: {
        ...adminContext('identity-emulator-role-ordinary'),
        actor: accountCommandActor(ordinaryAdminId),
      },
      intent: {
        accountId: targetAccountId,
        role: 'user',
        reasonExplanation: 'Ordinary admin demote',
      },
    });
    expect(ordinaryAttempt.status).toBe('error');

    const demoteRevision = demoteTarget?.authorizedActions.find(
      (a) => a.kind === 'change_account_role'
    )?.expectedRevision;
    expect(demoteRevision).toBeDefined();
    const demote = await commands.execute({
      kind: 'change_account_role',
      context: adminContext('identity-emulator-role-demote', demoteRevision),
      intent: {
        accountId: targetAccountId,
        role: 'user',
        reasonExplanation: 'Owner demote',
      },
    });
    expect(demote.status).toBe('success');
    expect((await firestore.collection('users').doc(targetAccountId).get()).data()).toMatchObject({
      role: 'user',
      lifecycle: { status: 'active' },
    });

    const uninitAttempt = await commands.execute({
      kind: 'change_account_role',
      context: adminContext('identity-emulator-role-uninit', 1),
      intent: {
        accountId: statsId,
        role: 'admin',
        reasonExplanation: 'Promote stats',
      },
    });
    expect(uninitAttempt.status).toBe('error');
    expect((await firestore.collection('users').doc(statsId).get()).data()).toEqual({
      displayName: 'School Global Stats',
    });
  }, 60_000);

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

  it('enforces one Account ↔ one Instructor link and refuses reverse double-link', async () => {
    const accountB = AccountIdSchema.parse('account_identity_admin_emulator_03');
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );
    await firestore.collection('users').doc(accountB).set(seedAccount(accountB, { role: 'user' }));
    await firestore.collection('instructors').doc(instructorId).set({
      instructorId,
      name: 'Emulator Link Coach',
      pricePerHourKZT: 18_000,
      isAvailable: true,
      revision: 1,
    });

    const first = await commands.execute({
      kind: 'link_account_instructor_catalog',
      context: adminContext('identity-emulator-link-a'),
      intent: {
        accountId: targetAccountId,
        instructorId,
        reasonExplanation: 'Emulator link A',
      },
    });
    expect(first.status).toBe('success');

    const reverse = await commands.execute({
      kind: 'link_account_instructor_catalog',
      context: adminContext('identity-emulator-link-b'),
      intent: {
        accountId: accountB,
        instructorId,
        reasonExplanation: 'Emulator reverse link',
      },
    });
    expect(reverse.status).toBe('error');

    const [accountA, accountOther, catalog] = await Promise.all([
      firestore.collection('users').doc(targetAccountId).get(),
      firestore.collection('users').doc(accountB).get(),
      firestore.collection('instructors').doc(instructorId).get(),
    ]);
    expect(accountA.data()).toMatchObject({ instructorId, isInstructor: true });
    expect(accountOther.data()?.instructorId).toBeUndefined();
    expect(catalog.data()).toMatchObject({ linkedAccountId: targetAccountId });
  }, 30_000);

  it('creates and links instructor atomically for an existing Account', async () => {
    const linkedInstructorId = InstructorIdSchema.parse('instructor_identity_admin_emulator_link_create');
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );
    const result = await commands.execute({
      kind: 'create_instructor_catalog_entry',
      context: adminContext('identity-emulator-create-link'),
      intent: {
        instructorId: linkedInstructorId,
        accountId: targetAccountId,
        name: 'Atomic Coach',
        pricePerHourKZT: 22_000,
        specialty: 'both',
        reasonExplanation: 'Emulator account-first create',
      },
    });
    expect(result.status).toBe('success');
    const [account, catalog, participant] = await Promise.all([
      firestore.collection('users').doc(targetAccountId).get(),
      firestore.collection('instructors').doc(linkedInstructorId).get(),
      firestore.collection('participants').doc(participantId).get(),
    ]);
    expect(account.data()).toMatchObject({
      instructorId: linkedInstructorId,
      isInstructor: true,
      role: 'user',
    });
    expect(catalog.data()).toMatchObject({
      linkedAccountId: targetAccountId,
      isAvailable: true,
      pricePerHourKZT: 22_000,
    });
    expect(participant.data()).toMatchObject({
      displayName: 'Dependent',
      skillLevel: 'beginner',
    });
  }, 30_000);

  it('updates legacy instructor without revision field: detail=0 → save → 1 → second save → 2', async () => {
    const legacyInstructorId = InstructorIdSchema.parse(
      'instructor_identity_admin_emulator_missing_rev'
    );
    await firestore.collection('instructors').doc(legacyInstructorId).set({
      instructorId: legacyInstructorId,
      name: 'Legacy Missing Revision Coach',
      specialty: 'both',
      pricePerHourKZT: 21_000,
      isAvailable: true,
      // revision field intentionally absent — production legacy shape
    });

    const rawBefore = (await firestore.collection('instructors').doc(legacyInstructorId).get()).data();
    expect(rawBefore).toBeDefined();
    expect(rawBefore).not.toHaveProperty('revision');

    const detailBefore = await queryAdminIdentityReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_instructor_detail', instructorId: legacyInstructorId }
    );
    expect(detailBefore.scope).toBe('admin_instructor_detail');
    if (detailBefore.scope !== 'admin_instructor_detail') return;
    expect(detailBefore.item?.revision).toBe(0);
    expect(detailBefore.item?.authorizedActions).toEqual(
      expect.arrayContaining([
        { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
        { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
      ])
    );

    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );

    const first = await commands.execute({
      kind: 'update_instructor_catalog_profile',
      context: adminContext('identity-emulator-missing-rev-01', 0),
      intent: {
        instructorId: legacyInstructorId,
        bio: 'First legacy emulator save',
        avatarUrl:
          'https://firebasestorage.googleapis.com/v0/b/bucket/o/instructors%2Fem.jpg?alt=media&token=t',
        reasonExplanation: 'Emulator missing revision first save',
      },
    });
    expect(first.status).toBe('success');
    expect((await firestore.collection('instructors').doc(legacyInstructorId).get()).data()).toMatchObject({
      bio: 'First legacy emulator save',
      revision: 1,
    });

    const detailMid = await queryAdminIdentityReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_instructor_detail', instructorId: legacyInstructorId }
    );
    expect(detailMid.scope).toBe('admin_instructor_detail');
    if (detailMid.scope !== 'admin_instructor_detail') return;
    expect(detailMid.item?.revision).toBe(1);
    expect(detailMid.item?.authorizedActions).toEqual(
      expect.arrayContaining([
        { kind: 'update_instructor_catalog_profile', expectedRevision: 1 },
      ])
    );

    const second = await commands.execute({
      kind: 'update_instructor_catalog_profile',
      context: adminContext('identity-emulator-missing-rev-02', 1),
      intent: {
        instructorId: legacyInstructorId,
        bio: 'Second legacy emulator save',
        reasonExplanation: 'Emulator missing revision second save',
      },
    });
    expect(second.status).toBe('success');
    expect((await firestore.collection('instructors').doc(legacyInstructorId).get()).data()).toMatchObject({
      bio: 'Second legacy emulator save',
      revision: 2,
    });

    const stale = await commands.execute({
      kind: 'update_instructor_catalog_profile',
      context: adminContext('identity-emulator-missing-rev-stale', 0),
      intent: {
        instructorId: legacyInstructorId,
        bio: 'Should not apply',
        reasonExplanation: 'Emulator genuine stale',
      },
    });
    expect(stale.status).toBe('error');
    if (stale.status === 'error') {
      expect(stale.error.code).toBe('stale_version');
      expect(stale.error.currentRevision).toBe(2);
    }

    const zeroCaseId = InstructorIdSchema.parse('instructor_identity_admin_emulator_zero_rev');
    await firestore.collection('instructors').doc(zeroCaseId).set({
      instructorId: zeroCaseId,
      name: 'Explicit Zero Revision Coach',
      specialty: 'ski',
      pricePerHourKZT: 16_000,
      isAvailable: true,
      revision: 0,
    });
    const zeroUpdate = await commands.execute({
      kind: 'update_instructor_catalog_profile',
      context: adminContext('identity-emulator-zero-rev-01', 0),
      intent: {
        instructorId: zeroCaseId,
        bio: 'Explicit zero first save',
        reasonExplanation: 'Emulator explicit revision 0',
      },
    });
    expect(zeroUpdate.status).toBe('success');
    expect((await firestore.collection('instructors').doc(zeroCaseId).get()).data()).toMatchObject({
      bio: 'Explicit zero first save',
      revision: 1,
    });
  }, 60_000);

  it('updates symmetrically linked instructor with missing revision and oversized legacy avatar', async () => {
    const linkedInstructorId = InstructorIdSchema.parse('ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2');
    const linkedAccount = AccountIdSchema.parse('X9vUp3gIrbNFWUpWsEzvLCAEh7q2');
    const legacyAvatar = `data:image/jpeg;base64,${'B'.repeat(2_500)}`;
    const nextAvatar =
      'https://firebasestorage.googleapis.com/v0/b/bucket/o/instructors%2Fem-ok.jpg?alt=media&token=t';

    await firestore.collection('users').doc(linkedAccount).set(
      seedAccount(linkedAccount, {
        role: 'user',
        instructorId: linkedInstructorId,
        isInstructor: true,
      })
    );
    await firestore.collection('instructors').doc(linkedInstructorId).set({
      instructorId: linkedInstructorId,
      name: 'Арсений Герасимчук',
      specialty: 'both',
      languages: ['Русский'],
      experienceYears: 10,
      pricePerHourKZT: 30_000,
      phoneNumber: '+77055492235',
      isAvailable: true,
      linkedAccountId: linkedAccount,
      avatarUrl: legacyAvatar,
      // revision intentionally absent
    });

    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );

    const detailBefore = await queryAdminIdentityReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_instructor_detail', instructorId: linkedInstructorId }
    );
    expect(detailBefore.scope).toBe('admin_instructor_detail');
    if (detailBefore.scope !== 'admin_instructor_detail') return;
    expect(detailBefore.item?.revision).toBe(0);
    expect(detailBefore.item?.linkedAccountId).toBe(linkedAccount);
    expect(detailBefore.item).not.toHaveProperty('avatarUrl');
    expect(detailBefore.item?.authorizedActions).toEqual(
      expect.arrayContaining([
        { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
      ])
    );

    const accountRevisionBefore = (
      await firestore.collection('users').doc(linkedAccount).get()
    ).data()?.revision;

    const first = await commands.execute({
      kind: 'update_instructor_catalog_profile',
      context: adminContext('identity-emulator-linked-legacy-01', 0),
      intent: {
        instructorId: linkedInstructorId,
        name: 'Арсений Герасимчук',
        specialty: 'both',
        languages: ['Русский'],
        experienceYears: 10,
        bio: 'Emulator linked profile save',
        avatarUrl: nextAvatar,
        pricePerHourKZT: 30_000,
        phoneNumber: '+77055492235',
        reasonExplanation: 'Emulator profile must succeed on valid 1:1 link',
      },
    });
    expect(first.status).toBe('success');

    const catalogAfter = (await firestore.collection('instructors').doc(linkedInstructorId).get()).data();
    const accountAfter = (await firestore.collection('users').doc(linkedAccount).get()).data();
    expect(catalogAfter).toMatchObject({
      bio: 'Emulator linked profile save',
      avatarUrl: nextAvatar,
      revision: 1,
      linkedAccountId: linkedAccount,
      experienceYears: 10,
    });
    expect(accountAfter).toMatchObject({
      instructorId: linkedInstructorId,
      isInstructor: true,
      revision: accountRevisionBefore,
    });

    const second = await commands.execute({
      kind: 'update_instructor_catalog_profile',
      context: adminContext('identity-emulator-linked-legacy-02', 1),
      intent: {
        instructorId: linkedInstructorId,
        bio: 'Second emulator linked save',
        reasonExplanation: 'Emulator second profile save',
      },
    });
    expect(second.status).toBe('success');
    expect((await firestore.collection('instructors').doc(linkedInstructorId).get()).data()).toMatchObject({
      bio: 'Second emulator linked save',
      revision: 2,
      linkedAccountId: linkedAccount,
    });
  }, 60_000);
});
