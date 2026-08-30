import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  AUTH_EMULATOR_HOST,
  E2E_CHILD_DISPLAY_NAME,
  E2E_INSTRUCTOR_ID,
  E2E_INSTRUCTOR_NAME,
  E2E_PROJECT_ID,
  E2E_STUDENT_B_EMAIL,
  E2E_STUDENT_B_PASSWORD,
  E2E_STUDENT_DISPLAY_NAME,
  E2E_STUDENT_EMAIL,
  E2E_STUDENT_PASSWORD,
  FIRESTORE_EMULATOR_HOST,
  FUNCTIONS_EMULATOR_HOST,
  FUNCTIONS_EMULATOR_PORT,
  FUNCTIONS_REGION,
  functionsCallableUrl,
} from './emulator-config';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireRoot = createRequire(join(rootDir, 'package.json'));
const requireFunctions = createRequire(join(rootDir, 'functions/package.json'));
const {
  AccountSchema,
  WalletSchema,
  accountCommandActor,
  selfParticipantIdFromAccountId,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain');
const { initializeApp, getApps } = requireFunctions('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore') as typeof import('firebase-admin/firestore');

export {
  E2E_PROJECT_ID,
  E2E_STUDENT_EMAIL,
  E2E_STUDENT_PASSWORD,
  E2E_STUDENT_B_EMAIL,
  E2E_STUDENT_B_PASSWORD,
  E2E_INSTRUCTOR_ID,
  E2E_INSTRUCTOR_NAME,
  E2E_CHILD_DISPLAY_NAME,
  E2E_STUDENT_DISPLAY_NAME,
};

export interface E2ERuntimeConfig {
  projectId: string;
  studentEmail: string;
  studentPassword: string;
  studentUid: string;
  studentParticipantId: string;
  studentDisplayName: string;
  studentChildParticipantId: string;
  studentChildDisplayName: string;
  studentBEmail: string;
  studentBPassword: string;
  studentBUid: string;
  studentBParticipantId: string;
  instructorId: string;
  instructorName: string;
}

const E2E_WALLET_BALANCE_KZT = 500_000;

async function clearFirestoreEmulator(): Promise<void> {
  const response = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${E2E_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to clear the Firestore emulator before E2E setup: ${response.status} ${await response.text()}`
    );
  }
}

const FUNCTIONS_READINESS_PROBE = 'optimizeImage';
const FUNCTIONS_READINESS_TIMEOUT_MS = 60_000;
const FUNCTIONS_READINESS_RETRY_INTERVAL_MS = 250;
const FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS = 3_000;
const FUNCTIONS_READINESS_STABLE_PROBES = 3;
const FUNCTIONS_READINESS_STABLE_INTERVAL_MS = 500;

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
  const [httpReady, guestCallableReady, authCallableReady] = await Promise.all([
    probeFunctionsHttp(FUNCTIONS_READINESS_PROBE),
    probeFunctionsCallable('executeGuestCanonicalCommand'),
    probeFunctionsCallable('executeCanonicalCommand'),
  ]);
  return httpReady && guestCallableReady && authCallableReady;
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

async function seedStudentAccount(input: {
  readonly studentUid: string;
  readonly email: string;
  readonly displayName: string;
  readonly childParticipantId?: string;
  readonly childParticipantManagementId?: string;
  readonly childDisplayName?: string;
}): Promise<void> {
  const firestore = getFirestore();
  const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
  const metadata = {
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_e2e_seed',
      lastChangedByCommandId: 'command_e2e_seed',
      correlationId: 'correlation_e2e_seed',
    },
  };

  await firestore.doc(`users/${input.studentUid}`).set({
    ...AccountSchema.parse({
      accountId: input.studentUid,
      lifecycle: { status: 'active' },
      ...metadata,
    }),
    uid: input.studentUid,
    email: input.email,
    displayName: input.displayName,
    role: 'user',
    avatarUrl: '',
    balanceUSD: 500,
  });

  await firestore.doc(`users/${input.studentUid}/wallet/state`).set(
    WalletSchema.parse({
      accountId: input.studentUid,
      currency: 'KZT',
      balance: E2E_WALLET_BALANCE_KZT,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );

  const { createCanonicalCommandRuntime } = requireFunctions(
    join(rootDir, 'functions/lib/canonical/commands/canonicalCommandRuntime.js')
  ) as typeof import('../functions/src/canonical/commands/canonicalCommandRuntime');
  const provisioned = await createCanonicalCommandRuntime(firestore)
    .createCommands()
    .execute({
      kind: 'provision_self_participant',
      context: {
        actor: accountCommandActor(input.studentUid),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'e2e-provision-self-participant-v1',
        correlationId: 'correlation_e2e_provision_self',
        source: 'client_callable',
      },
      intent: {},
    });
  if (provisioned.status !== 'success') {
    throw new Error(`E2E self Participant provisioning failed: ${provisioned.error.code}`);
  }

  if (
    input.childParticipantId &&
    input.childParticipantManagementId &&
    input.childDisplayName
  ) {
    await firestore.doc(`participants/${input.childParticipantId}`).set({
      participantId: input.childParticipantId,
      displayName: input.childDisplayName,
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: {
        kind: 'managed',
        participantManagementId: input.childParticipantManagementId,
      },
      lifecycle: { status: 'active' },
      ...metadata,
    });

    await firestore.doc(`participant_management/${input.childParticipantManagementId}`).set({
      participantManagementId: input.childParticipantManagementId,
      participantId: input.childParticipantId,
      accountId: input.studentUid,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
  }
}

async function seedCanonicalFirestoreFixtures(
  studentUid: string,
  studentBUid: string
): Promise<{
  studentParticipantId: string;
  studentChildParticipantId: string;
  studentBParticipantId: string;
}> {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

  if (getApps().length === 0) {
    initializeApp({ projectId: E2E_PROJECT_ID });
  }

  const studentParticipantId = selfParticipantIdFromAccountId(studentUid);
  const studentChildParticipantId = `participant_e2e_child_${studentUid}`;
  const studentChildParticipantManagementId = `management_e2e_child_${studentUid}`;
  const studentBParticipantId = selfParticipantIdFromAccountId(studentBUid);

  await seedStudentAccount({
    studentUid,
    email: E2E_STUDENT_EMAIL,
    displayName: E2E_STUDENT_DISPLAY_NAME,
    childParticipantId: studentChildParticipantId,
    childParticipantManagementId: studentChildParticipantManagementId,
    childDisplayName: E2E_CHILD_DISPLAY_NAME,
  });

  await seedStudentAccount({
    studentUid: studentBUid,
    email: E2E_STUDENT_B_EMAIL,
    displayName: 'E2E Student B',
  });

  const firestore = getFirestore();
  const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

  await firestore.doc(`instructors/${E2E_INSTRUCTOR_ID}`).set({
    id: E2E_INSTRUCTOR_ID,
    name: E2E_INSTRUCTOR_NAME,
    specialty: 'ski',
    pricePerHour: 50,
    pricePerHourKZT: 12_000,
    bio: 'Playwright end-to-end instructor fixture.',
    avatarUrl: 'https://example.com/e2e-instructor.jpg',
    isAvailable: true,
    rating: 5,
    reviewsCount: 0,
    languages: ['English'],
    experienceYears: 5,
  });

  await firestore.doc('settings/availability_slots_migration').set({ complete: true });
  await firestore.doc('settings/resort_config').set({
    slides: [],
    slideIntervalSeconds: 6,
    slidesRandomOrder: false,
  });

  await firestore.doc('users/owner-1').set({
    uid: 'owner-1',
    email: 'owner@example.com',
    displayName: 'owner-1',
    role: 'admin',
    systemRole: 'owner',
    avatarUrl: '',
    balanceUSD: 0,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });

  const { queryManagedParticipantPickerReadModels } = requireFunctions(
    join(rootDir, 'functions/lib/canonical/readModels/managedParticipantPickerReadModels.js')
  );
  const pickerItems = await queryManagedParticipantPickerReadModels(firestore, studentUid);
  if (pickerItems.items.length < 2) {
    throw new Error(
      `E2E managed participant picker read model expected at least two items for account ${studentUid}.`
    );
  }

  const studentBPickerItems = await queryManagedParticipantPickerReadModels(firestore, studentBUid);
  if (studentBPickerItems.items.length === 0) {
    throw new Error(
      `E2E managed participant picker read model returned no items for account ${studentBUid}.`
    );
  }

  return {
    studentParticipantId,
    studentChildParticipantId,
    studentBParticipantId,
  };
}

export default async function globalSetup(): Promise<void> {
  await clearFirestoreEmulator();

  const studentUid = await createAuthUser(E2E_STUDENT_EMAIL, E2E_STUDENT_PASSWORD);
  const studentBUid = await createAuthUser(E2E_STUDENT_B_EMAIL, E2E_STUDENT_B_PASSWORD);
  const participantIds = await seedCanonicalFirestoreFixtures(studentUid, studentBUid);

  const runtimeConfig: E2ERuntimeConfig = {
    projectId: E2E_PROJECT_ID,
    studentEmail: E2E_STUDENT_EMAIL,
    studentPassword: E2E_STUDENT_PASSWORD,
    studentUid,
    studentParticipantId: participantIds.studentParticipantId,
    studentDisplayName: E2E_STUDENT_DISPLAY_NAME,
    studentChildParticipantId: participantIds.studentChildParticipantId,
    studentChildDisplayName: E2E_CHILD_DISPLAY_NAME,
    studentBEmail: E2E_STUDENT_B_EMAIL,
    studentBPassword: E2E_STUDENT_B_PASSWORD,
    studentBUid,
    studentBParticipantId: participantIds.studentBParticipantId,
    instructorId: E2E_INSTRUCTOR_ID,
    instructorName: E2E_INSTRUCTOR_NAME,
  };

  writeFileSync(
    join(rootDir, 'e2e', '.runtime-config.json'),
    JSON.stringify(runtimeConfig, null, 2)
  );

  await waitForFunctionsEmulatorReady();
}
