import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { ensureFirestore } from './firestore-admin';
import { getSkillItemTitle } from '../src/domain/achievements/skillData';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST } from './emulator-config';
import { loadRuntimeConfig, signInAccount, signInStudent, watchBrowserFailures } from './fixtures';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { BookingSchema, ParticipantProgressSchema, PaymentSchema, timestampFromDate } =
  requireFunctions('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

// Real UI, Auth, callable Functions and Firestore; only fixture setup/assertions use Admin SDK.
test('maximum skill rating removes only its participant Today task live and preserves history after correction', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe(FIRESTORE_EMULATOR_HOST);
  const runtime = loadRuntimeConfig();
  expect(runtime.projectId).toBe(E2E_PROJECT_ID);
  const db = ensureFirestore();
  const suffix = randomUUID();
  const participantId = `participant_today_${suffix}`;
  const managementId = `management_today_${suffix}`;
  const bookingId = `booking_today_${suffix}`;
  const name = `Today Student ${info.repeatEachIndex}`;
  const profile = db.doc(`users/${runtime.studentUid}`);
  const profileBefore = (await profile.get()).data()!;
  const config = (await db.doc('settings/skill_config').get()).data();
  const { DEFAULT_SKILL_CONFIG } = requireFunctions(
    '@ski-academy/shared-domain'
  ) as typeof import('@ski-academy/shared-domain');
  const skill = (config?.items ?? DEFAULT_SKILL_CONFIG.items)[0];
  const title = getSkillItemTitle(skill, 'en');
  const belowMax = skill.maxPoints - 1;
  const stamp = timestampFromDate(new Date());
  const metadata = {
    revision: 1,
    createdAt: stamp,
    updatedAt: stamp,
    audit: {
      createdByCommandId: `seed_today_${suffix}`,
      lastChangedByCommandId: `seed_today_${suffix}`,
      correlationId: `correlation_today_${suffix}`,
    },
  };
  const otherChecklist = {
    todaySkillItemIds: [skill.id],
    customTodayTasks: [{ id: 'other', text: 'Other participant reminder' }],
    completedTodayTaskIds: ['custom:other'],
    completedTodayDate: new Date().toISOString().slice(0, 10),
    dismissedTodayTaskIds: [],
  };
  const ownChecklist = {
    ...otherChecklist,
    todaySkillItemIds: [],
    customTodayTasks: [{ id: 'keep', text: 'Keep this reminder' }],
    completedTodayTaskIds: [],
  };
  const progressRef = db.doc(`participant_progress/${participantId}`);
  const refs = [
    db.doc(`participants/${participantId}`),
    db.doc(`participant_management/${managementId}`),
    progressRef,
    db.doc(`bookings/${bookingId}`),
    db.doc(`payments/payment_${bookingId}`),
  ];
  const coachContext = await browser.newContext();
  const coach = await coachContext.newPage();
  const healthyStudent = watchBrowserFailures(page);
  const healthyCoach = watchBrowserFailures(coach);
  const select = async (id: string) => {
    const button = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible')
      .locator(`[data-participant-id="${id}"]`);
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  };
  const tile = page.locator('[data-dashboard-tile="todayTasks"]');
  const developmentRow = () =>
    page.locator('li').filter({ has: page.getByText(title, { exact: true }) });
  const openEvaluation = async () => {
    const card = coach
      .locator('div')
      .filter({ has: coach.getByRole('heading', { name, exact: true }) })
      .filter({ has: coach.getByRole('button', { name: 'View progress and skills', exact: true }) })
      .last();
    await card.getByRole('button', { name: 'View progress and skills', exact: true }).click();
    await expect(coach.locator('.ui-modal')).toBeVisible();
  };
  const assess = async (score: number) => {
    await openEvaluation();
    const modal = coach.locator('.ui-modal');
    await modal
      .getByRole('button', { name: `${title}: ${score} / ${skill.maxPoints}`, exact: true })
      .click();
    await modal
      .getByLabel('Reason for correcting scores')
      .fill('Observed skill correction in E2E lesson');
    const saved = coach.waitForResponse(
      (response) =>
        response.url().endsWith('/executeCanonicalCommand') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.data?.kind === 'update_participant_progress'
    );
    await modal.getByRole('button', { name: 'Save Ratings', exact: true }).click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect((await response.json()).result.status).toBe('success');
    await expect(modal).toHaveCount(0);
    await expect(coach.getByText('Ratings Saved', { exact: true })).toBeVisible();
  };
  try {
    const source = (
      await db.doc(`participants/${runtime.studentChildParticipantId}`).get()
    ).data()!;
    await refs[0].create({
      ...source,
      participantId,
      displayName: name,
      management: { kind: 'managed', participantManagementId: managementId },
      ...metadata,
    });
    await refs[1].create({
      participantManagementId: managementId,
      participantId,
      accountId: runtime.studentUid,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    await progressRef.create(
      ParticipantProgressSchema.parse({
        participantId,
        level: 1,
        skillScores: { [skill.id]: belowMax },
        skillComments: {},
        ...metadata,
      })
    );
    const startsAt = timestampFromDate(new Date(Date.now() - 60_000));
    const endsAt = timestampFromDate(new Date(Date.now() + 3_600_000));
    await refs[4].create(
      PaymentSchema.parse({
        paymentId: `payment_${bookingId}`,
        subjectType: 'booking',
        subjectId: bookingId,
        currency: 'KZT',
        originalPrice: 12000,
        price: 12000,
        paidAmount: 12000,
        refundedAmount: 0,
        retainedAmount: 12000,
        settledAmount: 12000,
        writtenOffAmount: 0,
        outstandingAmount: 0,
        paymentStatus: 'paid',
        payerAccountId: runtime.studentUid,
        incrementalRequirements: [],
        revision: 1,
        eventRevision: 1,
        createdAt: stamp,
        updatedAt: stamp,
      })
    );
    await refs[3].create(
      BookingSchema.parse({
        bookingId,
        payerAccountId: runtime.studentUid,
        paymentId: `payment_${bookingId}`,
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId: runtime.studentUid },
        },
        party: { kind: 'individual', participantIds: [participantId] },
        occurrence: {
          occurrenceId: `occurrence_${bookingId}`,
          instructorId: runtime.workspaceInstructorId,
          interval: { startsAt, endsAt },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [participantId], frozenAt: startsAt },
        },
        lifecycle: { status: 'confirmed' },
        ...metadata,
      })
    );
    await profile.update({
      participantTodayChecklists: {
        ...profileBefore.participantTodayChecklists,
        [runtime.studentParticipantId]: otherChecklist,
        [participantId]: ownChecklist,
      },
    });

    await test.step('student selects participant and pins a below-maximum skill', async () => {
      const pickerLoaded = page.waitForResponse(
        (response) =>
          response.url().endsWith('/queryManagedParticipantPickerReadModels') &&
          response.request().method() === 'POST'
      );
      await signInStudent(page, runtime);
      expect((await pickerLoaded).ok()).toBe(true);
      await select(participantId);
      await page.goto('/cabinet/development');
      await select(participantId);
      await expect(developmentRow()).toContainText(`${belowMax} / ${skill.maxPoints}`);
      await developmentRow().getByRole('button', { name: 'Add to Today', exact: true }).click();
      await expect(developmentRow().getByTitle('Remove from Today', { exact: true })).toBeVisible();
      await page.goto('/cabinet');
      await select(participantId);
      await expect(tile.getByRole('checkbox', { name: title, exact: true })).toBeVisible();
      await tile.getByRole('checkbox', { name: title, exact: true }).check();
      await expect
        .poll(
          async () =>
            (await profile.get()).data()?.participantTodayChecklists[participantId]
              .completedTodayTaskIds
        )
        .toContain(`skill:${skill.id}`);
    });
    await signInAccount(coach, {
      email: runtime.instructorEmail,
      password: runtime.instructorPassword,
      expectedPath: '/instructor',
    });
    const origin = await page.evaluate(() => performance.timeOrigin);
    await test.step('instructor saves maximum; the already-open student cabinet updates without navigation', async () => {
      await assess(skill.maxPoints);
      await expect(tile.getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      await expect(
        tile.getByRole('checkbox', { name: 'Keep this reminder', exact: true })
      ).toBeVisible();
      await page.reload();
      await select(participantId);
      await expect(
        tile.getByRole('checkbox', { name: 'Keep this reminder', exact: true })
      ).toBeVisible();
      await expect(tile.getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
      await page.goto('/cabinet/development');
      await select(participantId);
      await expect(developmentRow()).toContainText(`${skill.maxPoints} / ${skill.maxPoints}`);
      await expect(
        developmentRow().getByRole('button', { name: 'Add to Today', exact: true })
      ).toHaveCount(0);
      await page.goto('/cabinet');
      await select(participantId);
    });
    const maximumEvent = (
      await db.doc(`participant_progress_events/${participantId}_2`).get()
    ).data();
    expect(maximumEvent).toMatchObject({
      oldScores: { [skill.id]: belowMax },
      newScores: { [skill.id]: skill.maxPoints },
    });
    await test.step('lower current score allows manual addition without restoring the task automatically', async () => {
      await assess(belowMax);
      await expect(tile.getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
      await page.goto('/cabinet/development');
      await select(participantId);
      await expect(
        developmentRow().getByRole('button', { name: 'Add to Today', exact: true })
      ).toBeVisible();
      await developmentRow().getByRole('button', { name: 'Add to Today', exact: true }).click();
      await expect(developmentRow().getByTitle('Remove from Today', { exact: true })).toBeVisible();
      await page.goto('/cabinet');
      await select(participantId);
      await expect(tile.getByRole('checkbox', { name: title, exact: true })).toBeChecked();
    });
    await test.step('other participant and assessment/completion history are preserved', async () => {
      expect(
        (await profile.get()).data()?.participantTodayChecklists[runtime.studentParticipantId]
      ).toEqual(otherChecklist);
      await select(runtime.studentParticipantId);
      await expect(tile.getByRole('checkbox', { name: title, exact: true })).toBeVisible();
      await expect(
        tile.getByRole('checkbox', { name: 'Other participant reminder', exact: true })
      ).toBeChecked();
      expect((await db.doc(`participant_progress_events/${participantId}_2`).get()).data()).toEqual(
        maximumEvent
      );
      expect(
        (await db.doc(`participant_progress_events/${participantId}_3`).get()).data()
      ).toMatchObject({
        oldScores: { [skill.id]: skill.maxPoints },
        newScores: { [skill.id]: belowMax },
      });
      expect(
        (await profile.get()).data()?.participantTodayChecklists[participantId]
          .completedTodayTaskIds
      ).toContain(`skill:${skill.id}`);
    });
    healthyStudent();
    healthyCoach();
  } finally {
    await coachContext.close();
    await page.close();
    await profile.update({
      participantTodayChecklists: profileBefore.participantTodayChecklists ?? {},
    });
    const events = await db
      .collection('participant_progress_events')
      .where('participantId', '==', participantId)
      .limit(10)
      .get();
    const batch = db.batch();
    for (const ref of [
      ...refs,
      ...events.docs.map((doc: { ref: (typeof refs)[number] }) => doc.ref),
    ])
      batch.delete(ref);
    await batch.commit();
  }
});
