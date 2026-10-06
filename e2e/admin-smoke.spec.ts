import { test } from '@playwright/test';
import { expect, loadRuntimeConfig, signInAccount, watchBrowserFailures } from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';

test('admin opens the role directory and reads the admin account', async ({ page }) => {
  test.setTimeout(120_000);
  const config = loadRuntimeConfig();
  await waitForFunctionsEmulatorReady();
  const assertNoBrowserFailures = watchBrowserFailures(page);

  await signInAccount(page, {
    email: config.adminEmail,
    password: config.adminPassword,
  });
  const adminListResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/queryAdminIdentityReadModels') &&
      response.request().postDataJSON()?.data?.scope === 'admin_account_list' &&
      response.request().postDataJSON()?.data?.role === 'admin',
    { timeout: 60_000 }
  );
  await page.goto('/admin?tab=people', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\?tab=people$/);
  await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
  const roles = page.locator('#admin_roles');
  await expect(roles).toBeVisible();
  const response = await adminListResponse;
  expect(response.ok()).toBe(true);
  const result = (await response.json()).result;
  expect(result.scope).toBe('admin_account_list');
  expect(
    result.items.filter((item: { email: string }) => item.email === config.adminEmail)
  ).toHaveLength(1);
  await expect(roles.getByText('Loading…', { exact: true })).toHaveCount(0, { timeout: 60_000 });
  await expect(roles.getByText(config.adminDisplayName, { exact: true })).toBeVisible();
  assertNoBrowserFailures();
});
