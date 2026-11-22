import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { loadRuntimeConfig, signInAccount, signOutAccount, watchBrowserFailures } from './fixtures';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST } from './emulator-config';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { getApps, initializeApp } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');
const { BookingSchema, PaymentSchema, timestampFromDate } = requireFunctions(
  '@ski-academy/shared-domain'
);
const { reconcileInstructorLessonRevenue } = requireFunctions(
  './lib/canonical/readModels/instructorLessonRevenueProjection.js'
);

test('instructor lifetime revenue updates after refund, reload and sign-in with RU/EN responsive themes', async ({
  page,
}, testInfo) => {
  test.setTimeout(300000);
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
  const app =
    getApps().find((item) => item.name === '[DEFAULT]') ??
    initializeApp({ projectId: E2E_PROJECT_ID });
  const db = getFirestore(app);
  const config = loadRuntimeConfig();
  const id = 'revenue_browser_booking';
  const at = timestampFromDate(new Date('2026-01-15T10:00:00Z'));
  const booking = BookingSchema.parse({
    bookingId: id,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: 'revenue_admin' },
    },
    party: { kind: 'individual', participantIds: [config.studentParticipantId] },
    occurrence: {
      occurrenceId: `occ_${id}`,
      instructorId: config.workspaceInstructorId,
      interval: { startsAt: timestampFromDate(new Date('2026-01-15T09:00:00Z')), endsAt: at },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: {
        frozenAt: at,
        participantIds: [config.studentParticipantId],
      },
    },
    lifecycle: { status: 'completed', completedAt: at },
    paymentId: `payment_${id}`,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: 'seed_revenue',
      lastChangedByCommandId: 'seed_revenue',
      correlationId: 'revenue_browser',
    },
  });
  const payment = PaymentSchema.parse({
    paymentId: booking.paymentId,
    subjectType: 'booking',
    subjectId: id,
    currency: 'KZT',
    originalPrice: 125000,
    price: 125000,
    paidAmount: 125000,
    retainedAmount: 125000,
    settledAmount: 125000,
    refundedAmount: 0,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt: at,
    updatedAt: at,
  });
  await db.doc(`payments/${payment.paymentId}`).set(payment);
  await db.doc(`bookings/${id}`).set(booking);
  const assertNoBrowserFailures = watchBrowserFailures(page);
  page.on('pageerror', (error) => console.error(`Revenue browser exception: ${error.message}`));
  await page.addInitScript(() =>
    localStorage.setItem('alpine_glide_lang', localStorage.getItem('alpine_glide_lang') ?? 'en')
  );
  await signInAccount(page, {
    email: config.instructorEmail,
    password: config.instructorPassword,
    expectedPath: '/instructor',
  });
  const status = page.getByRole('status').filter({ hasText: /No data|125.000|75.000|Нет данных/ });
  // The Functions emulator starts a separate cold worker for this new callable.
  await expect(status).toHaveText('No data', { timeout: 60000 });
  await reconcileInstructorLessonRevenue(db);
  await expect(page.getByRole('status').filter({ hasText: '125' })).toHaveText(/125\s000\s₸/);

  await db.doc(`payments/${payment.paymentId}`).set(
    PaymentSchema.parse({
      ...payment,
      originalPrice: 125000,
      price: 125000,
      paidAmount: 125000,
      settledAmount: 125000,
      refundedAmount: 50000,
      retainedAmount: 75000,
      revision: 2,
      paymentStatus: 'partially_refunded',
    })
  );
  await expect(page.getByRole('status').filter({ hasText: '75' })).toHaveText(/75\s000\s₸/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Revenue from completed lessons', { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole('status').filter({ hasText: '75' })).toHaveText(/75\s000\s₸/);
  for (const language of ['ru', 'en']) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: language.toUpperCase(), exact: true }).click();
      const isDark = await page
        .locator('html')
        .evaluate((element) => element.classList.contains('dark'));
      if (isDark !== (theme === 'dark')) {
        const toggleName =
          language === 'ru'
            ? theme === 'dark'
              ? 'Переключить на темную тему'
              : 'Переключить на светлую тему'
            : theme === 'dark'
              ? 'Switch to Dark'
              : 'Switch to Light';
        await page.getByRole('button', { name: toggleName, exact: true }).click();
      }
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(
          page.getByText(
            language === 'ru' ? 'Выручка за проведённые занятия' : 'Revenue from completed lessons',
            { exact: true }
          )
        ).toBeVisible();
        const value = page.getByRole('status').filter({ hasText: '75' });
        await expect(value).toHaveText(/75\s000\s₸/);
        const bounds = await value.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        const typography = await value.evaluate((element) => {
          const style = getComputedStyle(element);
          return { family: style.fontFamily, lineHeight: Number.parseFloat(style.lineHeight) };
        });
        expect(typography.family).toContain('DM Sans');
        expect(bounds!.height).toBeLessThanOrEqual(typography.lineHeight + 1);
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
        await page.screenshot({
          path: testInfo.outputPath(`revenue-${language}-${theme}-${width}.png`),
          animations: 'disabled',
        });
      }
    }
  }
  await signOutAccount(page);
  await signInAccount(page, {
    email: config.instructorEmail,
    password: config.instructorPassword,
    expectedPath: '/instructor',
  });
  await expect(page.getByRole('status').filter({ hasText: '75' })).toHaveText(/75\s000\s₸/);
  assertNoBrowserFailures();
});

