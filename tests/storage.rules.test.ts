import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { randomUUID } from 'node:crypto';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import {
  getBytes,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadString,
  updateMetadata,
  deleteObject,
} from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  seedCanonicalBookingChatFixtures,
  canonicalStorageBooking,
  seedCourseGroupChatFixtures,
  seedLegacyBookingChatFixtures,
  seedStorageFirestore,
  STORAGE_ADMIN_ID,
  STORAGE_INSTRUCTOR_USER_ID,
  STORAGE_OTHER_USER_ID,
  STORAGE_RULES_PROJECT_ID,
  STORAGE_TEST_ACTOR_B_ID,
  STORAGE_TEST_ACTOR_ID,
  STORAGE_TEST_SESSION_A,
  STORAGE_TEST_SESSION_B,
  STORAGE_USER_ID,
  seedTestStorageIsolationFixtures,
  uploadImage,
  uploadVideo,
  userProfile,
} from './helpers/storageRulesFixtures';

let testEnv: RulesTestEnvironment;
let restoreSetupFetch: (() => void) | undefined;

describe('CA-SEC-05B Account role consistency', () => {
  const paths = () => [
    `lesson-levels/security/${STORAGE_ADMIN_ID}/${randomUUID()}`,
    `kaspi-qr/${STORAGE_ADMIN_ID}/${randomUUID()}`,
  ];
  it.each([
    ['owner-only', { role: 'user', systemRole: 'owner' }],
    ['legacy administrator', { role: 'admin' }],
    [
      'disabled administrator',
      { accountId: STORAGE_ADMIN_ID, role: 'admin', lifecycle: { status: 'disabled' } },
    ],
    [
      'unknown role',
      { accountId: STORAGE_ADMIN_ID, role: 'operator', lifecycle: { status: 'active' } },
    ],
    [
      'unknown status',
      { accountId: STORAGE_ADMIN_ID, role: 'admin', lifecycle: { status: 'unknown' } },
    ],
  ])('denies privileged upload for %s', async (_label, profile) => {
    await seedStorageFirestore(testEnv, async (db) =>
      setDoc(doc(db, 'users', STORAGE_ADMIN_ID), profile)
    );
    const storage = testEnv.authenticatedContext(STORAGE_ADMIN_ID, { admin: true }).storage();
    for (const path of paths()) await assertFails(uploadImage(storage, path));
  });

  it('allows admin without owner and revokes upload after role demotion', async () => {
    await seedStorageFirestore(testEnv, async (db) =>
      setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin')
      )
    );
    const storage = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    for (const path of paths()) await assertSucceeds(uploadImage(storage, path));
    await seedStorageFirestore(testEnv, async (db) =>
      setDoc(doc(db, 'users', STORAGE_ADMIN_ID), userProfile(STORAGE_ADMIN_ID, 'admin@example.com'))
    );
    for (const path of paths()) await assertFails(uploadImage(storage, path));
  });
});

beforeAll(async () => {
  // initializeTestEnvironment awaits these administrative HTTP requests before
  // creating the environment. Record their boundaries to locate a hook timeout.
  const emulatorFetch = globalThis.fetch;
  const setupFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
    const [input] = args;
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    const phases: Record<string, string> = {
      '/emulators': 'Hub discovery',
      '/internal/setRules': 'Storage Rules upload',
    };
    const phase =
      phases[url.pathname] ??
      (url.pathname.endsWith(':securityRules') ? 'Firestore Rules upload' : undefined);
    if (!phase) return emulatorFetch(...args);
    const started = Date.now();
    console.info(`[Storage setup] ${phase}: started (${url.origin})`);
    try {
      const response = await emulatorFetch(...args);
      console.info(`[Storage setup] ${phase}: HTTP ${response.status} (${Date.now() - started}ms)`);
      return response;
    } catch (error) {
      console.error(`[Storage setup] ${phase}: failed (${Date.now() - started}ms)`, error);
      throw error;
    }
  });
  restoreSetupFetch = () => setupFetch.mockRestore();
  try {
    console.info('[Storage setup] initializeTestEnvironment: started');
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

    console.info('[Storage setup] RulesTestEnvironment created; initial SDK upload: started');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(), 'existing/image.txt'), 'private');
    });
    console.info('[Storage setup] initial SDK upload: completed');
  } finally {
    restoreSetupFetch();
  }
}, 30_000);

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), 'existing/image.txt'), 'private');
  });
});

