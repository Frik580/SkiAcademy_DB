import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { loadRuntimeConfig, signInStudent } from './fixtures';
import {
  AUTH_EMULATOR_HOST,
  E2E_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  functionsCallableUrl,
} from './emulator-config';
import type { LevelOperation } from '@ski-academy/shared-domain';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, getApps } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');
const requireRoot = createRequire(new URL('../package.json', import.meta.url));
const {
  DEFAULT_SKILL_CONFIG,
  instructorRelationshipIdFromPair,
  instructorRelationshipExpiresAt,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test('authenticated mastery progression and admin qualification preserve factual XP', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const runtime = loadRuntimeConfig();
  expect(runtime.projectId).toBe(E2E_PROJECT_ID);
  // This fixture is hard-bound to local demo emulators; never use ambient production credentials.
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
  const app =
    getApps().find((app) => app.name === 'level-progression-e2e') ??
    initializeApp({ projectId: E2E_PROJECT_ID }, 'level-progression-e2e');
  const db = getFirestore(app);
  const login = async (email: string, password: string) => {
    const response = await request.post(
      `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
      { data: { email, password, returnSecureToken: true } }
    );
    expect(response.ok()).toBe(true);
    return (await response.json()) as { idToken: string; localId: string };
  };
  const coach = await login(runtime.instructorEmail, runtime.instructorPassword);
  const admin = await login(runtime.adminEmail, runtime.adminPassword);
  const student = await login(runtime.studentEmail, runtime.studentPassword);
  const participantId = runtime.studentParticipantId;
  const at = timestampFromDate(new Date());
  const relationshipId = instructorRelationshipIdFromPair({
    participantId: participantId as never,
    instructorId: runtime.workspaceInstructorId as never,
  });
  const person = (await db.doc(`participants/${participantId}`).get()).data()!;
  await db.doc(`instructor_relationships/${relationshipId}`).set({
    instructorRelationshipId: relationshipId,
    participantId,
    instructorId: runtime.workspaceInstructorId,
    basis: {
      kind: 'guardian_permission',
      participantManagementId: person.management.participantManagementId,
      grantedByAccountId: runtime.studentUid,
    },
    validFrom: at,
    expiresAt: instructorRelationshipExpiresAt(at),
    status: 'active',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: 'command_e2e_levels_seed',
      lastChangedByCommandId: 'command_e2e_levels_seed',
      correlationId: 'correlation_e2e_levels_seed',
    },
  });
  const call = async (idToken: string, data: Record<string, unknown>) => {
    const response = await request.post(functionsCallableUrl('executeCanonicalCommand'), {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { data },
    });
    const body = await response.json();
    return body.result ?? { status: 'error', error: body.error };
  };
  const revision = async () =>
    (await db.doc(`participant_progress/${participantId}`).get()).data()?.revision ?? 0;
  const operate = async (
    operation: LevelOperation,
    administrator = false,
    idToken = administrator ? admin.idToken : coach.idToken
  ) =>
    call(idToken, {
      kind: 'manage_participant_level',
      intent: { participantId, operation },
      expectedRevision: await revision(),
      idempotencyKey: `levels-e2e-${operation.action}-${Date.now()}`,
      correlationId: 'correlation_e2e_levels',
      ...(administrator ? { administratorContext: true } : { exercisedCapability: 'instructor' }),
    });
  const reason = { category: 'expert_assessment' as const, text: 'Observed skiing qualification' };
  expect(
    (await operate({ action: 'assign', level: 3, reason }, true, student.idToken))?.status
  ).toBe('error');
  const config = (await db.doc('settings/skill_config').get()).data() ?? DEFAULT_SKILL_CONFIG;
  const scores = Object.fromEntries(
    config.items
      .filter((item: { levelTarget: number }) => item.levelTarget === 1)
      .map((item: { id: string; maxPoints: number }) => [item.id, item.maxPoints])
  );
  const result = await call(coach.idToken, {
    kind: 'update_participant_progress',
    intent: {
      participantId,
      level: 4,
      skillScores: scores,
      skillComments: {},
      correctionReason: 'Fresh exercise assessment',
    },
    expectedRevision: await revision(),
    idempotencyKey: 'levels-e2e-scores',
    correlationId: 'correlation_e2e_levels',
    exercisedCapability: 'instructor',
  });
  expect(result?.status).toBe('success');
  expect((await db.doc(`participant_progress/${participantId}`).get()).data()!.level).toBe(1);
  expect((await operate({ action: 'confirm' }))?.status).toBe('success');
  expect((await db.doc(`participant_progress/${participantId}`).get()).data()!.level).toBe(2);
  expect((await operate({ action: 'request', level: 3, reason }))?.status).toBe('success');
  const pending = (await db.doc(`participant_progress/${participantId}`).get()).data()!;
  expect(
    (await operate({ action: 'approve', requestId: pending.levelState.request.requestId }, true))
      ?.status
  ).toBe('success');
  const assigned = (await db.doc(`participant_progress/${participantId}`).get()).data()!;
  expect(assigned.level).toBe(3);
  expect(assigned.skillScores).toEqual(scores);
  const managedRead = page.waitForResponse(
    (response) =>
      response.url().endsWith('/queryParticipantProgressReadModels') &&
      response.request().postDataJSON()?.data?.scope === 'managed',
    { timeout: 60000 }
  );
  await signInStudent(page, runtime);
  const projected = (await (await managedRead).json()).result;
  expect(projected.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ participantId, level: 3 })])
  );
  await expect(
    page.getByRole('heading', { name: 'Official mastery level: Performance' })
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/Current stage XP: 0 \/ /)).toBeVisible();
});
