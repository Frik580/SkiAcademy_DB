import { test } from '@playwright/test';
import {
  expect,
  isolatedCourseId,
  loadRuntimeConfig,
  signInStudent,
  signInAccount,
  watchBrowserFailures,
} from './fixtures';
import { hasCourseEnrollment, seedE2ECourse } from './firestore-admin';
import { waitForFunctionsEmulatorReady } from './global-setup';

test('student enrolls in an available course with the test wallet', async ({ page }, testInfo) => {
  const config = loadRuntimeConfig();
  const courseId = isolatedCourseId('enrollment', testInfo);
  const courseTitle = `E2E Enrollment Course ${testInfo.repeatEachIndex}`;
  await seedE2ECourse({
    courseId,
    title: courseTitle,
    instructorId: config.instructorId,
    dayOffset: 120 + testInfo.repeatEachIndex * 7,
  });
  await waitForFunctionsEmulatorReady();
  const assertNoBrowserFailures = watchBrowserFailures(page);

  await signInStudent(page, config);
  await page.goto('/cabinet/courses', { waitUntil: 'domcontentloaded' });
  const courseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: courseTitle }),
  });
  await expect(courseCard).toBeVisible();
  await courseCard.getByRole('button', { name: 'Enroll', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Course Enrollment' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: /E2E Student/ }).click();
  await waitForFunctionsEmulatorReady();
  await modal.getByRole('button', { name: 'Enroll', exact: true }).click();

  await expect(courseCard.getByRole('button', { name: 'Enrolled' })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => hasCourseEnrollment(courseId, config.studentParticipantId)).toBe(true);
  assertNoBrowserFailures();
});

test('guest course request appears live for admin and cancellation refreshes both browsers', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const config = loadRuntimeConfig();
  const courseId = `course_e2e_guest_live_r${testInfo.repeatEachIndex}`;
  const courseTitle = `E2E Guest Live Course ${testInfo.repeatEachIndex}`;
  const guestName = `E2E Course Guest ${testInfo.repeatEachIndex}`;
  await seedE2ECourse({
    courseId,
    title: courseTitle,
    instructorId: config.instructorId,
    dayOffset: 180,
  });
  await waitForFunctionsEmulatorReady();
  const adminContext = await browser.newContext({ locale: 'en-US' });
  try {
    const admin = await adminContext.newPage();
    const assertAdminHealthy = watchBrowserFailures(admin);
    const assertGuestHealthy = watchBrowserFailures(page);
    await signInAccount(admin, { email: config.adminEmail, password: config.adminPassword });
    await admin.goto(
      `/admin?tab=operations&trainingKind=course&trainingScope=pending_guest&enrollmentCourse=${courseId}`
    );
    const list = admin.getByRole('region', { name: 'Lessons and course enrollments', exact: true });
    await expect(list).toBeVisible();
    await expect(list.getByRole('button', { name: 'Pending guests', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(list.getByText(guestName, { exact: true })).toHaveCount(0);
    let adminDocumentLoads = 0;
    admin.on('request', (request) => {
      if (request.resourceType() === 'document') adminDocumentLoads += 1;
    });

    // Local Functions has no trusted Firebase ingress to supply the XFF source.
    await page.route('**/executeGuestCanonicalCommand', async (route) => {
      await route.continue(
        route.request().method() === 'POST'
          ? {
              headers: {
                ...route.request().headers(),
                'x-forwarded-for': `2001:db8:1::${testInfo.repeatEachIndex + 1}`,
              },
            }
          : undefined
      );
    });
    await page.goto('/');
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: courseTitle, exact: true }) });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Enroll', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Course Enrollment' });
    await modal.getByPlaceholder('e.g. Alex Carter').fill(guestName);
    await modal.getByPlaceholder('+1 (555) 000-0000').fill('+7 701 123 45 67');
    await modal.getByRole('spinbutton', { name: 'Age (years) *', exact: true }).fill('25');
    await modal.getByRole('combobox', { name: 'Discipline *', exact: true }).selectOption('ski');
    await modal
      .getByRole('combobox', { name: 'Skill level *', exact: true })
      .selectOption('beginner');
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeGuestCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'create_course_enrollments',
      { timeout: 60_000 }
    );
    await modal.getByRole('button', { name: 'Submit Course Application', exact: true }).click();
    const creation = await createdResponse;
    expect(creation.ok()).toBe(true);
    expect((await creation.json()).result.status).toBe('success');
    await expect(modal.getByRole('status')).toContainText('Request created', { timeout: 30_000 });
    await expect(modal.getByRole('status')).toContainText(courseTitle);
    await expect(modal.getByRole('status')).toContainText(guestName);
    await expect(list.getByText(guestName, { exact: true })).toHaveCount(1);

    await modal.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(
      modal.getByText(
        'Cancel this request? Your place will no longer be held after cancellation.',
        { exact: true }
      )
    ).toBeVisible();
    const cancelledResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeGuestCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'request_course_enrollment_cancellation'
    );
    await modal.getByRole('button', { name: 'Cancel request', exact: true }).click();
    const response = await cancelledResponse;
    expect(response.ok()).toBe(true);
    expect((await response.json()).result.status).toBe('success');
    await expect(modal.getByRole('status')).toContainText('Course enrollment cancelled');
    await expect(list.getByText(guestName, { exact: true })).toHaveCount(0);
    expect(adminDocumentLoads).toBe(0);

    await list.getByRole('button', { name: 'History', exact: true }).click();
    await expect(list.getByText(guestName, { exact: true })).toHaveCount(1);
    assertAdminHealthy();
    assertGuestHealthy();
  } finally {
    await adminContext.close();
  }
});
