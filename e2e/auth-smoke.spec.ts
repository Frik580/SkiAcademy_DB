import { test } from '@playwright/test';
import { expect, signInStudent } from './fixtures';

test('student signs in and sees their cabinet', async ({ page }) => {
  await signInStudent(page);

  await expect(page.getByText(/^Good (morning|afternoon|evening), E2E 👋$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book Lesson' })).toBeVisible();
});
