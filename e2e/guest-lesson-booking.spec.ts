import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  expect,
  fillBookingSelectors,
  loadRuntimeConfig,
  openGuestBookingModal,
  signInAccount,
  uniqueTimeSlot,
  watchBrowserFailures,
} from './fixtures';
import { getParticipantProfile, getBookingRecord } from './firestore-admin';

let adminContext: BrowserContext;
let admin: Page;
let assertAdminHealthy: () => void;

test.beforeAll(async ({ browser }) => {
  const config = loadRuntimeConfig();
  adminContext = await browser.newContext({ locale: 'en-US' });
  admin = await adminContext.newPage();
  assertAdminHealthy = watchBrowserFailures(admin);
  await signInAccount(admin, { email: config.adminEmail, password: config.adminPassword });
  await admin.goto('/admin?tab=operations&trainingKind=lesson&trainingScope=pending_guest', {
    waitUntil: 'domcontentloaded',
  });
  await expect(admin.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
  await admin
    .locator('#canonical_training_records')
    .getByRole('button', { name: 'Show', exact: true })
    .click();
  await expect(
    admin.getByRole('region', { name: 'Lessons and course enrollments', exact: true })
  ).toBeVisible();
});

test.afterAll(async () => {
  await adminContext?.close();
});

test('guest lesson defers profile completion and preserves status, comment and cancellation', async ({
  page,
}, testInfo) => {
  const config = loadRuntimeConfig();
  const suffix = `w${testInfo.workerIndex}_r${testInfo.repeatEachIndex}_retry${testInfo.retry}`;
  const guestName = `Guest Lesson ${suffix}`;
  const assertGuestHealthy = watchBrowserFailures(page);
  await page.route('**/executeGuestCanonicalCommand', async (route) => {
    await route.continue(
      route.request().method() === 'POST'
        ? {
            headers: {
              ...route.request().headers(),
              'x-forwarded-for': `2001:db8:3:${testInfo.workerIndex + 1}:${testInfo.repeatEachIndex + 1}::${testInfo.retry + 1}`,
            },
          }
        : undefined
    );
  });
  await openGuestBookingModal(page, config.instructorName);
  const modal = page.getByRole('dialog', { name: 'Book Lesson with' });
  await expect(modal).toHaveCount(1);
  await expect(
    modal.getByRole('button', { name: 'Already have an account? Sign in', exact: true })
  ).toBeVisible();
  await expect(modal.getByRole('spinbutton')).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Lesson Stage', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('textbox', { name: /Email|Comment/ })).toHaveCount(0);
  await modal.getByRole('textbox', { name: 'Name *', exact: true }).fill(guestName);
  await modal.getByRole('textbox', { name: 'Phone *', exact: true }).fill('+7 701 123 45 67');
  await modal
    .getByRole('combobox', { name: 'Discipline *', exact: true })
    .selectOption('snowboard');
  const slot = await fillBookingSelectors(
    page,
    3 + testInfo.repeatEachIndex * 28 + testInfo.workerIndex * 7 + testInfo.retry,
    { time: uniqueTimeSlot(testInfo) }
  );
  await modal.getByRole('textbox', { name: 'Name *', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('guest-lesson-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const nameBox = await modal.getByRole('textbox', { name: 'Name *', exact: true }).boundingBox();
  const phoneBox = await modal.getByRole('textbox', { name: 'Phone *', exact: true }).boundingBox();
  expect(nameBox).not.toBeNull();
  expect(phoneBox).not.toBeNull();
  expect(phoneBox!.y).toBeGreaterThan(nameBox!.y);
  expect(phoneBox!.x).toBe(nameBox!.x);
  await page.screenshot({ path: testInfo.outputPath('guest-lesson-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await modal.getByRole('button', { name: '+ Add email or comment', exact: true }).click();
  await modal
    .getByRole('textbox', { name: 'Email · Optional', exact: true })
    .fill('guest@example.com');
  await modal
    .getByRole('textbox', { name: 'Comment · Optional', exact: true })
    .fill('  Own snowboard  ');
  const creationResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/executeGuestCanonicalCommand') &&
      response.request().postDataJSON()?.data?.kind === 'create_guest_booking_request'
  );
  await modal.getByRole('button', { name: 'Send request', exact: true }).click();
  const creation = await creationResponse;
  const body = await creation.json();
  expect(creation.ok(), JSON.stringify(body)).toBe(true);
  expect(body.result.status).toBe('success');
  const payload = creation.request().postDataJSON().data;
  expect(payload).not.toHaveProperty('guestParticipantAgeYears');
  expect(payload).not.toHaveProperty('guestParticipantSkillLevel');
  expect(payload.intent).not.toHaveProperty('difficulty');
  expect(payload.guestParticipantDiscipline).toBe('snowboard');
  expect(payload.intent.notes).toBe('Own snowboard');
  expect(payload.calendarInput).toMatchObject({
    localDate: slot.localDate,
    localTime: slot.localTime,
    durationMinutes: slot.durationMinutes,
  });
  const bookingId = payload.intent.bookingId as string;
  const participantId = payload.intent.participantIds[0] as string;
  await expect(modal.getByRole('heading', { name: 'Request created', exact: true })).toBeVisible();
  expect(await getParticipantProfile(participantId)).toMatchObject({
    age: { kind: 'unknown' },
    discipline: 'snowboard',
    management: { kind: 'unmanaged_guest' },
  });
  expect(await getParticipantProfile(participantId)).not.toHaveProperty('skillLevel');
  expect(await getBookingRecord(bookingId)).toMatchObject({
    lifecycle: { status: 'pending' },
    notes: 'Own snowboard',
    party: { participantIds: [participantId] },
  });

  const adminList = admin.getByRole('region', {
    name: 'Lessons and course enrollments',
    exact: true,
  });
  const bookingRow = adminList.getByRole('button').filter({ hasText: guestName });
  await expect(bookingRow).toHaveCount(1);
  await bookingRow.click();
  const overview = admin.getByRole('region', { name: 'Overview', exact: true });
  await expect(overview).toContainText(guestName);
  await expect(overview).toContainText('Own snowboard');
  await expect(
    overview.locator('dt').filter({ hasText: 'Age (years)' }).locator('+ dd')
  ).toHaveText('—');
  await expect(
    overview.locator('dt').filter({ hasText: 'Skill level' }).locator('+ dd')
  ).toHaveText('—');

  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await openGuestBookingModal(page, config.instructorName);
  await modal.getByRole('button', { name: 'Have a request? Check status', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Request created', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Complete profile', exact: true }).click();
  await modal.getByRole('spinbutton', { name: 'Age (years) *', exact: true }).fill('32');
  await modal
    .getByRole('combobox', { name: 'Skill level *', exact: true })
    .selectOption('intermediate');
  const completionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/executeGuestCanonicalCommand') &&
      response.request().postDataJSON()?.data?.kind === 'complete_guest_participant_profile'
  );
  await modal.getByRole('button', { name: 'Save profile', exact: true }).click();
  const completion = await completionResponse;
  expect(completion.ok(), JSON.stringify(await completion.json())).toBe(true);
  await expect(modal.getByRole('button', { name: 'Complete profile', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Save profile', exact: true })).toHaveCount(0);
  expect(await getParticipantProfile(participantId)).toMatchObject({
    age: { kind: 'age_years', years: 32 },
    skillLevel: 'intermediate',
    discipline: 'snowboard',
  });
  await admin.getByRole('button', { name: 'Close booking detail', exact: true }).click();
  await bookingRow.click();
  await expect(
    overview.locator('dt').filter({ hasText: 'Age (years)' }).locator('+ dd')
  ).toHaveText('32');
  await expect(
    overview.locator('dt').filter({ hasText: 'Skill level' }).locator('+ dd')
  ).toContainText('Intermediate');

  await modal.getByRole('button', { name: 'Cancel request', exact: true }).click();
  const cancellationResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/executeGuestCanonicalCommand') &&
      response.request().postDataJSON()?.data?.kind === 'request_booking_cancellation'
  );
  await modal.getByRole('button', { name: 'Cancel request', exact: true }).click();
  const cancellation = await cancellationResponse;
  expect(cancellation.ok(), JSON.stringify(await cancellation.json())).toBe(true);
  await expect(
    modal.getByRole('heading', { name: 'Reservation cancelled', exact: true })
  ).toBeVisible();
  expect(await getBookingRecord(bookingId)).toMatchObject({ lifecycle: { status: 'cancelled' } });
  assertAdminHealthy();
  assertGuestHealthy();
});
