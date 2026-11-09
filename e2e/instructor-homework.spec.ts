import { createRequire } from 'node:module';
import { test, expect, type Request } from '@playwright/test';
import { translations } from '../src/lib/i18n/translations';
import { loadRuntimeConfig, signInAccount } from './fixtures';
import {
  AUTH_EMULATOR_HOST,
  E2E_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  functionsCallableUrl,
} from './emulator-config';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');
const { BookingSchema, timestampFromDate } = requireFunctions('@ski-academy/shared-domain');

function isHomeworkRead(request: Request) {
  return (
    request.url().includes('/google.firestore.v1.Firestore/Listen/channel') &&
    decodeURIComponent(request.postData() ?? '').includes('isHomework')
  );
}

test('instructor homework uses authenticated lesson chats and paginates by source messages', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(30_000);
  const config = loadRuntimeConfig();
  const app = initializeApp({ projectId: E2E_PROJECT_ID }, 'instructor-homework');
  const db = getFirestore(app);
  db.settings({ host: FIRESTORE_EMULATOR_HOST, ssl: false });
  const suffix = testInfo.repeatEachIndex;
  const group = `homework_${suffix}_group`;
  const solo = `homework_${suffix}_solo`;
  const foreign = `homework_${suffix}_foreign`;
  const a = config.studentParticipantId;
  const b = config.studentChildParticipantId;
  const batch = db.batch();
  const paths: string[] = [];
  function seed(path: string, data: Record<string, unknown>) {
    paths.push(path);
    batch.set(db.doc(path), data);
  }
  for (const [index, id] of [group, solo, foreign].entries()) {
    const startsAt = new Date(Date.now() + (index + 1) * 86400_000);
    const at = timestampFromDate(new Date());
    const participantIds = id === group ? [a, b] : [a];
    seed(
      `bookings/${id}`,
      BookingSchema.parse({
        bookingId: id,
        attribution: {
          bookingOrigin: 'admin',
          bookedBy: { kind: 'account', accountId: config.studentUid },
        },
        party: { kind: id === group ? 'family_group' : 'individual', participantIds },
        occurrence: {
          occurrenceId: `occ_${id}`,
          instructorId: id === foreign ? config.instructorId : config.workspaceInstructorId,
          interval: {
            startsAt: timestampFromDate(startsAt),
            endsAt: timestampFromDate(new Date(startsAt.getTime() + 3600_000)),
          },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds, frozenAt: at },
        },
        lifecycle: { status: 'confirmed' },
        paymentId: `payment_${id}`,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'seed_homework',
          lastChangedByCommandId: 'seed_homework',
          correlationId: 'seed_homework',
        },
      })
    );
  }
  const expectedA: string[] = [];
  for (let i = 44; i >= 0; i--) {
    const thread = i >= 25 || i % 2 === 0 ? group : solo;
    const id = String(i).padStart(2, '0');
    const text = `Homework fixture ${id}`;
    const targets = i >= 25 ? [b] : i === 24 ? [a] : [];
    seed(`bookings/${thread}/messages/${id}`, {
      bookingId: thread,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, i < 2 ? 0 : i)).toISOString(),
      text,
      isHomework: true,
      homeworkForParticipantIds: targets,
    });
    if (i < 25) expectedA.push(text);
  }
  seed(`bookings/${foreign}/messages/private`, {
    timestamp: '2026-01-01T00:00:00.000Z',
    text: 'Private fixture',
    isHomework: true,
  });
  await batch.commit();

  try {
    const auth = await request.post(
      `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
      {
        data: {
          email: config.instructorEmail,
          password: config.instructorPassword,
          returnSecureToken: true,
        },
      }
    );
    expect(auth.ok()).toBe(true);
    const { idToken } = await auth.json();
    const denied = await request.get(
      `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${E2E_PROJECT_ID}/databases/(default)/documents/bookings/${foreign}/messages/private`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error.status).toBe('PERMISSION_DENIED');

    // Verify that the seeded lessons reach the canonical schedule and warm its cold worker.
    const schedule = await request.post(functionsCallableUrl('queryLessonBookingReadModels'), {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { data: { scope: 'instructor_hot', idempotencyKey: 'read:homework:e2e:schedule' } },
      timeout: 60_000,
    });
    expect(schedule.ok()).toBe(true);
    const { result } = await schedule.json();
    expect(result.items.map((item: { bookingId: string }) => item.bookingId).sort()).toEqual([
      group,
      solo,
    ]);

    await page.addInitScript(() => {
      localStorage.setItem('alpine_glide_lang', localStorage.getItem('alpine_glide_lang') ?? 'en');
      localStorage.setItem('theme', 'dark');
    });
    const homeworkReads: Request[] = [];
    page.on('request', (req) => {
      if (isHomeworkRead(req)) homeworkReads.push(req);
    });
    await signInAccount(page, {
      email: config.instructorEmail,
      password: config.instructorPassword,
      expectedPath: '/instructor',
    });
    await page.setViewportSize({ width: 390, height: 844 });

    const openButtons = (student: string, language: 'en' | 'ru') =>
      page.getByRole('button', {
        name: `${student}: ${translations[language].lessonContextTitle}`,
        exact: true,
      });
    const dialog = page.getByTestId('instructor-lesson-context');
    const section = (language: 'en' | 'ru') =>
      dialog.getByRole('region', { name: translations[language].scCoachHomework });
    const toggle = (language: 'en' | 'ru') =>
      section(language).getByRole('button', { name: translations[language].scCoachHomework });
    const cards = section('en').getByRole('article');
    const more = section('en').getByRole('button', { name: translations.en.historyShowMore });

    const openA = openButtons(config.studentDisplayName, 'en');
    await expect(openA).toHaveCount(2, { timeout: 60_000 });
    await openA.first().focus();
    await page.keyboard.press('Enter');
    await expect(section('en').getByText(translations.en.lessonHomeworkScope)).toBeVisible();
    await expect(toggle('en')).toHaveAttribute('aria-expanded', 'false');
    expect(homeworkReads).toHaveLength(0);
    await toggle('en').focus();
    await page.keyboard.press('Space');
    await expect(section('en').getByText(translations.en.lessonHomeworkEmptyPage)).toBeVisible();
    await expect(section('en').getByText(translations.en.lessonHomeworkEmpty)).toHaveCount(0);
    await expect(cards).toHaveCount(0);
    expect(homeworkReads.length).toBeGreaterThan(0);
    await more.click();
    await expect(cards).toHaveCount(20);
    await more.click();
    await expect(more).toHaveCount(0);
    await expect(cards.getByText(/^Homework fixture /)).toHaveText(expectedA);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(openA.first()).toBeFocused();

    const openB = openButtons(config.studentChildDisplayName, 'en');
    await openB.click();
    await toggle('en').click();
    await expect(cards.getByText('Homework fixture 44', { exact: true })).toBeVisible();
    await more.click();
    await expect(cards.getByText('Homework fixture 22', { exact: true })).toBeVisible();
    await expect(cards.getByText('Homework fixture 24', { exact: true })).toHaveCount(0);
    await expect(cards).toHaveCount(32);
    await page.keyboard.press('Escape');

    // Hold a real Firestore request while closing B and opening A on another Booking.
    let releaseRead!: () => void;
    const heldRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const listen = '**/google.firestore.v1.Firestore/Listen/channel?**';
    let held = false;
    await page.route(listen, async (route) => {
      if (!held && isHomeworkRead(route.request())) {
        held = true;
        await heldRead;
      }
      await route.continue();
    });
    try {
      await openB.click();
      const started = page.waitForRequest(isHomeworkRead);
      await toggle('en').click();
      await started;
      await expect(more).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await openA.last().click();
      await expect(toggle('en')).toHaveAttribute('aria-expanded', 'false');
      await toggle('en').click();
      releaseRead();
      await expect(section('en').getByText(translations.en.lessonHomeworkEmptyPage)).toBeVisible();
      await expect(cards).toHaveCount(0);
      await page.keyboard.press('Escape');
    } finally {
      releaseRead();
      await page.unroute(listen);
    }

    // Revoke a previously discovered source while the schedule still holds its original snapshot.
    await db.doc(`bookings/${group}`).update({ 'occurrence.instructorId': config.instructorId });
    await openA.last().click();
    await toggle('en').click();
    await expect(section('en').getByText(translations.en.lessonHomeworkDenied)).toBeVisible();
    await expect(cards.getByText('Homework fixture 23', { exact: true })).toBeVisible();
    await expect(cards.getByText('Homework fixture 24', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTitle(translations.en.switchToLight).click();
    await page.getByRole('button', { name: 'RU', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await openButtons(config.studentDisplayName, 'ru').last().click();
    await expect(section('ru').getByText(translations.ru.lessonHomeworkScope)).toBeVisible();
    await toggle('ru').click();
    await expect(section('ru').getByText('Homework fixture 23', { exact: true })).toBeVisible();
  } finally {
    const cleanup = db.batch();
    for (const path of paths) cleanup.delete(db.doc(path));
    await cleanup.commit();
    await db.terminate();
    await deleteApp(app);
  }
});
