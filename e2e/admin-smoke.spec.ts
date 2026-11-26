import { test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, loadRuntimeConfig, signInAccount, watchBrowserFailures } from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';
import { ensureFirestore } from './firestore-admin';
import { functionsCallableUrl } from './emulator-config';

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

test('admin confirms identity in place before a stale critical request is repeated', async ({ page, request }) => {
  test.setTimeout(180_000);
  // Warm the endpoint with a request rejected by the callable SDK before admission.
  const readiness = await request.post(functionsCallableUrl('deleteErrorLog'), {
    data: {},
    timeout: 60_000,
  });
  expect(readiness.status()).toBe(400);
  const config = loadRuntimeConfig();
  await signInAccount(page, { email: config.adminEmail, password: config.adminPassword });
  const logId = `step-up-${randomUUID()}`;
  const log = ensureFirestore().collection('error_logs').doc(logId);
  const seedLog = () =>
    log.set({ id: logId, message: logId, source: 'global_error', timestamp: new Date().toISOString() });
  await seedLog();
  try {
    let submissions = 0;
    let expired = false;
    await page.route('**/deleteErrorLog', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const data = route.request().postDataJSON().data;
      if (data.id !== logId) return route.abort();
      submissions++;
      if (!expired || data.expectedAdministratorUid) return route.continue();
      // Only the elapsed window is simulated. Password reauthentication, token
      // refresh and the replay use the demo Auth and Functions emulators.
      await route.fulfill({
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: { error: { status: 'FAILED_PRECONDITION', details: { code: 'ADMIN_RECENT_AUTH_REQUIRED' } } },
      });
    });
    await page.goto('/admin?tab=system');
    const logs = page.locator('#error_logs');
    await logs.getByRole('heading', { name: 'System Error Logs' }).click();
    const remove = logs.getByText(logId, { exact: true }).locator('..').getByTitle('Delete log');
    const confirmation = page.getByRole('dialog', { name: 'Confirm your identity' });
    await remove.click();
    await expect(logs.getByText(logId, { exact: true })).toHaveCount(0, { timeout: 45_000 });
    await expect(confirmation).toHaveCount(0);
    expect((await log.get()).exists).toBe(false);
    expired = true;
    await seedLog();

    await remove.click();
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    expect(submissions).toBe(2);
    expect((await log.get()).exists).toBe(true);

    await remove.click();
    await confirmation.getByLabel('Password').fill('incorrect-demo-password');
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(confirmation.getByRole('alert')).toBeVisible();
    expect(submissions).toBe(3);
    expect((await log.get()).exists).toBe(true);
    await confirmation.getByLabel('Password').fill(config.adminPassword);
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(logs.getByText(logId, { exact: true })).toHaveCount(0, { timeout: 45_000 });
    expect(submissions).toBe(4);
    expect((await log.get()).exists).toBe(false);
    await expect(page).toHaveURL(/\/admin\?tab=system$/);
  } finally {
    await log.delete();
  }
});
