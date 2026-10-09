import { test } from '@playwright/test';
import {
  expect,
  isolatedCourseId,
  isolatedCourseDayOffset,
  loadRuntimeConfig,
  signInStudent,
  signInAccount,
  watchBrowserFailures,
} from './fixtures';
import { getParticipantProfile, hasCourseEnrollment, seedE2ECourse } from './firestore-admin';
import { waitForFunctionsEmulatorReady } from './global-setup';

const GUEST_COURSE_SESSION_STORAGE_KEY = 'ski_academy_guest_course_session_identity';

test('same browser guest changes from Petr to Ars on a new course application', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const config = loadRuntimeConfig();
  const courseA = `${isolatedCourseId('enrollment', testInfo)}_attempt${testInfo.retry}_guest_profile_a`;
  const courseB = `${isolatedCourseId('enrollment', testInfo)}_attempt${testInfo.retry}_guest_profile_b`;
  const titleA = `E2E Guest Profile A ${courseA}`;
  const titleB = `E2E Guest Profile B ${courseB}`;
  await seedE2ECourse({
    courseId: courseA,
    title: titleA,
    instructorId: config.instructorId,
    discipline: 'ski',
    dayOffset: 14,
  });
  await seedE2ECourse({
    courseId: courseB,
    title: titleB,
    instructorId: config.instructorId,
    discipline: 'ski',
    dayOffset: 21,
  });
  await waitForFunctionsEmulatorReady();
  const assertGuestHealthy = watchBrowserFailures(page);
  await page.route('**/executeGuestCanonicalCommand', async (route) => {
    await route.continue(
      route.request().method() === 'POST'
        ? {
            headers: {
              ...route.request().headers(),
              'x-forwarded-for': `2001:db8:2::${testInfo.workerIndex + 1}`,
            },
          }
        : undefined
    );
  });
  await page.goto('/');
  const submit = async (title: string, name: string) => {
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Enroll', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Course Enrollment' });
    await modal.getByPlaceholder('e.g. Alex Carter').fill(name);
    await modal.getByPlaceholder('+1 (555) 000-0000').fill('+7 701 123 45 67');
    await expect(modal.getByRole('spinbutton')).toHaveCount(0);
    await expect(modal.getByRole('combobox')).toHaveCount(0);
    await waitForFunctionsEmulatorReady();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeGuestCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'create_course_enrollments'
    );
    await modal.getByRole('button', { name: 'Send request', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBe(true);
    const createPayload = response.request().postDataJSON().data;
    expect(createPayload.guestParticipantDiscipline).toBe('ski');
    expect(createPayload).not.toHaveProperty('guestParticipantAgeYears');
    expect(createPayload).not.toHaveProperty('guestParticipantSkillLevel');
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
  const first = await submit(titleA, 'Petr');
  const seed = await page.evaluate(
    (key) => localStorage.getItem(key),
    GUEST_COURSE_SESSION_STORAGE_KEY
  );
  expect(seed).toBeTruthy();
  const second = await submit(titleB, 'Ars');
  expect(second.participantId).toBe(first.participantId);
  expect(second.enrollmentId).not.toBe(first.enrollmentId);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), GUEST_COURSE_SESSION_STORAGE_KEY)
  ).toBe(seed);
  const secondCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: titleB, exact: true }) });
  await expect(secondCard).toHaveCount(1);
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
    await expect(list).toBeVisible();
    await expect(list.getByRole('button', { name: 'Pending guests', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(list.getByText('Ars', { exact: true })).toHaveCount(1, { timeout: 60_000 });
    await expect(list.getByText('Petr', { exact: true })).toHaveCount(0);
    assertAdminHealthy();
  } finally {
    await adminContext.close();
  }
  const profileModal = page.getByRole('dialog', { name: 'Course Enrollment' });
  await profileModal.getByRole('button', { name: 'Complete profile', exact: true }).click();
  await profileModal.getByRole('spinbutton', { name: 'Age (years) *', exact: true }).fill('43');
  await profileModal
    .getByRole('combobox', { name: 'Skill level *', exact: true })
    .selectOption('intermediate');
  const completedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/executeGuestCanonicalCommand') &&
      response.request().postDataJSON()?.data?.kind === 'complete_guest_participant_profile'
  );
  await profileModal.getByRole('button', { name: 'Save profile', exact: true }).click();
  const completion = await completedResponse;
  expect(completion.ok()).toBe(true);
  expect((await completion.json()).result.status).toBe('success');
  await expect(profileModal.getByRole('button', { name: 'Save profile', exact: true })).toHaveCount(
    0
  );
  await expect
    .poll(() => getParticipantProfile(second.participantId))
    .toMatchObject({
      displayName: 'Ars',
      discipline: 'ski',
      age: { kind: 'age_years', years: 43 },
      skillLevel: 'intermediate',
    });
  assertGuestHealthy();
});

