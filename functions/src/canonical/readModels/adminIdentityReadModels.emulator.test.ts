import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryAdminIdentityReadModels } from './adminIdentityReadModels';
import { INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX } from './instructorPresentationAvatar';

const PROJECT_ID = 'ski-academy-admin-identity-avatar-emulator';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;

const adminAccountId = AccountIdSchema.parse('account_admin_identity_avatar_em_01');
const instructorId = InstructorIdSchema.parse('instructor_identity_avatar_em_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_identity_avatar_em_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const actor = { kind: 'administrator' as const, accountId: adminAccountId };

let app: App;
let firestore: Firestore;

describeEmulator('admin identity instructor avatar Firestore emulator', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    const instructors = await firestore.collection('instructors').get();
    const users = await firestore.collection('users').get();
    const batch = firestore.batch();
    for (const doc of [...instructors.docs, ...users.docs]) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    await firestore
      .collection('users')
      .doc(adminAccountId)
      .set({
        ...AccountSchema.parse({
          accountId: adminAccountId,
          lifecycle: { status: 'active' },
          revision: 1,
          createdAt,
          updatedAt: createdAt,
          audit: {
            createdByCommandId: 'command_seed',
            lastChangedByCommandId: 'command_seed',
            correlationId,
          },
        }),
        displayName: 'Admin',
        role: 'admin',
      });

    await firestore
      .collection('instructors')
      .doc(instructorId)
      .set({
        instructorId,
        id: instructorId,
        name: 'Emulator Legacy Avatar Coach',
        specialty: 'both',
        pricePerHourKZT: 18_000,
        isAvailable: true,
        revision: 1,
        avatarUrl: `data:image/jpeg;base64,${'B'.repeat(INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX)}`,
      });
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it('returns admin_instructor_detail successfully while omitting oversized/data avatarUrl', async () => {
    const result = await queryAdminIdentityReadModels(firestore, actor, {
      scope: 'admin_instructor_detail',
      instructorId,
    });
    expect(result.scope).toBe('admin_instructor_detail');
    if (result.scope !== 'admin_instructor_detail') return;
    expect(result.item).toMatchObject({
      instructorId,
      name: 'Emulator Legacy Avatar Coach',
      specialty: 'both',
      isAvailable: true,
      pricePerHourKZT: 18_000,
    });
    expect(result.item).not.toHaveProperty('avatarUrl');
  }, 30_000);
});
