import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { DEFAULT_SKILL_CONFIG, getSkillItemTitle } from '../src/domain/achievements';
import { ensureFirestore } from './firestore-admin';
import {
  captureBrowserFailure,
  loadRuntimeConfig,
  signInAccount,
  signInStudent,
  watchBrowserFailures,
} from './fixtures';
import { seedStudentAccount } from './global-setup';
import { AUTH_EMULATOR_HOST, E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST } from './emulator-config';

const requireRoot = createRequire(`${process.cwd()}/package.json`);
const {
  AccountIdSchema,
  selfParticipantIdFromAccountId,
  BookingSchema,
  PaymentSchema,
  paymentIdFromBookingId,
  AttendanceSchema,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  ParticipantProgressSchema,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test('authenticated coach comments preserve participant data and navigation', async ({
  browser,
  request,
}, info) => {
  test.setTimeout(300_000);
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe(FIRESTORE_EMULATOR_HOST);
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9299');
  const runtime = loadRuntimeConfig();
  expect(runtime.projectId).toBe(E2E_PROJECT_ID);
  const db = ensureFirestore();
  // Letter-only opaque entropy avoids a UUID digit run resembling a phone number
  // to canonical deterministic-identity privacy validation.
  const suffix = randomUUID().replace(/[0-9]/g, (digit) =>
    String.fromCharCode(103 + Number(digit))
  );
  const email = `coach-comments-${suffix}@e2e.test`;
  const password = 'password123';
  const nameA = `Comments A ${suffix}`;
  const nameB = `Comments B ${suffix}`;
  const signup = await request.post(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      data: { email, password, returnSecureToken: true },
    }
  );
  expect(signup.ok()).toBe(true);
  const { localId: accountId } = (await signup.json()) as { localId: string };
  const a = selfParticipantIdFromAccountId(AccountIdSchema.parse(accountId));
  const b = `participant_comments_b_${suffix}`;
  await seedStudentAccount({
    studentUid: accountId,
    email,
    displayName: nameA,
    childParticipantId: b,
    childParticipantManagementId: `management_comments_${suffix}`,
    childDisplayName: nameB,
  });
  const at = timestampFromDate(new Date());
  const start = timestampFromDate(new Date(Date.now() - 10 * 60_000));
  const end = timestampFromDate(new Date(Date.now() + 50 * 60_000));
  const audit = {
    createdByCommandId: `seed_${suffix}`,
    lastChangedByCommandId: `seed_${suffix}`,
    correlationId: `seed_${suffix}`,
  };
  const bookingId = `booking_comments_${suffix}`;
  const occurrenceId = `occurrence_comments_${suffix}`;
  const attendanceIds = [a, b].map((participantId) =>
    attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: occurrenceId as never,
      participantId: participantId as never,
    })
  );
  const booking = BookingSchema.parse({
    bookingId,
    paymentId: paymentIdFromBookingId(bookingId as never),
    payerAccountId: accountId,
    attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId } },
    party: { kind: 'family_group', participantIds: [a, b] },
    occurrence: {
      occurrenceId,
      instructorId: runtime.workspaceInstructorId,
      interval: { startsAt: start, endsAt: end },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [a, b], frozenAt: start },
    },
    lifecycle: { status: 'confirmed' },
    revision: 1,
    createdAt: start,
    updatedAt: at,
    audit,
  });
  await db.doc(`bookings/${bookingId}`).create(booking);
  await db.doc(`payments/${booking.paymentId}`).create(
    PaymentSchema.parse({
      paymentId: booking.paymentId,
      subjectType: 'booking',
      subjectId: bookingId,
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
      payerAccountId: accountId,
      incrementalRequirements: [],
      revision: 1,
      eventRevision: 1,
      createdAt: start,
      updatedAt: at,
    })
  );
  for (const [index, participantId] of [a, b].entries()) {
    const attendanceId = attendanceIds[index];
    await db.doc(`attendance/${attendanceId}`).create(
      AttendanceSchema.parse({
        attendanceId,
        subject: { subjectKind: 'booking', bookingId, occurrenceId, participantId },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId: runtime.workspaceInstructorId },
        lastChangedBy: { kind: 'instructor', instructorId: runtime.workspaceInstructorId },
        recordedAt: at,
        updatedAt: at,
        revision: 1,
        correlationId: audit.correlationId,
      })
    );
  }
  const unknown = `Historical skill note ${suffix}`;
  const progressRef = db.doc(`participant_progress/${a}`);
  await progressRef.create(
    ParticipantProgressSchema.parse({
      participantId: a,
      level: 1,
      skillScores: {},
      skillComments: { retired_skill: unknown },
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit,
    })
  );
  const config = (await db.doc('settings/skill_config').get()).data() ?? DEFAULT_SKILL_CONFIG;
  const skill = (config as typeof DEFAULT_SKILL_CONFIG).items.find(
    (item) => item.levelTarget === 1
  )!;
  expect(skill).toBeDefined();
  const title = getSkillItemTitle(skill, 'en');
  const comment = `Saved through instructor UI ${suffix}`;
  const coachContext = await browser.newContext({
    baseURL: info.project.use.baseURL,
    timezoneId: 'Asia/Almaty',
  });
  const studentContext = await browser.newContext({
    baseURL: info.project.use.baseURL,
    timezoneId: 'Asia/Almaty',
    viewport: { width: 1280, height: 960 },
    hasTouch: true,
  });
  const coach = await coachContext.newPage();
  const student = await studentContext.newPage();
  for (const page of [coach, student]) {
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(30_000);
  }
  const remoteFirebase: string[] = [];
  for (const context of [coachContext, studentContext])
    context.on('request', (req) => {
      const url = new URL(req.url());
      if (
        /(googleapis\.com|cloudfunctions\.net|firebaseio\.com|firebaseapp\.com|web\.app|run\.app)$/.test(
          url.hostname
        ) &&
        /firestore|firebase|identitytoolkit|securetoken|cloudfunctions|web\.app|run\.app/.test(
          url.hostname
        )
      )
        remoteFirebase.push(req.url());
    });
  const healthyCoach = watchBrowserFailures(coach);
  const healthyStudent = watchBrowserFailures(student);
  const scopedProgressReads: string[] = [];
  student.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().endsWith('/queryParticipantProgressReadModels'))
      return;
    const input = req.postDataJSON()?.data;
    if (input?.scope === 'managed' && input.participantIds?.length === 1)
      scopedProgressReads.push(input.participantIds[0]);
  });
  const switchTo = async (id: string) => {
    const avatar = student.getByRole('button', {
      name: `Switch to participant ${id === a ? nameA : nameB}`,
      exact: true,
    });
    await avatar.tap();
    await expect(avatar).toHaveAttribute('aria-pressed', 'true');
  };
  const openComments = async () => {
    await student
      .locator('[data-student-tab-bar]')
      .getByRole('button', { name: 'Coach', exact: true })
      .click();
    await switchTo(a);
    await student.getByRole('button', { name: /Comments on my skills/ }).click();
    await expect(
      student.getByRole('heading', { name: 'Comments on my skills', exact: true })
    ).toBeVisible();
  };
  const expectComment = async () => {
    await expect(student.getByText(`“${comment}”`, { exact: true })).toBeVisible();
    await expect(student.getByText(title, { exact: true })).toBeVisible();
    await expect(student.getByText('No comments yet.', { exact: false })).toHaveCount(0);
    await expect(student.getByText('Author unknown.', { exact: false })).toBeVisible();
    await expect(student.getByText(`“${unknown}”`, { exact: true })).toBeVisible();
  };
  try {
    await test.step('Authenticate both real sessions; cache the student before the coach saves', async () => {
      student.setDefaultTimeout(60_000);
      coach.setDefaultTimeout(60_000);
      const initialRead = student.waitForResponse(
        (response) =>
          response.url().endsWith('/queryParticipantProgressReadModels') &&
          response.request().method() === 'POST' &&
          response.request().postDataJSON()?.data?.scope === 'managed',
        { timeout: 60_000 }
      );
      await Promise.all([
        signInStudent(student, { studentEmail: email, studentPassword: password }),
        initialRead,
      ]);
      const initial = await initialRead;
      expect(initial.ok()).toBe(true);
      expect((await initial.json()).result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ participantId: a, skillComments: { retired_skill: unknown } }),
        ])
      );
      await signInAccount(coach, {
        email: runtime.instructorEmail,
        password: runtime.instructorPassword,
        expectedPath: '/instructor',
      });
      student.setDefaultTimeout(15_000);
      coach.setDefaultTimeout(15_000);
    });
    await test.step('Save assessment and comment through the instructor UI', async () => {
      await expect(
        coach.getByRole('button', { name: `${nameA}: Assess`, exact: true })
      ).toBeEnabled({ timeout: 60_000 });
      await coach.getByRole('button', { name: `${nameA}: Assess`, exact: true }).click();
      const modal = coach.getByRole('dialog');
      await modal
        .getByRole('button', { name: `${title}: 1 / ${skill.maxPoints}`, exact: true })
        .click();
      await modal.locator('textarea').first().fill(comment);
      const command = coach.waitForResponse(
        (response) =>
          response.url().endsWith('/executeCanonicalCommand') &&
          response.request().method() === 'POST' &&
          response.request().postDataJSON()?.data?.kind === 'update_participant_progress'
      );
      await modal.getByRole('button', { name: 'Save Ratings', exact: true }).click();
      const response = await command;
      expect(response.ok()).toBe(true);
      expect((await response.json()).result.status).toBe('success');
      await expect(modal).toHaveCount(0);
      await expect
        .poll(async () => (await progressRef.get()).data()?.skillComments?.[skill.id])
        .toBe(comment);
      expect((await progressRef.get()).data()).toMatchObject({
        participantId: a,
        skillScores: { [skill.id]: 1 },
      });
    });
    await test.step('Read saved canonical text; preserve section and isolate A → B → A', async () => {
      await openComments();
      await expectComment();
      await student.evaluate(
        ({ b, comment, unknown }) => {
          const state = window as typeof window & { participantLeaks: string[] };
          state.participantLeaks = [];
          new MutationObserver(() => {
            if (!document.querySelector(`[data-participant-id="${b}"][aria-pressed="true"]`))
              return;
            if ([comment, unknown].some((text) => document.body.textContent?.includes(text)))
              state.participantLeaks.push('A text while B selected');
          }).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
        },
        { b, comment, unknown }
      );
      await expect(
        student.getByText(`1 / ${skill.maxPoints} · ${Math.round(100 / skill.maxPoints)}%`, {
          exact: true,
        })
      ).toBeVisible();
      for (const id of [b, a, b, a]) {
        const beforeReads = scopedProgressReads.length;
        await switchTo(id);
        await expect(
          student.getByRole('heading', { name: 'Comments on my skills', exact: true })
        ).toBeVisible();
        await expect(student.locator('[data-student-tab-bar] [aria-current="page"]')).toHaveText(
          'Coach'
        );
        if (id === b) {
          await expect(student.getByText(`“${comment}”`, { exact: true })).toHaveCount(0);
          await expect(student.getByText(`“${unknown}”`, { exact: true })).toHaveCount(0);
          await expect(student.getByText('No comments yet.', { exact: false })).toBeVisible();
        } else await expectComment();
        expect(scopedProgressReads.slice(beforeReads)).toEqual([id]);
      }
      await switchTo(b);
      await switchTo(a);
      await expectComment();
      expect(
        await student.evaluate(
          () => (window as typeof window & { participantLeaks: string[] }).participantLeaks
        )
      ).toEqual([]);
    });
    await test.step('Keep the comment after reload and real sign-out/sign-in', async () => {
      await student.reload();
      await openComments();
      await expectComment();
      await student.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await expect(
        student.getByRole('button', { name: 'Sign In', exact: true }).first()
      ).toBeVisible();
      await signInStudent(student, { studentEmail: email, studentPassword: password });
      await openComments();
      await expectComment();
    });
    await test.step('A late real response cannot replace a newer zero assessment', async () => {
      // Pause an actual emulator HTTP response without changing its body/status.
      const cdp = await studentContext.newCDPSession(student);
      let pausedId: string | undefined;
      let held = false;
      cdp.on('Fetch.requestPaused', (event) => {
        const input = event.request.postData ? JSON.parse(event.request.postData)?.data : undefined;
        if (
          !held &&
          event.responseStatusCode === 200 &&
          input?.scope === 'managed' &&
          !input.participantIds?.length
        ) {
          held = true;
          pausedId = event.requestId;
        } else void cdp.send('Fetch.continueResponse', { requestId: event.requestId });
      });
      await cdp.send('Fetch.enable', {
        patterns: [{ urlPattern: '*queryParticipantProgressReadModels', requestStage: 'Response' }],
      });
      await student.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(() => pausedId).toBeTruthy();
      await openComments();
      await expectComment();
      await coach.getByRole('button', { name: `${nameA}: Assess`, exact: true }).click();
      const modal = coach.getByRole('dialog');
      await modal
        .getByRole('button', { name: `${title}: 0 / ${skill.maxPoints}`, exact: true })
        .click();
      await expect(modal.locator('textarea').first()).toHaveValue(comment);
      await modal
        .getByRole('textbox', { name: 'Reason for correcting scores' })
        .fill('E2E zero assessment correction');
      await modal.getByRole('button', { name: 'Save Ratings', exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect
        .poll(async () => (await progressRef.get()).data()?.skillScores?.[skill.id])
        .toBe(0);
      await switchTo(b);
      await switchTo(a);
      await expectComment();
      await expect(student.getByText(`0 / ${skill.maxPoints} · 0%`, { exact: true })).toBeVisible();
      const lateResponse = student.waitForResponse(
        (response) =>
          response.url().endsWith('/queryParticipantProgressReadModels') &&
          response.request().method() === 'POST' &&
          response.request().postDataJSON()?.data?.scope === 'managed' &&
          !response.request().postDataJSON()?.data?.participantIds?.length
      );
      await cdp.send('Fetch.continueResponse', { requestId: pausedId! });
      const late = await lateResponse;
      await late.finished();
      const oldItems = (await late.json()).result.items as {
        participantId: string;
        revision: number;
      }[];
      expect(oldItems.find((item) => item.participantId === a)!.revision).toBeLessThan(
        (await progressRef.get()).data()!.revision
      );
      await student.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await expect(student.getByText(`0 / ${skill.maxPoints} · 0%`, { exact: true })).toBeVisible();
      await expectComment();
      await cdp.send('Fetch.disable');
      await cdp.detach();
    });
    await test.step('A real network failure offers retry and does not pretend to be empty', async () => {
      await studentContext.setOffline(true);
      await switchTo(b);
      await expect(student.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(student.getByText('No comments yet.', { exact: false })).toHaveCount(0);
      await studentContext.setOffline(false);
      await student.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(student.getByText('No comments yet.', { exact: false })).toBeVisible();
      await switchTo(a);
      await expectComment();
    });
    await test.step('RU and EN retain the current participant and comment', async () => {
      const language = student.getByRole('group', { name: /Switch language|Сменить язык/ });
      await language.getByRole('button', { name: 'RU', exact: true }).click();
      await expect(
        student.getByRole('heading', { name: 'Комментарии к моим навыкам', exact: true })
      ).toBeVisible();
      await expect(student.getByText(`“${comment}”`, { exact: true })).toBeVisible();
      await language.getByRole('button', { name: 'EN', exact: true }).click();
      await expectComment();
    });
    await test.step('Keep video, homework and recommendation subviews across participant switches', async () => {
      for (const [section, empty] of [
        ['Video reviews', 'No video reviews yet.'],
        ['Homework', 'No homework yet.'],
        ['Recommendations', 'No recommendations yet.'],
      ]) {
        await student
          .getByRole('button', { name: runtime.workspaceInstructorName, exact: true })
          .click();
        await student.getByRole('button', { name: new RegExp(section) }).click();
        for (const id of [b, a]) {
          await switchTo(id);
          await expect(student.getByRole('heading', { name: section, exact: true })).toBeVisible();
          await expect(student.getByText(empty, { exact: false })).toBeVisible();
          await expect(student.locator('[data-student-tab-bar] [aria-current="page"]')).toHaveText(
            'Coach'
          );
        }
      }
    });
    await test.step('Mobile avatar gestures do not trigger global navigation; ordinary swipe works', async () => {
      await student.setViewportSize({ width: 390, height: 844 });
      const avatar = student.getByRole('button', {
        name: `Switch to participant ${nameB}`,
        exact: true,
      });
      await avatar.evaluate((el) => {
        const start = new Touch({ identifier: 1, target: el, clientX: 300, clientY: 50 });
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
        const end = new Touch({ identifier: 1, target: el, clientX: 50, clientY: 50 });
        el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }));
      });
      await switchTo(b);
      await expect(
        student.getByRole('heading', { name: 'Recommendations', exact: true })
      ).toBeVisible();
      await student.locator('main').evaluate((el) => {
        const start = new Touch({ identifier: 2, target: el, clientX: 300, clientY: 300 });
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
        const end = new Touch({ identifier: 2, target: el, clientX: 50, clientY: 300 });
        el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }));
      });
      await expect(student.locator('[data-student-tab-bar] [aria-current="page"]')).toHaveText(
        'Training'
      );
    });
    healthyCoach();
    healthyStudent();
    expect(remoteFirebase).toEqual([]);
    await info.attach('local-authenticated-evidence', {
      body: JSON.stringify({
        projectId: E2E_PROJECT_ID,
        sessions: 2,
        participantIds: [a, b],
        savedProgress: (await progressRef.get()).data(),
        remoteFirebase,
        scopedProgressReads,
      }),
      contentType: 'application/json',
    });
  } catch (error) {
    await Promise.allSettled([
      captureBrowserFailure(coach, info),
      captureBrowserFailure(student, info),
    ]);
    throw error;
  } finally {
    await Promise.allSettled([coachContext.close(), studentContext.close()]);
  }
});