afterAll(async () => {
  // A timed-out hook can still have an unresolved request.
  restoreSetupFetch?.();
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

describe('storage Kaspi immutable QR', () => {
  const newPath = () => `kaspi-qr/${STORAGE_ADMIN_ID}/${randomUUID()}`;
  async function adminStorage() {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin')
      );
    });
    return testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
  }
  it('allows admin create and private draft read, denies anonymous/ordinary upload', async () => {
    const path = newPath();
    const admin = await adminStorage();
    await assertSucceeds(uploadImage(admin, path));
    await assertSucceeds(getBytes(ref(admin, path)));
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
    await assertFails(uploadImage(testEnv.unauthenticatedContext().storage(), newPath()));
    await assertFails(
      uploadImage(testEnv.authenticatedContext(STORAGE_USER_ID).storage(), newPath())
    );
  });
  it('denies MIME, size, cross-owner path, overwrite, metadata update and deletion', async () => {
    const path = newPath();
    const admin = await adminStorage();
    await assertFails(
      uploadBytes(ref(admin, path), imageBytes(10), { contentType: 'image/svg+xml' })
    );
    await assertFails(uploadImage(admin, path, 5 * 1024 * 1024));
    await assertFails(uploadImage(admin, path, 0));
    await assertFails(uploadImage(admin, path.replace(STORAGE_ADMIN_ID, 'another-admin')));
    await assertSucceeds(uploadImage(admin, path));
    await assertFails(uploadImage(admin, path));
    await assertFails(updateMetadata(ref(admin, path), { contentType: 'image/png' }));
    await assertFails(deleteObject(ref(admin, path)));
  });
  it('allows only the supported declared image types up to the strict size boundary', async () => {
    const admin = await adminStorage();
    const bytes = imageBytes(5 * 1024 * 1024 - 1);
    for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
      await assertSucceeds(uploadBytes(ref(admin, newPath()), bytes, { contentType }));
    }
  });
  it('publishes only the configured QR for guest reads, independently from payment availability', async () => {
    const path = newPath();
    const admin = await adminStorage();
    await uploadImage(admin, path);
    const anonymous = testEnv.unauthenticatedContext().storage();
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(doc(db, 'payment_configuration/kaspi_manual'), {
        enabled: false,
        qrStoragePath: path,
      });
    });
    await assertSucceeds(getBytes(ref(anonymous, path)));
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(doc(db, 'payment_configuration/kaspi_manual'), {
        enabled: true,
        qrStoragePath: 'different',
      });
    });
    await assertFails(getBytes(ref(anonymous, path)));
  });
  it('denies private LIVE QR reads after registration as a TEST actor', async () => {
    const path = newPath();
    const admin = await adminStorage();
    await assertSucceeds(uploadImage(admin, path));
    await assertSucceeds(getBytes(ref(admin, path)));
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(doc(db, 'test_actors', STORAGE_ADMIN_ID), { allowed: true });
    });
    await assertFails(getBytes(ref(admin, path)));
    await assertFails(uploadImage(admin, newPath()));
  });
  it('denies disabled administrator uploads', async () => {
    const path = newPath();
    const admin = await adminStorage();
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin', {
          lifecycle: { status: 'disabled' },
        })
      );
    });
    await assertFails(uploadImage(admin, path));
  });
});

describe('storage avatars', () => {
  beforeEach(async () => {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_USER_ID),
        userProfile(STORAGE_USER_ID, 'user@example.com')
      );
      await setDoc(
        doc(db, 'users', STORAGE_OTHER_USER_ID),
        userProfile(STORAGE_OTHER_USER_ID, 'other@example.com')
      );
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadImage(context.storage(), `avatars/${STORAGE_USER_ID}`);
    });
  });

  it('keeps historical public reads', async () => {
    const anonymousStorage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(anonymousStorage, `avatars/${STORAGE_USER_ID}`)));
    await assertSucceeds(getDownloadURL(ref(anonymousStorage, `avatars/${STORAGE_USER_ID}`)));
  });

  // CA-SEC-06A: Rules can only see the declared contentType, so this public path
  // no longer accepts any write (see storage.rules). Byte classification for
  // every LIVE image now happens in the protectedImages Function.
  it.each([
    ['owner', STORAGE_USER_ID],
    ['other user', STORAGE_OTHER_USER_ID],
    [null, null],
  ])('denies every write by %s on the legacy avatar path', async (_label, uid) => {
    const storage = uid
      ? testEnv.authenticatedContext(uid).storage()
      : testEnv.unauthenticatedContext().storage();
    for (const contentType of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
      'image/gif',
      'image/heic',
      'text/html',
      'application/octet-stream',
    ]) {
      await assertFails(
        uploadBytes(ref(storage, `avatars/${STORAGE_USER_ID}`), imageBytes(64), { contentType })
      );
    }
    await assertFails(
      updateMetadata(ref(storage, `avatars/${STORAGE_USER_ID}`), { contentType: 'image/png' })
    );
    await assertFails(deleteObject(ref(storage, `avatars/${STORAGE_USER_ID}`)));
  });
});