test('student enrolls in an available course with the test wallet', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const config = loadRuntimeConfig();
  const courseId = `${isolatedCourseId('enrollment', testInfo)}_attempt${testInfo.retry}`;
  const courseTitle = `E2E Enrollment Course ${courseId}`;
  await seedE2ECourse({
    courseId,
    title: courseTitle,
    instructorId: config.instructorId,
    discipline: 'ski',
    dayOffset: isolatedCourseDayOffset(120, testInfo),
  });
  await waitForFunctionsEmulatorReady();
  const assertNoBrowserFailures = watchBrowserFailures(page);

  const productResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/queryCourseCatalogReadModels') &&
      response.request().postDataJSON()?.data?.scope === 'product',
    { timeout: 60_000 }
  );
  await signInStudent(page, config);
  const catalogResponse = await productResponse;
  expect(catalogResponse.ok()).toBe(true);
  const catalog = (await catalogResponse.json()).result;
  expect(catalog.scope).toBe('product');
  expect(
    catalog.items.filter((item: { courseId: string }) => item.courseId === courseId)
  ).toHaveLength(1);
  const reloadedProductResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/queryCourseCatalogReadModels') &&
      response.request().postDataJSON()?.data?.scope === 'product',
    { timeout: 30_000 }
  );
  await page.goto('/cabinet/courses', { waitUntil: 'domcontentloaded' });
  const reloadedCatalog = await reloadedProductResponse;
  expect(reloadedCatalog.ok()).toBe(true);
  expect((await reloadedCatalog.json()).result.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ courseId })])
  );
  const courseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: courseTitle, exact: true }),
  });
  await expect(courseCard).toHaveCount(1);
  await expect(courseCard).toBeVisible();
  await courseCard.getByRole('button', { name: 'Enroll', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Course Enrollment' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: /E2E Student/ }).click();
  await waitForFunctionsEmulatorReady();
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/executeCanonicalCommand') &&
      response.request().postDataJSON()?.data?.kind === 'create_course_enrollments' &&
      response.request().postDataJSON()?.data?.intent?.courseId === courseId
  );
  const enrollmentRead = page.waitForResponse(
    async (response) => {
      if (
        !response.url().endsWith('/queryCourseEnrollmentReadModels') ||
        response.request().postDataJSON()?.data?.scope !== 'account_hot'
      )
        return false;
      const result = (await response.json()).result;
      return (
        result?.items?.some((item: { courseId: string }) => item.courseId === courseId) ?? false
      );
    },
    { timeout: 30_000 }
  );
  await modal.getByRole('button', { name: 'Enroll', exact: true }).click();
  const creation = await createdResponse;
  expect(creation.ok()).toBe(true);
  const intent = creation.request().postDataJSON().data.intent;
  expect(intent.participantIds).toEqual([config.studentParticipantId]);
  expect((await creation.json()).result.status).toBe('success');
  await expect.poll(() => hasCourseEnrollment(courseId, config.studentParticipantId)).toBe(true);
  const enrollmentResponse = await enrollmentRead;
  expect(enrollmentResponse.ok()).toBe(true);
  const items = (await enrollmentResponse.json()).result.items;
  expect(
    items.filter(
      (item: { enrollmentId: string; courseId: string }) =>
        item.courseId === courseId && item.enrollmentId === intent.enrollmentIds[0]
    )
  ).toHaveLength(1);

  await expect(courseCard.getByRole('button', { name: 'Enrolled' })).toBeVisible({
    timeout: 30_000,
  });
  assertNoBrowserFailures();
});

test('guest course request appears live for admin and cancellation refreshes both browsers', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const config = loadRuntimeConfig();
  const courseId = `${isolatedCourseId('enrollment', testInfo)}_attempt${testInfo.retry}_guest_live`;
  const courseTitle = `E2E Guest Live Course ${courseId}`;
  const guestName = `E2E Course Guest ${courseId}`;
  await seedE2ECourse({
    courseId,
    title: courseTitle,
    instructorId: config.instructorId,
    discipline: 'ski',
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
                'x-forwarded-for': `2001:db8:1::${testInfo.workerIndex + 1}`,
              },
            }
          : undefined
      );
    });
    await page.goto('/');
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: courseTitle, exact: true }) });
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Enroll', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Course Enrollment' });
    await modal.getByPlaceholder('e.g. Alex Carter').fill(guestName);
    await modal.getByPlaceholder('+1 (555) 000-0000').fill('+7 701 123 45 67');
    await expect(modal.getByRole('spinbutton')).toHaveCount(0);
    await expect(modal.getByRole('combobox')).toHaveCount(0);
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/executeGuestCanonicalCommand') &&
        response.request().postDataJSON()?.data?.kind === 'create_course_enrollments',
      { timeout: 60_000 }
    );
    await modal.getByRole('button', { name: 'Send request', exact: true }).click();
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
