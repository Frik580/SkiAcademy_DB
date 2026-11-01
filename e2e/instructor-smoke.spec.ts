import { test } from '@playwright/test';
import {
  expect,
  isolatedCourseId,
  loadRuntimeConfig,
  signInAccount,
  watchBrowserFailures,
} from './fixtures';
import { seedE2ECourse } from './firestore-admin';
import { waitForFunctionsEmulatorReady } from './global-setup';

test('instructor sees an assigned course in the protected workspace', async ({
  page,
}, testInfo) => {
  const config = loadRuntimeConfig();
  const courseId = isolatedCourseId('instructor', testInfo);
  const courseTitle = `E2E Instructor Course ${testInfo.repeatEachIndex}`;
  await seedE2ECourse({
    courseId,
    title: courseTitle,
    instructorId: config.workspaceInstructorId,
    dayOffset: 90 + testInfo.repeatEachIndex * 7,
  });
  await waitForFunctionsEmulatorReady();
  const assertNoBrowserFailures = watchBrowserFailures(page);

  let assignmentResponse: ReturnType<typeof page.waitForResponse> | undefined;
  await signInAccount(
    page,
    {
      email: config.instructorEmail,
      password: config.instructorPassword,
      expectedPath: '/instructor',
    },
    () => {
      assignmentResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/queryInstructorCourseAssignmentReadModels') &&
          response.request().method() === 'POST'
      );
    }
  );
  const assignments = await assignmentResponse!;
  expect(assignments.ok()).toBe(true);
  await assignments.json();
  await expect(page).toHaveURL(/\/instructor$/);
  await expect(page.getByRole('heading', { name: config.workspaceInstructorName })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(courseTitle) })).toBeVisible();
  assertNoBrowserFailures();
});
