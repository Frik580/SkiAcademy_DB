import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

export const E2E_PROJECT_ID = 'ski-school-8f3ca';
export const AUTH_EMULATOR_HOST = 'http://127.0.0.1:9099';
export const FUNCTIONS_EMULATOR_HOST = '127.0.0.1';
export const FUNCTIONS_EMULATOR_PORT = 5001;
export const FUNCTIONS_REGION = 'us-central1';

export const E2E_STUDENT_EMAIL = 'student@e2e.test';
export const E2E_STUDENT_PASSWORD = 'password123';

export const E2E_INSTRUCTOR_ID = 'e2e-instructor-1';
export const E2E_INSTRUCTOR_NAME = 'E2E Test Coach';

export interface E2ERuntimeConfig {
  projectId: string;
  studentEmail: string;
  studentPassword: string;
  studentUid: string;
  instructorId: string;
  instructorName: string;
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const FUNCTIONS_READINESS_PROBE = 'optimizeImage';
const FUNCTIONS_READINESS_TIMEOUT_MS = 60_000;
const FUNCTIONS_READINESS_RETRY_INTERVAL_MS = 250;
const FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS = 3_000;
const FUNCTIONS_READINESS_STABLE_PROBES = 3;
const FUNCTIONS_READINESS_STABLE_INTERVAL_MS = 500;

function functionsCallableUrl(functionName: string): string {
  return `http://${FUNCTIONS_EMULATOR_HOST}:${FUNCTIONS_EMULATOR_PORT}/${E2E_PROJECT_ID}/${FUNCTIONS_REGION}/${functionName}`;
}

async function probeFunctionsHttp(functionName: string): Promise<boolean> {
  try {
    const response = await fetch(functionsCallableUrl(functionName), {
      method: 'GET',
      signal: AbortSignal.timeout(FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS),
    });
    return response.status < 502;
  } catch {
    return false;
  }
}

async function probeFunctionsCallable(functionName: string): Promise<boolean> {
  try {
    const response = await fetch(functionsCallableUrl(functionName), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS),
    });
    return response.status < 502;
  } catch {
    return false;
  }
}

async function probeFunctionsRuntimeReady(): Promise<boolean> {
  const [httpReady, guestCallableReady, bookingCallableReady] = await Promise.all([
    probeFunctionsHttp(FUNCTIONS_READINESS_PROBE),
    probeFunctionsCallable('createGuestBooking'),
    probeFunctionsCallable('createBooking'),
  ]);
  return httpReady && guestCallableReady && bookingCallableReady;
}

/**
 * Poll until the Functions emulator serves callable traffic reliably. `firebase emulators:exec`
 * waits for initial emulator startup, but Playwright then starts Vite which can trigger
 * Functions reloads on Windows. Run this after the web server is up (e.g. test.beforeAll).
 */
export async function waitForFunctionsEmulatorReady(
  functionName = FUNCTIONS_READINESS_PROBE,
  timeoutMs = FUNCTIONS_READINESS_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let stableProbes = 0;

  while (Date.now() < deadline) {
    if (await probeFunctionsRuntimeReady()) {
      stableProbes += 1;
      if (stableProbes >= FUNCTIONS_READINESS_STABLE_PROBES) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, FUNCTIONS_READINESS_STABLE_INTERVAL_MS));
      continue;
    }

    stableProbes = 0;
    await new Promise((resolve) => setTimeout(resolve, FUNCTIONS_READINESS_RETRY_INTERVAL_MS));
  }

  throw new Error(
    `Functions emulator did not become ready for "${functionName}" at ${functionsCallableUrl(functionName)} within ${timeoutMs}ms. ` +
      'Ensure E2E runs via `npm run test:e2e` so auth, firestore, functions, and storage emulators are started.'
  );
}

async function createAuthUser(email: string, password: string): Promise<string> {
  const response = await fetch(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const payload = (await response.json()) as { localId?: string; error?: { message?: string } };

  if (response.ok && payload.localId) {
    return payload.localId;
  }

  const signInResponse = await fetch(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signInPayload = (await signInResponse.json()) as {
    localId?: string;
    error?: { message?: string };
  };

  if (!signInResponse.ok || !signInPayload.localId) {
    throw new Error(
      signInPayload.error?.message ?? payload.error?.message ?? 'Failed to create E2E auth user.'
    );
  }

  return signInPayload.localId;
}

export default async function globalSetup(): Promise<void> {
  const studentUid = await createAuthUser(E2E_STUDENT_EMAIL, E2E_STUDENT_PASSWORD);

  const testEnv = await initializeTestEnvironment({
    projectId: E2E_PROJECT_ID,
    firestore: {
      rules: readFileSync(join(rootDir, 'firestore.rules'), 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', studentUid), {
      uid: studentUid,
      email: E2E_STUDENT_EMAIL,
      displayName: 'E2E Student',
      role: 'user',
      avatarUrl: '',
      balanceUSD: 500,
    });
    await setDoc(doc(db, 'instructors', E2E_INSTRUCTOR_ID), {
      id: E2E_INSTRUCTOR_ID,
      name: E2E_INSTRUCTOR_NAME,
      specialty: 'ski',
      pricePerHour: 50,
      bio: 'Playwright end-to-end instructor fixture.',
      avatarUrl: 'https://example.com/e2e-instructor.jpg',
      isAvailable: true,
      rating: 5,
      reviewsCount: 0,
      languages: ['English'],
      experienceYears: 5,
    });
    await setDoc(doc(db, 'settings', 'availability_slots_migration'), { complete: true });
    await setDoc(doc(db, 'settings', 'resort_config'), {
      slides: [],
      slideIntervalSeconds: 6,
      slidesRandomOrder: false,
    });
    await setDoc(doc(db, 'users', 'owner-1'), {
      uid: 'owner-1',
      email: 'owner@example.com',
      displayName: 'owner-1',
      role: 'admin',
      systemRole: 'owner',
      avatarUrl: '',
      balanceUSD: 0,
    });
  });

  await testEnv.cleanup();

  const runtimeConfig: E2ERuntimeConfig = {
    projectId: E2E_PROJECT_ID,
    studentEmail: E2E_STUDENT_EMAIL,
    studentPassword: E2E_STUDENT_PASSWORD,
    studentUid,
    instructorId: E2E_INSTRUCTOR_ID,
    instructorName: E2E_INSTRUCTOR_NAME,
  };

  writeFileSync(
    join(rootDir, 'e2e', '.runtime-config.json'),
    JSON.stringify(runtimeConfig, null, 2)
  );

  await waitForFunctionsEmulatorReady();
}