describe('storage courses and instructors', () => {
  it('requires admin role for an owner and denies ordinary and disabled accounts', async () => {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', 'owner-only'),
        userProfile('owner-only', 'owner@example.com', 'user', {
          systemRole: 'owner',
          lifecycle: { status: 'active' },
        })
      );
      await setDoc(doc(db, 'users', 'ordinary'), userProfile('ordinary', 'user@example.com'));
    });
    const owner = testEnv.authenticatedContext('owner-only').storage();
    await assertFails(uploadImage(owner, 'courses/owner-security-test'));
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', 'owner-only'),
        userProfile('owner-only', 'owner@example.com', 'admin', { systemRole: 'owner' })
      );
    });
    await assertFails(uploadImage(owner, 'courses/owner-admin-security-test'));
    await assertFails(
      uploadImage(
        testEnv.authenticatedContext('ordinary').storage(),
        'courses/owner-security-forged'
      )
    );
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', 'owner-only'),
        userProfile('owner-only', 'owner@example.com', 'admin', {
          systemRole: 'owner',
          lifecycle: { status: 'disabled' },
        })
      );
    });
    await assertFails(uploadImage(owner, 'courses/owner-security-disabled'));
  });
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

  it('routes catalog image uploads through server authorization', async () => {
    const adminStorage = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    const userStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();

    await assertFails(uploadImage(adminStorage, 'courses/course-2'));
    await assertFails(uploadImage(adminStorage, 'instructors/instructor-2'));
    await assertFails(uploadImage(userStorage, 'courses/course-2'));
    await assertFails(uploadImage(userStorage, 'instructors/instructor-2'));
    await assertFails(
      uploadBytes(ref(adminStorage, 'courses/course-3'), imageBytes(1024), {
        contentType: 'application/pdf',
      })
    );
  });
});

describe('private chat media gateway boundary', () => {
  it.each([
    STORAGE_USER_ID,
    'second-participant-owner',
    STORAGE_INSTRUCTOR_USER_ID,
    STORAGE_ADMIN_ID,
    STORAGE_OTHER_USER_ID,
    'unassigned-instructor',
    null,
  ])('denies direct canonical SDK reads, metadata and uploads for %s', async (uid) => {
    await seedCanonicalBookingChatFixtures(testEnv);
    const path = `chat/${canonicalStorageBooking.bookingId}/photo.jpg`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadImage(context.storage(), path);
    });
    const storage = uid
      ? testEnv.authenticatedContext(uid).storage()
      : testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, path)));
    await assertFails(getDownloadURL(ref(storage, path)));
    await assertFails(uploadImage(storage, path));
    await assertFails(uploadVideo(storage, path));
  });

  it('contains legacy Booking and course direct access after gateway cutover', async () => {
    await seedCourseGroupChatFixtures(testEnv);
    await seedLegacyBookingChatFixtures(testEnv);
    for (const uid of [STORAGE_USER_ID, STORAGE_INSTRUCTOR_USER_ID, STORAGE_ADMIN_ID]) {
      const storage = testEnv.authenticatedContext(uid).storage();
      await assertFails(uploadImage(storage, 'chat/booking-chat-1/photo.jpg'));
      await assertFails(uploadVideo(storage, 'chat/course-group-1/video.mp4'));
    }
  });

  it('documents the release blocker: historical bearer tokens survive Rules denial', async () => {
    const path = 'chat/historical-booking/photo.jpg';
    let url = '';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadImage(context.storage(), path);
      url = await getDownloadURL(ref(context.storage(), path));
    });
    expect(['127.0.0.1', 'localhost']).toContain(new URL(url).hostname);
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
    const response = await fetch(url);
    await response.arrayBuffer();
    // This is evidence for the mandatory historical-token retirement gate, not a secure outcome.
    expect(response.status).toBe(200);
  });
});

