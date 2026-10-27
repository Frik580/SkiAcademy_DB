import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readRepoFile } from './readRepoFile';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { E2E_PROJECT_ID } from '../../e2e/emulator-config';
import {
  BookingSchema,
  ParticipantManagementActiveOwnerGuardSchema,
} from '@ski-academy/shared-domain';
import { canonicalBookingCollaborationFixtures } from '@ski-academy/shared-domain/testing';

export const STORAGE_RULES_PROJECT_ID = E2E_PROJECT_ID;

export const STORAGE_USER_ID = 'user-1';
export const STORAGE_OTHER_USER_ID = 'user-2';
export const STORAGE_ADMIN_ID = 'admin-1';
export const STORAGE_INSTRUCTOR_USER_ID = 'instructor-user-1';
export const STORAGE_TEST_ACTOR_ID = 'test-actor-1';
export const STORAGE_TEST_ACTOR_B_ID = 'test-actor-2';
export const STORAGE_TEST_SESSION_A = 'test_session_a';
export const STORAGE_TEST_SESSION_B = 'test_session_b';

export const userProfile = (
  uid: string,
  email: string,
  role: 'user' | 'admin' = 'user',
  extra: Record<string, unknown> = {}
) => ({
  uid,
  email,
  displayName: uid,
  role,
  avatarUrl: '',
  balanceUSD: 100,
  ...extra,
});

export const imageBytes = (size: number) => new Uint8Array(size);

export const uploadImage = (
  storage: ReturnType<RulesTestEnvironment['authenticatedContext']>['storage'],
  path: string,
  size = 1024
) =>
  uploadBytes(ref(storage, path), imageBytes(size), {
    contentType: 'image/jpeg',
  });

export const uploadVideo = (
  storage: ReturnType<RulesTestEnvironment['authenticatedContext']>['storage'],
  path: string,
  size = 1024
) =>
  uploadBytes(ref(storage, path), imageBytes(size), {
    contentType: 'video/mp4',
  });

export async function seedStorageFirestore(
  testEnv: RulesTestEnvironment,
  callback: (
    db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']
  ) => Promise<void>
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await callback(context.firestore());
  });
}

export async function seedLegacyBookingChatFixtures(testEnv: RulesTestEnvironment) {
  await seedStorageFirestore(testEnv, async (db) => {
    await setDoc(
      doc(db, 'users', STORAGE_USER_ID),
      userProfile(STORAGE_USER_ID, 'user@example.com')
    );
    await setDoc(doc(db, 'users', STORAGE_OTHER_USER_ID), {
      ...userProfile(STORAGE_OTHER_USER_ID, 'other@example.com'),
    });
    await setDoc(
      doc(db, 'users', STORAGE_ADMIN_ID),
      userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin')
    );
    await setDoc(doc(db, 'users', STORAGE_INSTRUCTOR_USER_ID), {
      ...userProfile(STORAGE_INSTRUCTOR_USER_ID, 'instructor@example.com'),
      instructorId: 'instructor-1',
    });
    await setDoc(doc(db, 'bookings', 'booking-chat-1'), {
      id: 'booking-chat-1',
      userId: STORAGE_USER_ID,
      instructorId: 'instructor-1',
      date: '2026-12-01',
      time: '09:00',
      durationHours: 1,
      totalPrice: 50,
      status: 'confirmed',
    });
    await setDoc(doc(db, 'settings', 'availability_slots_migration'), { complete: true });
  });
}

// Schema-validated canonical records: deliberately no legacy userId/instructorId.
export const canonicalStorageBooking = BookingSchema.parse({
  ...canonicalBookingCollaborationFixtures.familyGroupBooking,
  bookingId: 'booking_storage_canonical',
  payerAccountId: STORAGE_OTHER_USER_ID,
  occurrence: {
    ...canonicalBookingCollaborationFixtures.familyGroupBooking.occurrence,
    instructorId: 'instructor-1',
  },
});

export async function seedCanonicalBookingChatFixtures(testEnv: RulesTestEnvironment) {
  await seedStorageFirestore(testEnv, async (db) => {
    for (const [uid, extra] of [
      [STORAGE_USER_ID, {}],
      [STORAGE_OTHER_USER_ID, {}],
      [STORAGE_ADMIN_ID, { role: 'admin' }],
      [STORAGE_INSTRUCTOR_USER_ID, { instructorId: 'instructor-1' }],
      ['second-participant-owner', {}],
      ['unassigned-instructor', { instructorId: 'instructor-2' }],
    ] as const) {
      await setDoc(
        doc(db, 'users', uid),
        userProfile(uid, `${uid}@example.com`, 'user', {
          lifecycle: { status: 'active' },
          ...extra,
        })
      );
    }
    await setDoc(doc(db, 'bookings', canonicalStorageBooking.bookingId), canonicalStorageBooking);
    for (const [index, participantId] of canonicalStorageBooking.party.participantIds.entries()) {
      await setDoc(
        doc(db, 'participant_management_active_owner', participantId),
        ParticipantManagementActiveOwnerGuardSchema.parse({
          participantId,
          accountId: index === 0 ? STORAGE_USER_ID : 'second-participant-owner',
          participantManagementId: `management_storage_${index}`,
          managementRevision: 1,
          updatedAt: canonicalStorageBooking.updatedAt,
          lastChangedByCommandId: 'command_storage_fixture',
          correlationId: 'correlation_storage_fixture',
        })
      );
    }
  });
}

