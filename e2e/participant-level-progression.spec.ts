import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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
const { initializeApp, getApps, deleteApp } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');
const requireRoot = createRequire(new URL('../package.json', import.meta.url));
const {
  DEFAULT_SKILL_CONFIG,
  calculateParticipantStage,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  ParticipantSchema,
  ParticipantManagementSchema,
  instructorRelationshipIdFromPair,
  instructorRelationshipExpiresAt,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test.afterEach(async () => {
  const app = getApps().find((app) => app.name === 'level-progression-e2e');
  if (app) await deleteApp(app);
});

test('authenticated mastery progression and admin qualification preserve factual XP', async ({
  page,
  request,
}, testInfo) => {
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
  const attemptId = randomUUID();
  const participantId = ParticipantIdSchema.parse(`participant_levels_e2e_${attemptId}`);
  const managementId = ParticipantManagementIdSchema.parse(`management_levels_e2e_${attemptId}`);
  const at = timestampFromDate(new Date());
  const relationshipId = instructorRelationshipIdFromPair({
    participantId: participantId as never,
    instructorId: runtime.workspaceInstructorId as never,
  });
  const progressRef = db.doc(`participant_progress/${participantId}`);
  const participantRef = db.doc(`participants/${participantId}`);
  const managementRef = db.doc(`participant_management/${managementId}`);
  const relationshipRef = db.doc(`instructor_relationships/${relationshipId}`);
  const fixtureMetadata = {
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: `command_levels_fixture_${attemptId}`,
      lastChangedByCommandId: `command_levels_fixture_${attemptId}`,
      correlationId: `correlation_levels_fixture_${attemptId}`,
    },
  };
  // Use an independent managed Participant per attempt. Restoring a shared
  // progress revision would collide with its durable progress event IDs on retry.
  try {
    const source = await db.doc(`participants/${runtime.studentChildParticipantId}`).get();
    expect(source.exists).toBe(true);
    const seed = db.batch();
    seed.create(
      participantRef,
      ParticipantSchema.parse({
        ...source.data(),
        participantId,
        displayName: 'E2E Level Student',
        management: { kind: 'managed', participantManagementId: managementId },
        ...fixtureMetadata,
      })
    );
    seed.create(
      managementRef,
      ParticipantManagementSchema.parse({
        participantManagementId: managementId,
        participantId,
        accountId: runtime.studentUid,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        ...fixtureMetadata,
      })
    );
    await seed.commit();
    await relationshipRef.set({
      instructorRelationshipId: relationshipId,
      participantId,
      instructorId: runtime.workspaceInstructorId,
      basis: {
        kind: 'guardian_permission',
        participantManagementId: managementId,
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
    const reason = {
      category: 'expert_assessment' as const,
      text: 'Observed skiing qualification',
    };
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
      idempotencyKey: `levels-e2e-scores-${attemptId}`,
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
    const stage = calculateParticipantStage(assigned.level, assigned.skillScores, config);
    expect(stage.earned).toBe(0);
    expect(stage.evaluated).toBe(0);
    expect(assigned.levelState.request.status).toBe('approved');
    const managedRead = page.waitForResponse(
      async (response) => {
        if (
          !response.url().endsWith('/queryParticipantProgressReadModels') ||
          response.request().postDataJSON()?.data?.scope !== 'managed'
        )
          return false;
        const projected = (await response.json()).result;
        return (
          projected?.items?.some(
            (item: { participantId: string }) => item.participantId === participantId
          ) ?? false
        );
      },
      { timeout: 60000 }
    );
    const participantRead = page.waitForResponse(
      (response) => response.url().endsWith('/queryManagedParticipantPickerReadModels'),
      { timeout: 60000 }
    );
    await signInStudent(page, runtime);
    expect((await participantRead).ok()).toBe(true);
    const switcher = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible');
    const target = switcher.locator(`[data-participant-id="${participantId}"]`);
    await expect(target).toBeVisible();
    await target.click();
    const projected = (await (await managedRead).json()).result;
    expect(projected.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ participantId, level: 3 })])
    );
    // A successful response alone does not prove that the cabinet consumed it.
    // Read the same Vite module instances as the app, without writing either store.
    const cabinetState = () =>
      page.evaluate(async (id) => {
        const selectionUrl =
          '/src/features/student-cabinet/cabinetProgressParticipantSelectionStore.ts';
        const progressUrl = '/src/features/participant-progress/participantProgressStore.ts';
        const { useCabinetProgressParticipantSelectionStore } = await import(selectionUrl);
        const { useParticipantProgressStore } = await import(progressUrl);
        const selection = useCabinetProgressParticipantSelectionStore.getState();
        const progress = useParticipantProgressStore.getState().byId[id];
        return {
          selectedParticipantId: selection.selectedParticipantId,
          participantId: progress?.participantId,
          level: progress?.level,
          skillScores: progress?.skillScores,
        };
      }, participantId);
    const expectedState = {
      selectedParticipantId: participantId,
      participantId,
      level: 3,
      skillScores: scores,
    };
    await expect.poll(cabinetState).toEqual(expectedState);
    await expect(target).toHaveAttribute('aria-pressed', 'true');

    // Scope every mastery assertion to the journey whose avatar is the selected
    // Participant. Level labels elsewhere (e.g. lessons) are not evidence.
    const journey = page.locator('#your-journey').filter({
      has: page.getByRole('img', { name: 'E2E Level Student', exact: true }),
    });
    for (const language of ['en', 'ru'] as const) {
      const levelLabel = language === 'ru' ? 'Мастерство' : 'Performance';
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole('banner')
        .getByRole('button', { name: language.toUpperCase(), exact: true })
        .click();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(journey).toBeVisible();
        await expect(journey.locator('.journey-level-badge')).toHaveText(levelLabel);
        const currentNode = journey.getByRole('button', { name: levelLabel, exact: true });
        await expect(currentNode).toHaveAttribute('aria-current', 'step');
        await expect(currentNode).toHaveAttribute('data-journey-state', 'current');
        const marker = journey.locator('.journey-user-marker');
        await expect(
          marker.getByRole('img', { name: 'E2E Level Student', exact: true })
        ).toBeVisible();
        await expect
          .poll(async () => {
            const avatar = await marker.boundingBox();
            const node = await currentNode.boundingBox();
            return avatar && node
              ? Math.abs(avatar.x + avatar.width / 2 - node.x - node.width / 2)
              : Infinity;
          })
          .toBeLessThan(2);
        await expect(journey.locator('.journey-summary-xp')).toHaveText('0 XP');
        await expect(marker.locator('.journey-marker-caption')).toHaveText('0XP');
        const current = journey.locator('.journey-criteria');
        await expect(
          current.getByRole('heading', {
            name: language === 'ru' ? 'Текущий' : 'Current',
            exact: true,
          })
        ).toBeVisible();
        await expect(current).toContainText(`${stage.required} XP`);
        await expect.poll(cabinetState).toEqual(expectedState);
        await testInfo.attach(`selected-participant-${language}-${width}`, {
          body: await journey.screenshot(),
          contentType: 'image/png',
        });
      }
    }
    // Qualification changes level, never the factual exercise evidence.
    const finalProgress = (await progressRef.get()).data()!;
    expect(finalProgress.skillScores).toEqual(scores);
    expect(
      calculateParticipantStage(finalProgress.level, finalProgress.skillScores, config).earned
    ).toBe(0);
  } finally {
    const cleanup = db.batch();
    // Only the four documents owned by this attempt; keep command receipts/events.
    for (const ref of [progressRef, relationshipRef, managementRef, participantRef]) {
      cleanup.delete(ref);
    }
    await cleanup.commit();
  }
});
