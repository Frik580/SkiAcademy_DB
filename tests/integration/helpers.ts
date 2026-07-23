import { readFileSync } from 'node:fs';
import {
  RulesTestContext,
  RulesTestEnvironment,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
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
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
}

export async function teardownIntegrationTestEnvironment() {
  await testEnv.cleanup();
}

export async function clearIntegrationFirestore() {
  await testEnv.clearFirestore();
}

export async function seedData(callback: (context: RulesTestContext) => Promise<void>) {
  await testEnv.withSecurityRulesDisabled(callback);
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

export async function seedInstructorUser() {
  await seedData(async (context) => {
    await setDoc(doc(context.firestore(), 'users', INSTRUCTOR_USER_ID), {
      ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
      instructorId: INSTRUCTOR_ID,
    });
  });
}
