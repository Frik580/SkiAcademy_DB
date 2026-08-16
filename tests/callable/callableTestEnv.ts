import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDoc,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import { connectFunctionsEmulator, Functions, getFunctions } from 'firebase/functions';
import { readFileSync } from 'node:fs';
import {
  cleanupEmulatorTestEnvironment,
  initializeEmulatorTestEnvironment,
  type RulesTestEnvironment,
} from '../helpers/firebaseEmulatorTestEnv';

export const CALLABLE_PROJECT_ID = 'ski-school-8f3ca';
export const CALLABLE_USER_EMAIL = 'callable-user@example.com';
export const CALLABLE_USER_PASSWORD = 'password123';
export const CALLABLE_INSTRUCTOR_ID = 'callable-instructor-1';

let rulesTestEnv: RulesTestEnvironment;
let clientApp: FirebaseApp;
let callableUserId = '';

export const callableUserProfile = (uid: string, balanceUSD = 500) => ({
  uid,
  email: CALLABLE_USER_EMAIL,
  displayName: 'Callable User',
  role: 'user' as const,
  avatarUrl: '',
  balanceUSD,
});

export async function setupCallableIntegrationEnvironment() {
  rulesTestEnv = await initializeEmulatorTestEnvironment(
    {
      projectId: CALLABLE_PROJECT_ID,
      firestore: {
        rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      },
    },
    { preserveEmulatorHub: true }
  );

  clientApp =
    getApps().find((app) => app.name === 'callable-integration') ??
    initializeApp(
      {
        apiKey: 'demo-api-key',
        authDomain: 'localhost',
        projectId: CALLABLE_PROJECT_ID,
      },
      'callable-integration'
    );

  const auth = getAuth(clientApp);
  const db = getFirestore(clientApp);
  const functions = getFunctions(clientApp, 'us-central1');

  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export async function teardownCallableIntegrationEnvironment() {
  await cleanupEmulatorTestEnvironment(rulesTestEnv);
}

export async function clearCallableFirestore() {
  await rulesTestEnv.clearFirestore();
}

export async function seedCallableBaseFixtures() {
  await rulesTestEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'owner-1'), {
      uid: 'owner-1',
      email: 'owner@example.com',
      displayName: 'owner-1',
      role: 'admin',
      systemRole: 'owner',
      avatarUrl: '',
      balanceUSD: 0,
    });
    await setDoc(doc(db, 'instructors', CALLABLE_INSTRUCTOR_ID), {
      id: CALLABLE_INSTRUCTOR_ID,
      name: 'Callable Instructor',
      specialty: 'ski',
      pricePerHour: 50,
      bio: 'Callable integration instructor',
      avatarUrl: 'https://example.com/instructor.jpg',
      isAvailable: true,
      rating: 5,
      reviewsCount: 0,
    });
    await setDoc(doc(db, 'settings', 'availability_slots_migration'), { complete: true });
  });
}

export async function seedCallableCourse(courseId: string, availableSeats = 1) {
  await rulesTestEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'courses', courseId), {
      id: courseId,
      title: 'Guest Course',
      dates: '2026-12-10',
      price: 200,
      totalSeats: availableSeats,
      availableSeats,
    });
  });
}

export async function seedCallableUserProfile(balanceUSD = 500) {
  const uid = getCallableUserId();
  await rulesTestEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), callableUserProfile(uid, balanceUSD));
  });
}

export async function ensureCallableSignedInUser(): Promise<string> {
  const auth = getCallableAuth();
  try {
    await createUserWithEmailAndPassword(auth, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD);
  } catch {
    await signInWithEmailAndPassword(auth, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD);
  }

  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Callable auth user is missing after sign-in.');
  }

  callableUserId = uid;
  return uid;
}

export function getCallableUserId(): string {
  if (!callableUserId) {
    throw new Error('Callable auth user has not been initialized.');
  }
  return callableUserId;
}

export function getRulesTestEnv(): RulesTestEnvironment {
  return rulesTestEnv;
}

export function getCallableClientApp(): FirebaseApp {
  return clientApp ?? getApp('callable-integration');
}

export function getCallableAuth(): Auth {
  return getAuth(getCallableClientApp());
}

export function getCallableFirestore(): Firestore {
  return getFirestore(getCallableClientApp());
}

export function getCallableFunctions(): Functions {
  return getFunctions(getCallableClientApp(), 'us-central1');
}

export async function readCallableUserBalance(): Promise<number> {
  const userDoc = await getDoc(doc(getCallableFirestore(), 'users', getCallableUserId()));
  return userDoc.data()?.balanceUSD ?? 0;
}
