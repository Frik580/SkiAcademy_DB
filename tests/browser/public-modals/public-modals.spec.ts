import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
  );
  await page.goto('/tests/browser/public-modals/index.html', { waitUntil: 'domcontentloaded' });
});

test('course focuses inside, isolates background and closes with Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'Open course', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ski course' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open course', exact: true })).toBeFocused();
});

test('closing restores page scroll without moving the opener into view', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open course', exact: true });
  await page.evaluate(() => window.scrollTo(0, 600));
  await opener.evaluate((node) => node.focus({ preventScroll: true }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('top', '-600px');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
});

test('nested course enrollment returns focus and preserves entered data', async ({ page }) => {
  await page.getByRole('button', { name: 'Open course', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Ski course' });
  const enroll = parent.getByRole('button', { name: 'Confirm Booking' });
  await enroll.focus();
  await page.keyboard.press('Enter');
  const child = page.getByRole('dialog', { name: 'Course Enrollment' });
  await expect(child).toBeVisible();
  await expect(parent).toHaveCount(0);
  await child.getByLabel('Phone', { exact: false }).fill('abc');
  await child.getByLabel('Name', { exact: false }).fill('Guest');
  await child.locator('button[type="submit"]').click();
  await expect(child.locator('input[type="tel"]')).toBeFocused();
  await expect(child.getByRole('alert')).toBeVisible();
  await expect(child.locator('input[type="text"]')).toHaveValue('Guest');
  await page.keyboard.press('Escape');
  await expect(child).toHaveCount(0);
  await expect(enroll).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/modal-scroll-lock/);
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
});

for (const kind of ['auth', 'enrollment', 'booking', 'reviews']) {
  test(`${kind}: real Tab and Shift+Tab stay in active dialog`, async ({ page }) => {
    const trigger = page.getByRole('button', { name: `Open ${kind}`, exact: true });
    await trigger.focus();
    await page.keyboard.press('Space');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
    for (let index = 0; index < 18; index++) {
      await page.keyboard.press('Tab');
      await expect
        .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
        .toBe(true);
    }
    for (let index = 0; index < 18; index++) {
      await page.keyboard.press('Shift+Tab');
      await expect
        .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
        .toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('#root')).not.toHaveAttribute('inert');
  });
}

for (const size of [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  for (const theme of ['light', 'dark']) {
    for (const locale of ['ru', 'en']) {
      test(`${size.width} ${theme} ${locale}: public modal geometry`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.evaluate(
          ({ theme, locale }) => {
            localStorage.setItem('alpine_glide_lang', locale);
            document.documentElement.classList.toggle('dark', theme === 'dark');
          },
          { theme, locale }
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.evaluate(
          (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
          theme
        );
        for (const kind of ['course', 'enrollment', 'auth', 'booking', 'reviews']) {
          await page.getByRole('button', { name: `Open ${kind}`, exact: true }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog).toHaveAccessibleName(/.+/);
          await expect
            .poll(async () => {
              const box = await dialog.boundingBox();
              return Boolean(
                box &&
                box.x >= -1 &&
                box.y >= -1 &&
                box.x + box.width <= size.width + 1 &&
                box.y + box.height <= size.height + 1
              );
            })
            .toBe(true);
          await page.screenshot({
            animations: 'disabled',
            path: `.scratch/ca-05/screens/${kind}-${size.width}-${theme}-${locale}.png`,
          });
          await dialog.getByRole('button').first().click();
          await expect(dialog).toHaveCount(0);
        }
      });
    }
  }
}

test('short viewport keeps the long enrollment form scrollable and backdrop closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.getByRole('button', { name: 'Open enrollment', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('button[type="submit"]').scrollIntoViewIfNeeded();
  await expect(dialog.locator('button[type="submit"]')).toBeInViewport();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
});