describe('storage participant avatars', () => {
  const selfParticipantId = 'participant_self_avatar';
  const dependentParticipantId = 'participant_dependent_avatar';
  const foreignParticipantId = 'participant_foreign_avatar';

  beforeEach(async () => {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_USER_ID),
        userProfile(STORAGE_USER_ID, 'user@example.com')
      );
      await setDoc(
        doc(db, 'users', STORAGE_OTHER_USER_ID),
        userProfile(STORAGE_OTHER_USER_ID, 'other@example.com')
      );
      await setDoc(doc(db, 'participant_management_active_owner', selfParticipantId), {
        participantId: selfParticipantId,
        accountId: STORAGE_USER_ID,
        participantManagementId: 'management_self_avatar',
        managementRevision: 1,
      });
      await setDoc(doc(db, 'participant_management_active_owner', dependentParticipantId), {
        participantId: dependentParticipantId,
        accountId: STORAGE_USER_ID,
        participantManagementId: 'management_dependent_avatar',
        managementRevision: 1,
      });
      await setDoc(doc(db, 'participant_management_active_owner', foreignParticipantId), {
        participantId: foreignParticipantId,
        accountId: STORAGE_OTHER_USER_ID,
        participantManagementId: 'management_foreign_avatar',
        managementRevision: 1,
      });
    });
  });

  it('keeps LIVE avatars public and requires server authorization for uploads', async () => {
    const ownerStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    const anonymousStorage = testEnv.unauthenticatedContext().storage();

    await assertFails(
      uploadImage(ownerStorage, `participant-avatars/${selfParticipantId}/avatar.jpg`)
    );
    await assertFails(
      uploadImage(ownerStorage, `participant-avatars/${dependentParticipantId}/avatar.jpg`)
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadImage(context.storage(), `participant-avatars/${selfParticipantId}/avatar.jpg`);
    });
    await assertSucceeds(
      getBytes(ref(anonymousStorage, `participant-avatars/${selfParticipantId}/avatar.jpg`))
    );
  });

  it('denies unauthenticated, foreign, and arbitrary participant avatar uploads', async () => {
    const ownerStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    const otherStorage = testEnv.authenticatedContext(STORAGE_OTHER_USER_ID).storage();
    const anonymousStorage = testEnv.unauthenticatedContext().storage();

    await assertFails(
      uploadImage(anonymousStorage, `participant-avatars/${selfParticipantId}/avatar.jpg`)
    );
    await assertFails(
      uploadImage(otherStorage, `participant-avatars/${selfParticipantId}/avatar.jpg`)
    );
    await assertFails(
      uploadImage(ownerStorage, `participant-avatars/${foreignParticipantId}/avatar.jpg`)
    );
    await assertFails(
      uploadImage(ownerStorage, 'participant-avatars/participant_unknown/avatar.jpg')
    );
    await assertFails(
      uploadImage(otherStorage, `participant-avatars/${dependentParticipantId}/avatar.jpg`)
    );
  });
});

