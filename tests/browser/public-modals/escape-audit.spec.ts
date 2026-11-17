import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
  );
  await page.goto('/tests/browser/public-modals/index.html');
});
for (const language of ['Russian', 'English']) {
  for (const kind of [
    'level',
    'review',
    'confirm',
    'lesson',
    'picker',
    'chat',
    'payment',
    'notifications',
  ]) {
    test(`${language} ${kind}: keyboard lifecycle`, async ({ page }) => {
      await page.getByRole('button', { name: language, exact: true }).click();
      const opener = page.getByRole('button', { name: `Open ${kind}`, exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.locator('#root')).toHaveAttribute('inert', '');
      for (const key of ['Shift+Tab', 'Tab', 'Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        await expect
          .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
          .toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
    });
  }
}
test('mixed nested dialogs and local popovers consume Escape one at a time', async ({ page }) => {
  await page.getByRole('button', { name: 'Open nested', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Parent' });
  for (const name of ['Select', 'Calendar']) {
    const trigger = parent.getByRole('button', { name, exact: true });
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press(name === 'Calendar' ? 'Shift+Tab' : 'Tab');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await expect(parent).toBeVisible();
  }
  await parent.getByRole('button', { name: 'Open child' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(parent).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Open child' })).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/modal-scroll-lock/);
  await page.keyboard.press('Escape');
  await expect(parent).toHaveCount(0);
});
test('pending review ignores Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('button[type="submit"]').click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
});

test('simultaneously mounted nested dialogs restore the original opener', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open simultaneous', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Parent' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});
