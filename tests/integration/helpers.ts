import { RulesTestContext, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  cleanupEmulatorTestEnvironment,
  initializeEmulatorTestEnvironment,
} from '../helpers/firebaseEmulatorTestEnv';
import { readRepoFile } from '../helpers/readRepoFile';
import { doc, setDoc } from 'firebase/firestore';

export const PROJECT_ID = 'ski-academy-integration-test';
export const USER_ID = 'user-1';
export const OTHER_USER_ID = 'user-2';
export const OWNER_ID = 'owner-1';
export const INSTRUCTOR_USER_ID = 'instructor-user-1';
export const INSTRUCTOR_ID = 'instructor-1';

let testEnv: RulesTestEnvironment;

export const userProfile = (
  uid: string,
  email: string,
  role: 'user' | 'admin' = 'user',
  systemRole?: 'owner'
) => ({
  uid,
  email,
  displayName: uid,
  role,
  avatarUrl: '',
  balanceUSD: 100,
  ...(systemRole ? { systemRole } : {}),
});

export async function setupIntegrationTestEnvironment() {
  testEnv = await initializeEmulatorTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readRepoFile('firestore.rules'),
    },
  });
}

export async function teardownIntegrationTestEnvironment() {
  await cleanupEmulatorTestEnvironment(testEnv);
}

export async function clearIntegrationFirestore() {
  await testEnv.clearFirestore();
}

export async function seedData<T>(callback: (context: RulesTestContext) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    result = await callback(context);
  });
  return result as T;
}

export function integrationTestEnv() {
  return testEnv;
}

export async function seedOwnerAndMigrationFlag(complete = true) {
  await seedData(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(db, 'users', OWNER_ID),
      userProfile(OWNER_ID, 'owner@example.com', 'admin', 'owner')
    );
    if (complete) {
      await setDoc(doc(db, 'settings', 'availability_slots_migration'), { complete: true });
    }
  });
}

export async function seedBookingUser(balanceUSD = 100) {
  await seedData(async (context) => {
    await setDoc(doc(context.firestore(), 'users', USER_ID), {
      ...userProfile(USER_ID, 'user@example.com', 'user'),
      balanceUSD,
    });
  });
}

export async function seedInstructor(pricePerHour = 50) {
  await seedData(async (context) => {
    await setDoc(doc(context.firestore(), 'instructors', INSTRUCTOR_ID), {
      id: INSTRUCTOR_ID,
      name: 'Instructor',
      specialty: 'ski',
      pricePerHour,
      bio: 'Test instructor',
      avatarUrl: '',
      isAvailable: true,
      rating: 5,
      reviewsCount: 0,
    });
  });
}

export async function seedInstructorUser() {
  await seedData(async (context) => {
    await setDoc(doc(context.firestore(), 'users', INSTRUCTOR_USER_ID), {
      ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
      instructorId: INSTRUCTOR_ID,
    });
  });
}