test('instructor subscriptions move to the active TEST assignment without retaining the old projection', async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe(FIRESTORE_EMULATOR_HOST);
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9299');
  const app =
    getApps().find((item) => item.name === '[DEFAULT]') ??
    initializeApp({ projectId: E2E_PROJECT_ID });
  const db = getFirestore(app);
  const config = loadRuntimeConfig();
  const { getAuth } = requireFunctions(
    'firebase-admin/auth'
  ) as typeof import('firebase-admin/auth');
  const { TestActorSchema, TestActorAssignmentSchema, TestSessionSchema } = requireFunctions(
    '@ski-academy/shared-domain'
  ) as typeof import('@ski-academy/shared-domain');
  const { uid } = await getAuth(app).getUserByEmail(config.instructorEmail);
  const scopeA = 'test_session_instructor_browser_a';
  const scopeB = 'test_session_instructor_browser_b';
  const instructorId = config.workspaceInstructorId;
  const profile = db.doc(`users/${uid}`);
  const actor = db.doc(`test_actors/${uid}`);
  const assignment = db.doc(`test_actor_assignments/${uid}`);
  const sessionA = db.doc(`test_sessions/${scopeA}`);
  const sessionB = db.doc(`test_sessions/${scopeB}`);
  const globalState = db.doc('instructor_lesson_revenue/state');
  const projection = (id: string) =>
    db.doc(`instructor_lesson_revenue/test_${id}/instructors/${instructorId}`);
  const fixtureBefore = await db.getAll(
    profile,
    actor,
    assignment,
    sessionA,
    sessionB,
    globalState,
    projection(scopeA),
    projection(scopeB)
  );
  const at = timestampFromDate(new Date());
  const audit = {
    createdByCommandId: 'seed_instructor_browser_scope',
    lastChangedByCommandId: 'seed_instructor_browser_scope',
    correlationId: 'instructor_browser_scope',
  };
  const metadata = { revision: 1, createdAt: at, updatedAt: at, audit };
  const session = (testSessionId: string, status: 'locked' | 'active') =>
    TestSessionSchema.parse({
      ...metadata,
      testSessionId,
      schemaVersion: 1,
      status,
      label: 'Browser scope fixture',
      createdByAccountId: uid,
      config: { startingBalanceKzt: 0, clonedCourseIds: [] },
      inventoryRevision: 0,
    });
  const assign = (activeTestSessionId: string, revision: number) =>
    TestActorAssignmentSchema.parse({
      accountId: uid,
      activeTestSessionId,
      revision,
      updatedAt: at,
      audit,
    });
  const summary = (retainedAmount: number, revision = 1) => ({
    retainedAmount,
    revision,
    unavailableCount: 0,
  });

  try {
    const prepare = db.batch();
    prepare.update(profile, { dataScope: 'test' });
    prepare.set(
      actor,
      TestActorSchema.parse({
        ...metadata,
        accountId: uid,
        kind: 'test_instructor',
        instructorId,
        participantIds: ['participant_instructor_browser'],
        dataScope: 'test',
        allowed: true,
      })
    );
    prepare.set(assignment, assign(scopeA, 1));
    prepare.set(sessionA, session(scopeA, 'active'));
    prepare.set(sessionB, session(scopeB, 'locked'));
    prepare.set(globalState, { ready: true });
    prepare.set(projection(scopeA), summary(11001));
    prepare.set(projection(scopeB), summary(22002));
    await prepare.commit();

    await signInAccount(page, {
      email: config.instructorEmail,
      password: config.instructorPassword,
      expectedPath: '/instructor',
    });
    const amount = (pattern: RegExp) => page.getByRole('status').filter({ hasText: pattern });
    await expect(amount(/11\s001\s₸/)).toBeVisible({ timeout: 50_000 });
    await expect(amount(/22\s002\s₸/)).toHaveCount(0);
    await projection(scopeA).set(summary(11002, 2));
    await expect(amount(/11\s002\s₸/)).toBeVisible();

    const switchScope = db.batch();
    switchScope.set(sessionA, session(scopeA, 'locked'));
    switchScope.set(sessionB, session(scopeB, 'active'));
    switchScope.set(assignment, assign(scopeB, 2));
    await switchScope.commit();
    await expect(amount(/22\s002\s₸/)).toBeVisible();
    await expect(amount(/11\s00[12]\s₸/)).toHaveCount(0);

    // Updates in both scopes distinguish a live subscription from a one-off read.
    await projection(scopeA).set(summary(99009, 3));
    await projection(scopeB).set(summary(22003, 2));
    await expect(amount(/22\s003\s₸/)).toBeVisible();
    await expect(amount(/99\s009\s₸/)).toHaveCount(0);
    await expect(page.getByText('Revenue from completed lessons', { exact: true })).toBeVisible();
  } finally {
    const restore = db.batch();
    for (const snapshot of fixtureBefore) {
      if (snapshot.exists) restore.set(snapshot.ref, snapshot.data()!);
      else restore.delete(snapshot.ref);
    }
    await restore.commit();
  }
});