describe('storage TEST namespace isolation', () => {
  it('closes direct TEST chat access and preserves other namespace isolation', async () => {
    await seedTestStorageIsolationFixtures(testEnv);

    const actorA = testEnv.authenticatedContext(STORAGE_TEST_ACTOR_ID).storage();
    const actorB = testEnv.authenticatedContext(STORAGE_TEST_ACTOR_B_ID).storage();
    const liveCustomer = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    const adminWithContext = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    const testChatA = `test-sessions/${STORAGE_TEST_SESSION_A}/booking-chat/booking_test_a/photo.jpg`;
    const testChatB = `test-sessions/${STORAGE_TEST_SESSION_B}/booking-chat/booking_test_a/photo.jpg`;
    const liveChat = 'chat/booking-chat-1/live.jpg';
    const liveCourse = 'courses/course-live-deny.webp';
    const liveParticipant = 'participant-avatars/participant_self_avatar/avatar.jpg';
    const testCover = `test-sessions/${STORAGE_TEST_SESSION_A}/course-assets/course_test_a/cover.webp`;
    const actorAvatar = `test-actors/${STORAGE_TEST_ACTOR_ID}/avatar`;

    await assertFails(uploadImage(actorA, testChatA));
    await assertFails(getBytes(ref(actorA, testChatA)));
    await assertFails(uploadImage(adminWithContext, testChatA));
    await assertFails(uploadImage(adminWithContext, testCover));
    await assertFails(uploadImage(actorA, actorAvatar));

    await assertFails(uploadImage(actorB, testChatA));
    await assertFails(getBytes(ref(actorB, testChatA)));
    await assertFails(uploadImage(actorA, testChatB));
    await assertFails(uploadImage(liveCustomer, testChatA));
    await assertFails(getBytes(ref(liveCustomer, testChatA)));
    await assertFails(uploadImage(actorA, liveChat));
    await assertFails(uploadImage(actorA, liveCourse));
    await assertFails(uploadImage(actorA, liveParticipant));
  }, 30_000);

  it('denies admin TEST session writes without membership and locked sessions', async () => {
    await seedTestStorageIsolationFixtures(testEnv);

    await seedStorageFirestore(testEnv, async (db) => {
      await deleteDoc(
        doc(db, 'test_sessions', STORAGE_TEST_SESSION_A, 'membership', STORAGE_ADMIN_ID)
      );
    });
    const adminWithoutContext = testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
    await assertFails(
      uploadImage(
        adminWithoutContext,
        `test-sessions/${STORAGE_TEST_SESSION_A}/booking-chat/booking_test_a/admin.jpg`
      )
    );

    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'test_sessions', STORAGE_TEST_SESSION_A, 'membership', STORAGE_ADMIN_ID),
        { accountId: STORAGE_ADMIN_ID }
      );
      await setDoc(doc(db, 'test_sessions', STORAGE_TEST_SESSION_A), { status: 'locked' });
    });
    await assertFails(
      uploadImage(
        adminWithoutContext,
        `test-sessions/${STORAGE_TEST_SESSION_A}/booking-chat/booking_test_a/locked.jpg`
      )
    );
  });

  it('does not grant chat access through leftover course_* instructorId bookings', async () => {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(doc(db, 'bookings', 'booking-course-star'), {
        id: 'booking-course-star',
        userId: STORAGE_OTHER_USER_ID,
        instructorId: 'course_legacy_group',
        courseId: 'course-group-1',
        status: 'confirmed',
      });
    });
    await seedCourseGroupChatFixtures(testEnv);
    await seedTestStorageIsolationFixtures(testEnv);

    const studentStorage = testEnv.authenticatedContext(STORAGE_USER_ID).storage();
    await assertFails(uploadImage(studentStorage, 'chat/booking-course-star/photo.jpg'));
  });
});

describe('lesson level immutable logos', () => {
  const path = () => `lesson-levels/beginner/${STORAGE_ADMIN_ID}/${randomUUID()}`;
  async function admin() {
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin', {
          lifecycle: { status: 'active' },
        })
      );
    });
    return testEnv.authenticatedContext(STORAGE_ADMIN_ID).storage();
  }
  it('allows active administrators to create supported images and everyone to read, but denies mutations', async () => {
    const storage = await admin();
    for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
      const target = ref(storage, path());
      await assertSucceeds(uploadBytes(target, imageBytes(2097152), { contentType }));
      await assertSucceeds(
        getBytes(ref(testEnv.unauthenticatedContext().storage(), target.fullPath))
      );
      await assertFails(uploadBytes(target, imageBytes(10), { contentType }));
      await assertFails(updateMetadata(target, { contentType: 'image/png' }));
      await assertFails(deleteObject(target));
    }
  });
  it('rejects users, anonymous, inactive administrators, test actors and forged uploader paths', async () => {
    const storage = await admin();
    await assertFails(uploadImage(testEnv.authenticatedContext(STORAGE_USER_ID).storage(), path()));
    await assertFails(uploadImage(testEnv.unauthenticatedContext().storage(), path()));
    await assertFails(uploadImage(storage, `lesson-levels/beginner/another-admin/${randomUUID()}`));
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        userProfile(STORAGE_ADMIN_ID, 'admin@example.com', 'admin', {
          lifecycle: { status: 'suspended' },
        })
      );
    });
    await assertFails(uploadImage(storage, path()));
    await admin();
    await seedStorageFirestore(testEnv, async (db) => {
      await setDoc(doc(db, 'test_actors', STORAGE_ADMIN_ID), { allowed: true });
    });
    await assertFails(uploadImage(storage, path()));
  });
  it('rejects SVG, invalid types, empty/oversize files and invalid paths', async () => {
    const storage = await admin();
    for (const [contentType, size] of [
      ['image/svg+xml', 10],
      ['text/plain', 10],
      ['image/png', 0],
      ['image/png', 2097153],
    ] as const) {
      await assertFails(uploadBytes(ref(storage, path()), imageBytes(size), { contentType }));
    }
    await assertFails(
      uploadImage(storage, `lesson-levels/BAD/${STORAGE_ADMIN_ID}/${randomUUID()}`)
    );
    await assertFails(uploadImage(storage, `lesson-levels/beginner/${STORAGE_ADMIN_ID}/bad-file`));
  });
});
