import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { loadRuntimeConfig, signInAccount, watchBrowserFailures } from './fixtures';
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
  const status = page
    .getByRole('status')
    .filter({ hasText: /Unavailable|125.000|75.000|Недоступно/ });
  // The Functions emulator starts a separate cold worker for this new callable.
  await expect(status).toHaveText('Unavailable', { timeout: 60000 });
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
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await signInAccount(page, {
    email: config.instructorEmail,
    password: config.instructorPassword,
    expectedPath: '/instructor',
  });
  await expect(page.getByRole('status').filter({ hasText: '75' })).toHaveText(/75\s000\s₸/);
  assertNoBrowserFailures();
});
