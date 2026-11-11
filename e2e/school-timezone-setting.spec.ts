import { test, expect } from '@playwright/test';
import {
  fillBookingSelectors,
  loadRuntimeConfig,
  openStudentBookingModal,
  signInAccount,
  submitStudentBookingConfirmation,
  waitForNewBlockingBookingForPayer,
} from './fixtures';
import {
  ensureFirestore,
  getBlockingBookingIdsForPayer,
  getBookingRecord,
} from './firestore-admin';
import { attemptAuthenticatedCancellation } from './callable-client';
import { E2E_PROJECT_ID } from './emulator-config';
import { waitForFunctionsEmulatorReady } from './global-setup';

test('admin school timezone controls student booking in a New York browser', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  expect(E2E_PROJECT_ID).toBe('demo-ski-school-e2e');
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  await waitForFunctionsEmulatorReady();
  const config = loadRuntimeConfig();
  const ref = ensureFirestore().doc('resort_data/config');
  const originalZone = (await ref.get()).data()?.timeZone ?? 'Asia/Almaty';
  const adminContext = await browser.newContext({
    baseURL: info.project.use.baseURL,
    locale: 'en-US',
  });
  const studentContext = await browser.newContext({
    baseURL: info.project.use.baseURL,
    timezoneId: 'America/New_York',
    locale: 'en-US',
  });
  let bookingId: string | undefined;
  try {
    const admin = await adminContext.newPage();
    await signInAccount(admin, { email: config.adminEmail, password: config.adminPassword });
    await admin.goto('/admin?tab=product', { waitUntil: 'domcontentloaded' });
    const section = admin.locator('#resort_data');
    await section.getByRole('heading').click();
    const select = section.getByRole('combobox', { name: 'School time zone', exact: true });
    await expect(select).toBeEnabled();
    const save = select.locator('../..').getByRole('button');
    async function saveZone(zone: string) {
      await select.selectOption(zone);
      await save.click();
      await expect.poll(async () => (await ref.get()).data()?.timeZone).toBe(zone);
      await expect(select).toBeEnabled();
    }
    await saveZone(originalZone === 'UTC' ? 'Europe/Paris' : 'UTC');
    await saveZone('Asia/Almaty');
    await admin.reload();
    await expect(section.getByRole('combobox', { name: 'School time zone', exact: true })).toHaveValue(
      'Asia/Almaty'
    );

    const student = await studentContext.newPage();
    const before = await getBlockingBookingIdsForPayer(config.studentUid);
    await openStudentBookingModal(student, config);
    const selected = await fillBookingSelectors(student, 35, {
      participantDisplayName: config.studentDisplayName,
      time: '09:00',
    });
    await expect(student.getByText(/Lesson times: Asia\/Almaty/)).toBeVisible();
    await submitStudentBookingConfirmation(student);
    const booking = await waitForNewBlockingBookingForPayer(
      config.studentUid,
      before,
      (item) => item.lifecycleStatus === 'confirmed'
    );
    bookingId = booking.bookingId;
    const saved = await getBookingRecord(bookingId);
    expect(saved!.occurrence.timeZone).toBe('Asia/Almaty');
    expect(saved!.occurrence.interval.startsAt.seconds).toBe(
      Date.parse(`${selected.localDate}T04:00:00Z`) / 1000
    );
    await student.goto('/cabinet/calendar', { waitUntil: 'domcontentloaded' });
    await student.reload();
    await expect(student.locator(`#booking-card-${bookingId}`)).toContainText('09:00');
    await saveZone('Europe/Moscow');
    expect((await getBookingRecord(bookingId))!.occurrence).toEqual(saved!.occurrence);
    await student.reload();
    await expect(student.locator(`#booking-card-${bookingId}`)).toContainText('09:00');
  } finally {
    await ref.set({ timeZone: originalZone }, { merge: true });
    if (bookingId) {
      const saved = await getBookingRecord(bookingId);
      if (saved)
        expect(
          await attemptAuthenticatedCancellation({
            email: config.studentEmail,
            password: config.studentPassword,
            bookingId,
            expectedRevision: saved.revision,
            exercisedCapability: 'account_owner',
          })
        ).toMatchObject({ ok: true });
    }
    await adminContext.close();
    await studentContext.close();
  }
});
