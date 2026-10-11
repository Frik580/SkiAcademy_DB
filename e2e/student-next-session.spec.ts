import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import {
  loadRuntimeConfig,
  signInStudent,
  watchBrowserFailures,
  openStudentBookingModal,
  fillBookingSelectors,
  ensureParticipantSelected,
  submitStudentBookingConfirmation,
  waitForNewBlockingBookingForPayer,
} from './fixtures';
import {
  seedE2ECourse,
  hasCourseEnrollment,
  getBlockingBookingIdsForPayer,
  getBookingRecord,
} from './firestore-admin';
import { waitForFunctionsEmulatorReady } from './global-setup';
import { canonicalTimestampToEpochMs } from '../packages/shared-domain/src/canonical/bookingCancellationPolicy';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
function emulatorDb() {
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  return requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
}

test('Next Session keeps account courses and family lesson actions, calendar, live boundaries and four variants', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const r = loadRuntimeConfig();
  const db = emulatorDb();
  r.studentChildDisplayName =
    'E2E Child Skier with a long participant name to verify text wrapping';
  await db
    .doc(`participants/${r.studentChildParticipantId}`)
    .update({ displayName: r.studentChildDisplayName });
  const healthy = watchBrowserFailures(page);
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.route('**/next-session-avatar.svg*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="teal"/></svg>',
    })
  );
  for (const [id, suffix] of [
    [r.studentParticipantId, 'a'],
    [r.studentChildParticipantId, 'b'],
  ]) {
    await db
      .doc(`participants/${id}`)
      .update({ avatarUrl: `http://127.0.0.1:5173/next-session-avatar.svg?${suffix}` });
  }
  await db.doc(`instructors/${r.instructorId}`).update({ phoneNumber: '+7 (701) 123-45-67' });
  const courseId = 'course_e2e_next_session';
  const title = 'E2E Next Session Alpine Course with a long descriptive title';
  await seedE2ECourse({
    courseId,
    title,
    instructorId: r.instructorId,
    dayOffset: 3,
    discipline: 'ski',
  });
  await waitForFunctionsEmulatorReady();
  await signInStudent(page, r);
  await page.goto('/cabinet/courses', { waitUntil: 'domcontentloaded' });
  const listing = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  // The current command requires account_owner for self and parent_guardian for a dependent.
  // Use two supported enrollment operations, then verify one account-level course-day card.
  for (const [id, name] of [
    [r.studentParticipantId, r.studentDisplayName],
    [r.studentChildParticipantId, r.studentChildDisplayName],
  ]) {
    const picker = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible');
    await picker.locator(`[data-participant-id="${id}"]`).click();
    await listing.getByRole('button', { name: 'Enroll', exact: true }).click();
    const enrollment = page.getByRole('dialog', { name: 'Course Enrollment' });
    await enrollment.getByRole('button', { name: new RegExp(name) }).click();
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'create_course_enrollments'
    );
    await enrollment.getByRole('button', { name: 'Enroll', exact: true }).click();
    const creationResponse = await created;
    const creationBody = await creationResponse.json();
    expect(creationResponse.ok(), JSON.stringify(creationBody)).toBe(true);
    expect(creationBody.result, JSON.stringify(creationBody)).toMatchObject({ status: 'success' });
    await expect.poll(() => hasCourseEnrollment(courseId, id)).toBe(true);
    await expect(enrollment).not.toBeVisible();
  }
  const before = await getBlockingBookingIdsForPayer(r.studentUid);
  await openStudentBookingModal(page, r);
  await fillBookingSelectors(page, 5, {
    participantDisplayName: r.studentDisplayName,
    time: '14:00',
  });
  const bookingModal = page
    .locator('.ui-modal')
    .filter({ has: page.getByRole('button', { name: 'Select Date', exact: true }) });
  await ensureParticipantSelected(bookingModal, r.studentChildDisplayName);
  await submitStudentBookingConfirmation(page);
  const booking = await waitForNewBlockingBookingForPayer(
    r.studentUid,
    before,
    (item) => item.lifecycleStatus === 'confirmed'
  );
  const record = await getBookingRecord(booking.bookingId);
  expect(record?.party.participantIds).toEqual(
    expect.arrayContaining([r.studentParticipantId, r.studentChildParticipantId])
  );
  const day = (await db.doc(`courses/${courseId}/days/${courseId}_day_1`).get()).data()!;
  const startsAt = canonicalTimestampToEpochMs(day.interval.startsAt);
  const endsAt = canonicalTimestampToEpochMs(day.interval.endsAt);
  await page.clock.install({ time: new Date(startsAt - 3_600_000) });
  await page.goto('/cabinet', { waitUntil: 'domcontentloaded' });
  const tile = page.locator('[data-dashboard-tile="nextSession"]');
  const course = tile.getByRole('article').filter({ hasText: title });
  const lesson = tile
    .getByRole('article')
    .filter({ has: page.getByRole('button', { name: /Chat/ }) });
  await expect(tile.getByRole('article')).toHaveCount(2);
  await expect(course).toContainText('14:00–16:00');
  const lessonTime = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  });
  await expect(lesson).toContainText(
    `${lessonTime.format(new Date(canonicalTimestampToEpochMs(record!.occurrence.interval.startsAt)))}–${lessonTime.format(new Date(canonicalTimestampToEpochMs(record!.occurrence.interval.endsAt)))}`
  );
  for (const card of [course, lesson]) {
    await expect(card).toContainText(r.studentDisplayName);
    await expect(card).toContainText(r.studentChildDisplayName);
    await expect(card.locator('img')).toHaveCount(2);
    for (const img of await card.locator('img').all()) {
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
        .toBe(true);
    }
  }
  await expect(tile.locator('.sc-next-session-day')).toHaveCount(7);
  await expect(tile.locator('[aria-current="date"]')).toHaveText(
    new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'Asia/Almaty' }).format(
      new Date(startsAt)
    )
  );
  await expect(tile.locator('.sc-next-session-days button')).toHaveCount(0);
  const reads: string[] = [];
  const pendingReads = new Set<import('@playwright/test').Request>();
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/query\w+ReadModels$/.test(request.url())) {
      pendingReads.add(request);
      reads.push(`${request.url().split('/').pop()}:${request.postDataJSON()?.data?.scope ?? ''}`);
    }
  });
  page.on('requestfinished', (request) => pendingReads.delete(request));
  page.on('requestfailed', (request) => pendingReads.delete(request));
  page.on('response', (response) => pendingReads.delete(response.request()));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) pendingReads.clear();
  });
  const header = page
    .getByRole('banner')
    .locator('[data-testid="navbar-participant-switcher"]:visible');
  for (const id of [r.studentChildParticipantId, r.studentParticipantId]) {
    await header.locator(`[data-participant-id="${id}"]`).click();
    await expect(header.locator(`[data-participant-id="${id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(tile.getByRole('article')).toHaveCount(2);
    await expect(course).toContainText(r.studentDisplayName);
    await expect(course).toContainText(r.studentChildDisplayName);
  }
  await info.attach('switch-read-observations', {
    body: JSON.stringify(reads),
    contentType: 'application/json',
  });
  const browserTimezone = await page.context().newCDPSession(page);
  for (const timezoneId of ['Asia/Almaty', 'UTC', 'America/New_York']) {
    await browserTimezone.send('Emulation.setTimezoneOverride', { timezoneId });
    await page.clock.runFor(1000);
    await expect(course).toContainText('14:00–16:00');
    await expect(tile.getByRole('article')).toHaveCount(2);
  }
  await browserTimezone.detach();
  await page
    .getByRole('group', { name: 'Switch language' })
    .getByRole('button', { name: 'RU', exact: true })
    .click();
  await expect(tile.getByRole('heading', { level: 2 })).toHaveText('Следующая тренировка или курс');
  for (const [name, width, height, dark] of [
    ['desktop-light', 1440, 1000, false],
    ['mobile-light', 390, 844, false],
    ['desktop-dark', 1440, 1000, true],
    ['mobile-dark', 390, 844, true],
    ['narrow-dark', 320, 844, true],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark);
    await tile.scrollIntoViewIfNeeded();
    expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(
      await course.getByRole('heading').evaluate((el) => getComputedStyle(el).fontFamily)
    ).toContain('DM Sans');
    for (const control of await tile.locator('button, a').all()) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect((await control.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    }
    await tile.screenshot({
      path: info.outputPath(`${name}.png`),
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('group', { name: /Switch language|Сменить язык/ })
    .getByRole('button', { name: 'EN', exact: true })
    .click();
  await lesson.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(r.instructorName);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .first()
    .click();
  await lesson.getByRole('button', { name: /Chat/ }).click();
  const chat = page
    .locator('.ui-modal')
    .filter({ has: page.getByRole('heading', { name: 'Lesson Discussion', exact: true }) });
  await expect(chat).toBeVisible();
  await chat.getByTitle('Close', { exact: true }).click();
  const phone = lesson.getByRole('link', { name: 'Call coach' });
  await expect(phone).toHaveAttribute('href', 'tel:+77011234567');
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      (event) => {
        const contact = (event.target as Element).closest('a[href^="tel:"]');
        if (contact) {
          event.preventDefault();
          document.documentElement.dataset.activatedPhone = contact.getAttribute('href') ?? '';
        }
      },
      true
    )
  );
  await phone.focus();
  await expect(phone).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.documentElement.dataset.activatedPhone)).toBe(
    'tel:+77011234567'
  );
  await course.getByRole('button', { name: 'Details', exact: true }).click();
  const courseDetails = page
    .locator('.ui-modal')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(courseDetails).toBeVisible();
  await courseDetails.getByRole('button').first().click();
  await tile.getByRole('button', { name: 'My Lessons', exact: true }).click();
  await expect(page.locator('[data-dashboard-tile="nextSession"]')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Your Slopes Calendar', exact: true })
  ).toBeVisible();
  await page.goto('/cabinet', { waitUntil: 'domcontentloaded' });
  await expect(course).toBeVisible();
  await info.attach('pending-read-observations', {
    body: JSON.stringify([...pendingReads].map((request) => request.url())),
    contentType: 'application/json',
  });
  await expect.poll(() => pendingReads.size).toBe(0);
  const beforeStart = reads.length;
  await page.clock.fastForward(startsAt - (await page.evaluate(() => Date.now())));
  await expect(page.locator('[data-dashboard-tile="currentSessions"]')).toContainText(title);
  await expect(page.locator('[data-dashboard-tile="countdown"]')).toHaveCount(0);
  expect(reads.length).toBe(beforeStart);
  const beforeEnd = reads.length;
  await page.clock.fastForward(endsAt - (await page.evaluate(() => Date.now())) + 1);
  await expect(page.locator('[data-dashboard-tile="currentSessions"]')).toHaveCount(0);
  await expect(course).toHaveCount(0);
  expect(reads.length).toBe(beforeEnd);
  await info.attach('read-model-observations', {
    body: JSON.stringify(reads),
    contentType: 'application/json',
  });
  healthy();
});
