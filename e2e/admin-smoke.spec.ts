import { test } from '@playwright/test';
import { expect, loadRuntimeConfig, signInAccount, watchBrowserFailures } from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';

test('admin opens the role directory and reads the admin account', async ({ page }) => {
  const config = loadRuntimeConfig();
  await waitForFunctionsEmulatorReady();
  const assertNoBrowserFailures = watchBrowserFailures(page);

  await signInAccount(page, {
    email: config.adminEmail,
    password: config.adminPassword,
  });
  await page.goto('/admin?tab=people', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\?tab=people$/);
  await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
  await expect(
    page.locator('#admin_roles').getByText(config.adminDisplayName, { exact: true })
  ).toBeVisible();
  assertNoBrowserFailures();
});