export async function seedCourseGroupChatFixtures(testEnv: RulesTestEnvironment) {
  await seedCanonicalBookingChatFixtures(testEnv);
  await seedStorageFirestore(testEnv, async (db) => {
    await setDoc(doc(db, 'courses', 'course-group-1'), {
      title: 'Group Course',
      totalSeats: 10,
      availableSeats: 9,
      price: 100,
      instructorIds: ['instructor-1'],
    });
    await setDoc(doc(db, 'course_chat_access', STORAGE_USER_ID, 'courses', 'course-group-1'), {
      accountId: STORAGE_USER_ID,
      courseId: 'course-group-1',
      activeCount: 1,
    });
  });
}

export async function seedTestStorageIsolationFixtures(testEnv: RulesTestEnvironment) {
  await seedCanonicalBookingChatFixtures(testEnv);
  await seedStorageFirestore(testEnv, async (db) => {
    await setDoc(doc(db, 'users', STORAGE_TEST_ACTOR_ID), {
      ...userProfile(STORAGE_TEST_ACTOR_ID, 'test-actor-a@example.com'),
      instructorId: 'test-instructor-a',
    });
    await setDoc(doc(db, 'users', STORAGE_TEST_ACTOR_B_ID), {
      ...userProfile(STORAGE_TEST_ACTOR_B_ID, 'test-actor-b@example.com'),
    });
    await setDoc(doc(db, 'test_actors', STORAGE_TEST_ACTOR_ID), { allowed: true });
    await setDoc(doc(db, 'test_actors', STORAGE_TEST_ACTOR_B_ID), { allowed: true });
    await setDoc(doc(db, 'test_sessions', STORAGE_TEST_SESSION_A), { status: 'active' });
    await setDoc(doc(db, 'test_sessions', STORAGE_TEST_SESSION_B), { status: 'active' });
    await setDoc(
      doc(db, 'test_sessions', STORAGE_TEST_SESSION_A, 'membership', STORAGE_TEST_ACTOR_ID),
      { accountId: STORAGE_TEST_ACTOR_ID }
    );
    await setDoc(doc(db, 'test_sessions', STORAGE_TEST_SESSION_A, 'membership', STORAGE_ADMIN_ID), {
      accountId: STORAGE_ADMIN_ID,
    });
    await setDoc(
      doc(db, 'test_sessions', STORAGE_TEST_SESSION_B, 'membership', STORAGE_TEST_ACTOR_B_ID),
      { accountId: STORAGE_TEST_ACTOR_B_ID }
    );
    for (const [bookingId, uid, instructorId, sessionId] of [
      ['booking_test_a', STORAGE_TEST_ACTOR_ID, 'test-instructor-a', STORAGE_TEST_SESSION_A],
      ['booking_test_b', STORAGE_TEST_ACTOR_B_ID, 'test-instructor-b', STORAGE_TEST_SESSION_B],
    ] as const) {
      const participantId = `participant_${bookingId}`;
      await setDoc(
        doc(db, 'bookings', bookingId),
        BookingSchema.parse({
          ...canonicalStorageBooking,
          bookingId,
          dataScope: 'test',
          testSessionId: sessionId,
          party: { kind: 'individual', participantIds: [participantId] },
          occurrence: {
            ...canonicalStorageBooking.occurrence,
            instructorId,
            serviceParty: { participantIds: [participantId] },
          },
        })
      );
      await setDoc(doc(db, 'participant_management_active_owner', participantId), {
        participantId,
        accountId: uid,
        participantManagementId: `management_${bookingId}`,
        managementRevision: 1,
      });
    }
    await setDoc(doc(db, 'courses', 'course_test_a'), {
      title: 'TEST Course',
      dataScope: 'test',
      testSessionId: STORAGE_TEST_SESSION_A,
      instructorIds: ['test-instructor-a'],
    });
  });
}

export function loadStorageRules(): string {
  return readRepoFile('storage.rules');
}

export function loadFirestoreRules(): string {
  return readRepoFile('firestore.rules');
}

export { assertFails, assertSucceeds };
