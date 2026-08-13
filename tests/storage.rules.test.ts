import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupEmulatorTestEnvironment,
  initializeEmulatorTestEnvironment,
} from './helpers/firebaseEmulatorTestEnv';
import {
  assertFails,
  assertSucceeds,
  imageBytes,
  loadFirestoreRules,
  loadStorageRules,
  seedBookingChatFixtures,
  seedCourseGroupChatFixtures,
  seedStorageFirestore,
  STORAGE_ADMIN_ID,
  STORAGE_INSTRUCTOR_USER_ID,
  STORAGE_OTHER_USER_ID,
  STORAGE_RULES_PROJECT_ID,
  STORAGE_USER_ID,
  uploadImage,
  uploadVideo,
  userProfile,
} from './helpers/storageRulesFixtures';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeEmulatorTestEnvironment(
    {
      projectId: STORAGE_RULES_PROJECT_ID,
      firestore: {
        rules: loadFirestoreRules(),
      },
      storage: {
        rules: loadStorageRules(),
      },
    },
    { preserveEmulatorHub: true }
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), 'existing/image.txt'), 'private');
  });
}, 30_000);

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), 'existing/image.txt'), 'private');
  });
});

afterAll(async () => {
  await cleanupEmulatorTestEnvironment(testEnv);
}, 30_000);

describe('storage default deny', () => {
  it('rejects anonymous and authenticated uploads outside allowed paths', async () => {
    const anonymousStorage = testEnv.unauthenticatedContext().storage();
    const authenticatedStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();

    await assertFails(uploadString(ref(anonymousStorage, 'avatars/anonymous.txt'), 'unsafe'));
    await assertFails(uploadString(ref(authenticatedStorage, 'uploads/user-1.txt'), 'unsafe'));
  });

  it('rejects reads of existing objects outside allowed paths', async () => {
    const authenticatedStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    await assertFails(getBytes(ref(authenticatedStorage, 'existing/image.txt')));
  });
});

describe('storage avatars', () => {
  it('allows public reads and owner uploads under 5 MB', async () => {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_USER_ID),
        userProfile(STORAGE_USER_ID, 'user@example.com')
      );
    });

    const ownerStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    const otherStorage = testEnv.authenticatedContext(STORAGE_OTHER_USER_ID).storage();
    const anonymousStorage = testEnv.unauthenticatedContext().storage();

    await expect(
      uploadImage(ownerStorage, `avatars/${STORAGE_USER_ID}`, 5 * 1024 * 1024 - 1)
    ).resolves.toBeDefined();
    await assertSucceeds(getBytes(ref(anonymousStorage, `avatars/${STORAGE_USER_ID}`)));
    await assertFails(uploadImage(otherStorage, `avatars/${STORAGE_USER_ID}`));
    await assertFails(uploadImage(ownerStorage, `avatars/${STORAGE_USER_ID}`, 5 * 1024 * 1024));
    await assertFails(
      uploadBytes(ref(ownerStorage, `avatars/${STORAGE_USER_ID}`), imageBytes(1024), {
        contentType: 'application/pdf',
      })
    );
  });
});

describe('storage courses and instructors', () => {
  beforeEach(async () => {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin')
      );
      await setDoc(
        doc(db, 'users', STORAGE_USER_ID),
        userProfile(STORAGE_USER_ID, 'user@example.com')
      );
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storage = context.storage();
      await uploadString(ref(storage, 'courses/course-1'), 'cover');
      await uploadString(ref(storage, 'instructors/instructor-1'), 'avatar');
    });
  });

  it('allows public reads of course and instructor images', async () => {
    const anonymousStorage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(anonymousStorage, 'courses/course-1')));
    await assertSucceeds(getBytes(ref(anonymousStorage, 'instructors/instructor-1')));
  });

  it('allows admins to upload course and instructor images', async () => {
    const adminStorage = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    const userStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();

    await assertSucceeds(uploadImage(adminStorage, 'courses/course-2'));
    await assertSucceeds(uploadImage(adminStorage, 'instructors/instructor-2'));
    await assertFails(uploadImage(userStorage, 'courses/course-2'));
    await assertFails(uploadImage(userStorage, 'instructors/instructor-2'));
    await assertFails(
      uploadBytes(ref(adminStorage, 'courses/course-3'), imageBytes(1024), {
        contentType: 'application/pdf',
      })
    );
  });
});

describe('storage booking chat media', () => {
  it('allows admins to upload chat media for any booking thread', async () => {
    await seedBookingChatFixtures(testEnv);

    const adminStorage = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    await assertSucceeds(uploadImage(adminStorage, 'chat/booking-chat-1/admin-note.jpg'));
  });

  it('allows booking participants to upload and read chat media', async () => {
    await seedBookingChatFixtures(testEnv);

    const studentStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    const instructorStorage = testEnv.authenticatedContext(STORAGE_INSTRUCTOR_USER_ID).storage();
    const otherStorage = testEnv.authenticatedContext(STORAGE_OTHER_USER_ID).storage();
    const adminStorage = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    const imagePath = 'chat/booking-chat-1/photo.jpg';
    const videoPath = 'chat/booking-chat-1/review.mp4';

    await assertSucceeds(uploadImage(studentStorage, imagePath));
    await assertSucceeds(getBytes(ref(instructorStorage, imagePath)));
    await assertSucceeds(uploadVideo(instructorStorage, videoPath, 50 * 1024 * 1024 - 1));
    await assertSucceeds(getBytes(ref(adminStorage, videoPath)));
    await assertFails(uploadImage(otherStorage, 'chat/booking-chat-1/other.jpg'));
    await assertFails(getBytes(ref(otherStorage, imagePath)));
    await assertFails(
      uploadVideo(studentStorage, 'chat/booking-chat-1/too-large.mp4', 50 * 1024 * 1024)
    );
    await assertFails(
      uploadBytes(ref(studentStorage, 'chat/booking-chat-1/file.txt'), imageBytes(32), {
        contentType: 'text/plain',
      })
    );
  });

  it('allows course group chat participants to exchange media', async () => {
    await seedCourseGroupChatFixtures(testEnv);

    const studentStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    const instructorStorage = testEnv.authenticatedContext(STORAGE_INSTRUCTOR_USER_ID).storage();
    const otherStorage = testEnv.authenticatedContext(STORAGE_OTHER_USER_ID).storage();
    const mediaPath = 'chat/course-group-1/group-photo.jpg';

    await assertSucceeds(uploadImage(studentStorage, mediaPath));
    await assertSucceeds(getBytes(ref(instructorStorage, mediaPath)));
    await assertFails(uploadImage(otherStorage, mediaPath));
  });

  it('rejects cancelled course enrollment chat access', async () => {
    await seedCourseGroupChatFixtures(testEnv);
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(doc(db, 'bookings', `booking_course_${STORAGE_USER_ID}_course-group-1`), {
        id: `booking_course_${STORAGE_USER_ID}_course-group-1`,
        userId: STORAGE_USER_ID,
        courseId: 'course-group-1',
        instructorId: 'course_course-group-1',
        date: '2026-12-01',
        time: '09:00',
        durationHours: 4,
        totalPrice: 100,
        status: 'cancelled',
      });
    });

    const studentStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    await assertFails(uploadImage(studentStorage, 'chat/course-group-1/group-photo.jpg'));
  });
});
