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

const GUEST_COURSE_SESSION_STORAGE_KEY = 'ski_academy_guest_course_session_identity';

test('same browser guest changes from Petr to Ars on a new course application', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const config = loadRuntimeConfig();
  const courseA = `${isolatedCourseId('enrollment', testInfo)}_guest_profile_a`;
  const courseB = `${isolatedCourseId('enrollment', testInfo)}_guest_profile_b`;
  const titleA = `E2E Guest Profile A ${testInfo.repeatEachIndex}`;
  const titleB = `E2E Guest Profile B ${testInfo.repeatEachIndex}`;
  await seedE2ECourse({
    courseId: courseA,
    title: titleA,
    instructorId: config.instructorId,
    dayOffset: 14,
  });
  await seedE2ECourse({
    courseId: courseB,
    title: titleB,
    instructorId: config.instructorId,
    dayOffset: 21,
  });
  await waitForFunctionsEmulatorReady();
  const assertGuestHealthy = watchBrowserFailures(page);
  await page.route('**/executeGuestCanonicalCommand', async (route) => {
    await route.continue(
      route.request().method() === 'POST'
        ? {
            headers: { ...route.request().headers(), 'x-forwarded-for': '2001:db8:2::1' },
          }
        : undefined
    );
  });
  await page.goto('/');
  const submit = async (title: string, name: string, age: string, skill: string) => {
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Enroll', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Course Enrollment' });
    await modal.getByPlaceholder('e.g. Alex Carter').fill(name);
    await modal.getByPlaceholder('+1 (555) 000-0000').fill('+7 701 123 45 67');
    await modal.getByRole('spinbutton', { name: 'Age (years) *', exact: true }).fill(age);
    await modal.getByRole('combobox', { name: 'Discipline *', exact: true }).selectOption('ski');
    await modal.getByRole('combobox', { name: 'Skill level *', exact: true }).selectOption(skill);
    await waitForFunctionsEmulatorReady();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeGuestCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'create_course_enrollments'
    );
    await modal.getByRole('button', { name: 'Submit Course Application', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBe(true);
    const result = body.result;
    expect(result, JSON.stringify(body)).toMatchObject({
      status: 'success',
      payload: { outcome: 'created' },
    });
    await expect(modal.getByRole('status')).toContainText('Request created');
    await expect(modal.getByRole('status')).toContainText(name);
    await modal.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(modal).not.toBeVisible();
    return {
      participantId: response.request().postDataJSON().data.intent.participantIds[0],
      enrollmentId: result.payload.guestLinkCredentials[0].enrollmentId,
    };
  };
  const first = await submit(titleA, 'Petr', '30', 'beginner');
  const seed = await page.evaluate(
    (key) => localStorage.getItem(key),
    GUEST_COURSE_SESSION_STORAGE_KEY
  );
  expect(seed).toBeTruthy();
  const second = await submit(titleB, 'Ars', '43', 'intermediate');
  expect(second.participantId).toBe(first.participantId);
  expect(second.enrollmentId).not.toBe(first.enrollmentId);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), GUEST_COURSE_SESSION_STORAGE_KEY)
  ).toBe(seed);
  const secondCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: titleB, exact: true }) });
  await secondCard.getByRole('button', { name: 'Check status', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Course Enrollment' }).getByRole('status')
  ).toContainText('Ars');
  const adminContext = await browser.newContext({ locale: 'en-US' });
  try {
    const admin = await adminContext.newPage();
    const assertAdminHealthy = watchBrowserFailures(admin);
    await signInAccount(admin, { email: config.adminEmail, password: config.adminPassword });
    await admin.goto(
      `/admin?tab=operations&trainingKind=course&trainingScope=pending_guest&enrollmentCourse=${courseB}`
    );
    const list = admin.getByRole('region', { name: 'Lessons and course enrollments', exact: true });
    await expect(list.getByText('Ars', { exact: true })).toHaveCount(1);
    await expect(list.getByText('Petr', { exact: true })).toHaveCount(0);
    assertAdminHealthy();
  } finally {
    await adminContext.close();
  }
  assertGuestHealthy();
});

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
    const createResult = (await creation.json()).result;
    expect(createResult.status).toBe('success');
    expect(createResult.payload.outcome).toBe('created');
    const enrollmentId = createResult.payload.guestLinkCredentials[0].enrollmentId;
    await expect(modal.getByRole('status')).toContainText('Request created', { timeout: 30_000 });
    await expect(modal.getByRole('status')).toContainText(courseTitle);
    await expect(modal.getByRole('status')).toContainText(guestName);
    const storedCredential = await page.evaluate(
      (id) =>
        JSON.parse(
          localStorage.getItem(`ski_academy_guest_course_enrollment_credential:${id}`) ?? 'null'
        ),
      enrollmentId
    );
    expect(storedCredential).toEqual(createResult.payload.guestLinkCredentials[0]);
    await expect(list.getByText(guestName, { exact: true })).toHaveCount(1);
    expect(adminDocumentLoads).toBe(0);

    await modal.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(modal).not.toBeVisible();
    await card.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(modal.getByRole('status')).toContainText('Request created');
    await expect(modal.getByRole('status')).toContainText(guestName);
    await admin.reload();
    await expect(list.getByText(guestName, { exact: true })).toHaveCount(1);
    adminDocumentLoads = 0;

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
