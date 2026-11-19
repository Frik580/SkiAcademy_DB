import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
  );
  await page.goto('/tests/browser/public-modals/index.html?navigation');
});

test('disclosure keyboard order, immediate exit isolation and focus restoration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Navigation menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toBeFocused();
  const panel = page.getByRole('region');
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Switch to Dark' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Navigate' })).toBeFocused();
  await trigger.click();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('auth handoff restores trigger and page scroll without an extra Escape handler', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 400));
  const trigger = page.getByRole('button', { name: 'Navigation menu' });
  await trigger.click();
  const panel = page.getByRole('region');
  await expect(panel).toHaveCSS('transform', 'none');
  const signIn = panel.getByRole('button', { name: 'Sign In', exact: true });
  await expect(signIn).toBeInViewport();
  // Click the visible control without Playwright scrolling its sticky ancestor first.
  const box = (await signIn.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect
    .poll(() => page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
});

test('independent modal Escape closes only the top layer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Navigation menu' });
  await trigger.click();
  // Nonmodal disclosure leaves the uncovered page interactive.
  await page
    .getByRole('button', { name: 'Independent modal' })
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('route and breakpoint changes close the panel without reopening it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Navigation menu' });
  await trigger.click();
  await page
    .getByRole('button', { name: 'Navigate' })
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('link').first()).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.getByRole('region').getByRole('button', { name: 'RU', exact: true }).focus();
  await expect(
    page.getByRole('region').getByRole('button', { name: 'RU', exact: true })
  ).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(trigger).toBeHidden();
  await expect(page.getByRole('link').first()).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('icon highlights are centered and the dropdown keeps the header language pill sizing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Navigation menu' });

  const assertCenteredHalo = async (button: typeof trigger) => {
    const buttonBox = (await button.boundingBox())!;
    const haloBox = (await button.locator('span').first().boundingBox())!;
    expect(buttonBox.width).toBe(44);
    expect(buttonBox.height).toBe(44);
    expect(haloBox.width).toBe(32);
    expect(haloBox.height).toBe(32);
    expect(Math.abs(haloBox.x + 16 - (buttonBox.x + 22))).toBeLessThan(1);
    expect(Math.abs(haloBox.y + 16 - (buttonBox.y + 22))).toBeLessThan(1);
    await button.hover();
    expect(
      await button
        .locator('span')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    ).not.toBe('rgba(0, 0, 0, 0)');
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)'
    );
  };

  await assertCenteredHalo(trigger);
  await trigger.click();
  const panel = page.getByRole('region', { name: 'Navigation menu' });
  const theme = panel.getByRole('button', { name: 'Switch to Dark' });
  await assertCenteredHalo(theme);

  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(320);
  expect(await panel.evaluate((el) => getComputedStyle(el).rowGap)).toBe('8px');
  const headerLanguage = page.locator('header [role="group"][aria-label="Switch language"]');
  const menuLanguage = panel.getByRole('group', { name: 'Switch language' });
  expect(await menuLanguage.getAttribute('class')).toBe(await headerLanguage.getAttribute('class'));
  await expect(panel.getByText('Language', { exact: true })).toHaveCount(0);
});

for (const size of [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 390, height: 320 },
]) {
  for (const theme of ['light', 'dark']) {
    for (const locale of ['ru', 'en']) {
      test(`${size.width}x${size.height} ${theme} ${locale}: navigation geometry`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.evaluate(
          ({ theme, locale }) => {
            localStorage.setItem('theme', theme);
            localStorage.setItem('alpine_glide_lang', locale);
          },
          { theme, locale }
        );
        await page.reload();
        const trigger = page.locator('button[aria-controls]');
        if (size.width >= 1024) {
          await expect(trigger).toBeHidden();
          await expect(
            page.getByRole('button', { name: locale === 'ru' ? 'Войти' : 'Sign In', exact: true })
          ).toBeVisible();
        } else {
          await expect(trigger).toHaveAccessibleName(
            locale === 'ru' ? 'Меню навигации' : 'Navigation menu'
          );
          await trigger.click();
          const panel = page.getByRole('region');
          const signIn = panel.getByRole('button', {
            name: locale === 'ru' ? 'Войти' : 'Sign In',
            exact: true,
          });
          await signIn.scrollIntoViewIfNeeded();
          await expect(signIn).toBeInViewport();
          await expect
            .poll(async () => {
              const box = await panel.boundingBox();
              return (
                !!box &&
                box.x >= 0 &&
                box.y >= 0 &&
                box.x + box.width <= size.width + 1 &&
                box.y + box.height <= size.height + 1
              );
            })
            .toBe(true);
          for (const button of await panel.getByRole('button').all()) {
            const box = await button.boundingBox();
            // The shared RU/EN segmented control keeps its compact header dimensions.
            const isLanguageOption = await button.evaluate(
              (el) => el.hasAttribute('aria-pressed') && !!el.closest('[role="group"]')
            );
            expect(box?.height).toBeGreaterThanOrEqual(isLanguageOption ? 30 : 44);
            expect(box?.width).toBeGreaterThanOrEqual(isLanguageOption ? 30 : 44);
          }
          await panel
            .getByRole('button', { name: locale === 'ru' ? 'EN' : 'RU', exact: true })
            .click();
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          await panel.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
          await panel.getByRole('button').first().click();
          await expect(page.locator('html')).toHaveClass(theme === 'light' ? /dark/ : /^$/);
          await panel.getByRole('button').first().click();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({
          path: `.scratch/ca-13/screens/navbar-${size.width}x${size.height}-${theme}-${locale}.png`,
          animations: 'disabled',
        });
      });
    }
  }
}

test('long profile presentation scrolls at short height and selects a workspace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 320 });
  await page.goto('/tests/browser/public-modals/index.html?navigation&profile');
  const trigger = page.getByRole('button', { name: 'Navigation menu' });
  await trigger.click();
  const panel = page.getByRole('region');
  const logout = panel.getByRole('button', { name: /sign out/i });
  await logout.scrollIntoViewIfNeeded();
  await expect(logout).toBeInViewport();
  const workspace = panel.getByRole('link', { name: /cabinet/i });
  await workspace.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test.describe('Chromium mobile touch emulation', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  test('touch opens, changes language and theme, then opens and closes auth', async ({ page }) => {
    const trigger = page.locator('button[aria-controls]');
    await trigger.tap();
    const panel = page.getByRole('region');
    await panel.getByRole('button', { name: 'RU', exact: true }).tap();
    await expect(trigger).toHaveAccessibleName('Меню навигации');
    await panel.getByRole('button', { name: 'EN', exact: true }).tap();
    await panel.getByRole('button', { name: 'Switch to Dark' }).tap();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await panel.getByRole('button', { name: 'Sign In', exact: true }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
  });
});
