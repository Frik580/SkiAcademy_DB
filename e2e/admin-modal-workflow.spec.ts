import { test, expect } from '@playwright/test';
import { loadRuntimeConfig, signInAccount, signInStudent } from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';

const sizes = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];

test('authenticated admin planner modal stays centered and preserves the booking form', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const config = loadRuntimeConfig();
  await waitForFunctionsEmulatorReady();
  await signInAccount(page, { email: config.adminEmail, password: config.adminPassword });
  await page.setViewportSize(sizes[0]);
  await page.goto('/admin?tab=operations&plannerDate=2026-12-15');
  const planner = page.locator('#admin_planner');
  const trigger = planner.getByRole('button', { name: 'Manage Slot' }).first();
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Schedule Action' });
  await expect(dialog).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
        theme
      );
      await expect
        .poll(async () => {
          const box = await dialog.boundingBox();
          return box
            ? Math.max(
                Math.abs(box.x + box.width / 2 - size.width / 2),
                Math.abs(box.y + box.height / 2 - size.height / 2)
              )
            : Infinity;
        })
        .toBeLessThan(2);
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({
        animations: 'disabled',
        path: `.scratch/admin-modal-unification/authenticated/slot-${size.width}-${theme}.png`,
      });
    }
  }
  await dialog.getByRole('tab', { name: 'Lesson', exact: true }).click();
  const account = dialog.getByRole('combobox', { name: 'Select an Account first' });
  await expect(account).toBeEnabled({ timeout: 60_000 });
  await account.selectOption(config.studentUid);
  await expect(dialog.getByRole('button', { name: 'Save Schedule', exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  expect(await account.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px');
  await page.screenshot({
    animations: 'disabled',
    path: '.scratch/admin-modal-unification/authenticated/booking-320-dark.png',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('modal-scroll-lock'))
  ).toBe(false);
});

test('authenticated student booking reference retains its original responsive chrome', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await waitForFunctionsEmulatorReady();
  await page.setViewportSize(sizes[0]);
  const config = loadRuntimeConfig();
  await signInStudent(page, config);
  await page.getByRole('button', { name: 'Book Lesson' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a coach' });
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button').filter({ hasText: config.instructorName }).click();
  const shell = page
    .locator('.ui-modal')
    .filter({ has: page.getByRole('button', { name: 'Select Date', exact: true }) });
  await expect(shell).toBeVisible();
  await expect(shell.getByText('Loading...', { exact: true })).toHaveCount(0, { timeout: 60_000 });
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
        theme
      );
      await page.screenshot({
        animations: 'disabled',
        path: `.scratch/admin-modal-unification/authenticated/reference-${size.width}-${theme}.png`,
      });
    }
  }
});
