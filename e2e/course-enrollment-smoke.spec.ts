import { test } from '@playwright/test';
import {
  expect,
  isolatedCourseId,
  loadRuntimeConfig,
  signInStudent,
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
