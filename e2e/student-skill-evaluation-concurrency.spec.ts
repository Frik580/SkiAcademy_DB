import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_SKILL_CONFIG, getSkillItemTitle } from '../src/domain/achievements';
import { ensureFirestore } from './firestore-admin';
import { createAuthUser, seedStudentAccount, seedWorkspaceAccount } from './global-setup';
import {
  loadRuntimeConfig,
  signInAccount,
  captureBrowserFailure,
  watchBrowserFailures,
} from './fixtures';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST } from './emulator-config';

const domain = createRequire(`${process.cwd()}/package.json`)(
  '@ski-academy/shared-domain'
) as typeof import('@ski-academy/shared-domain');

test('two instructors cannot overwrite an open assessment after a background refresh', async ({
  browser,
}, info) => {
  test.setTimeout(300_000);
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe(FIRESTORE_EMULATOR_HOST);
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9299');
  const runtime = loadRuntimeConfig();
  const db = ensureFirestore();
  const suffix = randomUUID().replace(/[0-9]/g, (digit) =>
    String.fromCharCode(103 + Number(digit))
  );
  const password = 'password123';
  const ownerEmail = `concurrency-owner-${suffix}@e2e.test`;
  const owner = await createAuthUser(ownerEmail, password);
  const studentName = `Concurrency Participant ${suffix}`;
  await seedStudentAccount({ studentUid: owner, email: ownerEmail, displayName: studentName });
  const participantId = domain.selfParticipantIdFromAccountId(domain.AccountIdSchema.parse(owner));
  const secondEmail = `concurrency-coach-${suffix}@e2e.test`;
  const secondAccount = await createAuthUser(secondEmail, password);
  const secondInstructor = `instructor_concurrency_${suffix}`;
  await seedWorkspaceAccount({
    uid: secondAccount,
    email: secondEmail,
    displayName: 'Concurrency Coach B',
    role: 'user',
    instructorId: secondInstructor,
  });
  await db.doc(`instructors/${secondInstructor}`).create({
    id: secondInstructor,
    name: 'Concurrency Coach B',
    specialty: 'ski',
    pricePerHour: 50,
    pricePerHourKZT: 12000,
    isAvailable: true,
    reviewsCount: 0,
  });
  const at = domain.timestampFromDate(new Date());
  const audit = {
    createdByCommandId: `seed_${suffix}`,
    lastChangedByCommandId: `seed_${suffix}`,
    correlationId: `seed_${suffix}`,
  };
  for (const [index, instructorId] of [runtime.workspaceInstructorId, secondInstructor].entries()) {
    const bookingId = `booking_concurrency_${index ? 'b' : 'a'}_${suffix}`;
    const occurrenceId = `occurrence_concurrency_${index ? 'b' : 'a'}_${suffix}`;
    const startsAt = domain.timestampFromDate(new Date(Date.now() - (index ? 1 : 3) * 3600000));
    const endsAt = domain.timestampFromDate(new Date(Date.now() - (index ? 0 : 2) * 3600000));
    const attendanceId = domain.attendanceIdFromBookingIdentity({
      strategyVersion: domain.ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: occurrenceId as never,
      participantId,
    });
    const booking = domain.BookingSchema.parse({
      bookingId,
      paymentId: domain.paymentIdFromBookingId(bookingId as never),
      payerAccountId: owner,
      party: { kind: 'individual', participantIds: [participantId] },
      attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId: owner } },
      occurrence: {
        occurrenceId,
        instructorId,
        interval: { startsAt, endsAt },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: [participantId], frozenAt: startsAt },
      },
      lifecycle: { status: 'confirmed' },
      revision: 1,
      createdAt: startsAt,
      updatedAt: at,
      audit,
    });
    await db.doc(`bookings/${bookingId}`).create(booking);
    await db.doc(`payments/${booking.paymentId}`).create(
      domain.PaymentSchema.parse({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
        payerAccountId: owner,
        currency: 'KZT',
        originalPrice: 10000,
        price: 10000,
        paidAmount: 10000,
        refundedAmount: 0,
        retainedAmount: 10000,
        settledAmount: 10000,
        writtenOffAmount: 0,
        outstandingAmount: 0,
        paymentStatus: 'paid',
        incrementalRequirements: [],
        revision: 1,
        eventRevision: 1,
        createdAt: startsAt,
        updatedAt: at,
      })
    );
    await db.doc(`attendance/${attendanceId}`).create(
      domain.AttendanceSchema.parse({
        attendanceId,
        subject: { subjectKind: 'booking', bookingId, occurrenceId, participantId },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId },
        lastChangedBy: { kind: 'instructor', instructorId },
        recordedAt: at,
        updatedAt: at,
        revision: 1,
        correlationId: audit.correlationId,
      })
    );
  }
  const config = (await db.doc('settings/skill_config').get()).data() ?? DEFAULT_SKILL_CONFIG;
  const skill = (config as typeof DEFAULT_SKILL_CONFIG).items.find(
    (item) => item.levelTarget === 1 && item.maxPoints >= 5
  )!;
  const title = getSkillItemTitle(skill, 'en');
  const ref = db.doc(`participant_progress/${participantId}`);
  await ref.create(
    domain.ParticipantProgressSchema.parse({
      participantId,
      level: 1,
      skillScores: { [skill.id]: 3 },
      skillComments: { [skill.id]: 'Работать над балансом' },
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit,
    })
  );
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({ baseURL: info.project.use.baseURL, timezoneId: 'Asia/Almaty' })
    )
  );
  const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
  const remote: string[] = [];
  for (const context of contexts)
    context.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      if (
        /firestore.*googleapis|identitytoolkit.*googleapis|securetoken.*googleapis|cloudfunctions\.net|firebaseio\.com/.test(
          host
        )
      )
        remote.push(req.url());
    });
  const healthy = [watchBrowserFailures(a), watchBrowserFailures(b)];
  const input = (page: Page) =>
    page
      .getByRole('dialog')
      .getByRole('heading', { name: title, exact: true })
      .locator('xpath=..')
      .locator('..')
      .locator('textarea');
  const open = async (page: Page) => {
    const button = page.getByRole('button', { name: `${studentName}: Assess`, exact: true });
    await expect(button).toBeEnabled({ timeout: 60000 });
    await button.click();
    await expect(input(page)).toHaveValue('Работать над балансом');
  };
  const edit = async (page: Page, score: number, text: string) => {
    const modal = page.getByRole('dialog');
    await modal
      .getByRole('button', { name: `${title}: ${score} / ${skill.maxPoints}`, exact: true })
      .click();
    await input(page).fill(text);
    await modal
      .getByRole('textbox', { name: 'Reason for correcting scores' })
      .fill('E2E observed assessment correction');
  };
  const save = async (page: Page) => {
    const result = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeCanonicalCommand') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.data?.kind === 'update_participant_progress'
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save Ratings', exact: true })
      .click();
    return await result;
  };
  try {
    for (const page of [a, b]) {
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(30000);
    }
    await signInAccount(a, {
      email: runtime.instructorEmail,
      password: runtime.instructorPassword,
      expectedPath: '/instructor',
    });
    await signInAccount(b, { email: secondEmail, password, expectedPath: '/instructor' });
    await open(a);
    await open(b);
    await edit(a, 4, 'Баланс улучшился');
    expect((await (await save(a)).json()).result.status).toBe('success');
    await expect(a.getByRole('dialog')).toHaveCount(0);
    expect((await ref.get()).data()).toMatchObject({
      revision: 2,
      skillScores: { [skill.id]: 4 },
      skillComments: { [skill.id]: 'Баланс улучшился' },
    });
    // Real authenticated read through the application's own service and Zustand
    // module instance; no request mocks and no direct store/data injection.
    const refreshedRevision = await b.evaluate(async (id) => {
      const serviceUrl = '/src/features/participant-progress/participantProgressService.ts';
      const storeUrl = '/src/features/participant-progress/participantProgressStore.ts';
      await (await import(serviceUrl)).refreshInstructorParticipantProgress([id]);
      return (await import(storeUrl)).useParticipantProgressStore.getState().byId[id].revision;
    }, participantId);
    expect(refreshedRevision).toBe(2);
    await expect(input(b)).toHaveValue('Работать над балансом');
    await edit(b, 5, 'Добавить упражнения на кантование');
    const rejected = await save(b);
    expect(rejected.request().postDataJSON().data.expectedRevision).toBe(1);
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).error.details).toMatchObject({
      code: 'stale_version',
      currentRevision: 2,
      retryable: false,
    });
    const message =
      "This participant's scores or comments were changed by another instructor. Your changes were not saved. Refresh the data and review it before saving again.";
    await expect(b.getByRole('alert')).toContainText(message);
    await expect(input(b)).toHaveValue('Добавить упражнения на кантование');
    await expect(b.getByRole('button', { name: 'Save Ratings', exact: true })).toBeDisabled();
    expect((await ref.get()).data()).toMatchObject({
      revision: 2,
      skillComments: { [skill.id]: 'Баланс улучшился' },
    });
    await b.getByRole('button', { name: 'Load current data', exact: true }).click();
    await expect(input(b)).toHaveValue('Баланс улучшился');
    await expect(b.getByRole('alert')).toHaveCount(0);
    await edit(b, 5, 'Добавить упражнения на кантование');
    const accepted = await save(b);
    expect(accepted.request().postDataJSON().data.expectedRevision).toBe(2);
    expect((await accepted.json()).result.status).toBe('success');
    await expect(b.getByRole('dialog')).toHaveCount(0);
    expect((await ref.get()).data()).toMatchObject({
      revision: 3,
      skillScores: { [skill.id]: 5 },
      skillComments: { [skill.id]: 'Добавить упражнения на кантование' },
    });
    healthy.forEach((check) => check());
    expect(remote).toEqual([]);
    await info.attach('concurrency-evidence', {
      body: JSON.stringify({
        projectId: E2E_PROJECT_ID,
        sessions: 2,
        baseRevision: 1,
        firstRevision: 2,
        staleRejected: true,
        refreshedRevision: 3,
        remoteFirebase: remote,
      }),
      contentType: 'application/json',
    });
  } catch (error) {
    await Promise.allSettled([captureBrowserFailure(a, info), captureBrowserFailure(b, info)]);
    throw error;
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
