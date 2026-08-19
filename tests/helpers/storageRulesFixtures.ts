import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readRepoFile } from './readRepoFile';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

export const STORAGE_RULES_PROJECT_ID = 'ski-school-8f3ca';

export const STORAGE_USER_ID = 'user-1';
export const STORAGE_OTHER_USER_ID = 'user-2';
export const STORAGE_ADMIN_ID = 'admin-1';
export const STORAGE_INSTRUCTOR_USER_ID = 'instructor-user-1';

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

export async function seedBookingChatFixtures(testEnv: RulesTestEnvironment) {
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

export async function seedCourseGroupChatFixtures(testEnv: RulesTestEnvironment) {
  await seedBookingChatFixtures(testEnv);
  await seedStorageFirestore(testEnv, async (db) => {
    await setDoc(doc(db, 'courses', 'course-group-1'), {
      title: 'Group Course',
      totalSeats: 10,
      availableSeats: 9,
      price: 100,
      instructorIds: ['instructor-1'],
    });
    await setDoc(doc(db, 'bookings', `booking_course_${STORAGE_USER_ID}_course-group-1`), {
      id: `booking_course_${STORAGE_USER_ID}_course-group-1`,
      userId: STORAGE_USER_ID,
      courseId: 'course-group-1',
      instructorId: 'course_course-group-1',
      date: '2026-12-01',
      time: '09:00',
      durationHours: 4,
      totalPrice: 100,
      status: 'confirmed',
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
