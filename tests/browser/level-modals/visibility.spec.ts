import { expect, test, type Page } from '@playwright/test';

async function checkDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = element.closest('[data-admin-modal-root]')!;
    const overlay = root.querySelector('.ui-modal-overlay')!;
    const style = getComputedStyle(element);
    const close = element.querySelector('header button')!;
    const closeRect = close.getBoundingClientRect();
    const topAt = (x: number, y: number) => element.contains(document.elementFromPoint(x, y));
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: getComputedStyle(root).position,
      portal: root.parentElement === document.body,
      separateOverlay:
        !overlay.contains(element) && overlay.parentElement === element.parentElement,
      aboveOverlay: topAt(rect.x + rect.width / 2, rect.y + rect.height / 2),
      closeAboveOverlay: topAt(
        closeRect.x + closeRect.width / 2,
        closeRect.y + closeRect.height / 2
      ),
      horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
      bodyOverflow:
        element.querySelector('.admin-modal-body')!.scrollWidth >
        element.querySelector('.admin-modal-body')!.clientWidth + 1,
    };
  });
  expect(geometry, JSON.stringify(geometry)).toMatchObject({
    position: 'fixed',
    portal: true,
    separateOverlay: true,
    aboveOverlay: true,
    closeAboveOverlay: true,
    horizontalOverflow: false,
    bodyOverflow: false,
    visibility: 'visible',
    opacity: '1',
  });
  expect(geometry.display).not.toBe('none');
  expect(geometry.width).toBeGreaterThan(250);
  expect(geometry.height).toBeGreaterThan(150);
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  await expect(page.locator('html')).toHaveClass(/modal-scroll-lock/);
  await expect(dialog.locator('header button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(dialog.locator('header button')).toBeFocused();
  return dialog;
}

for (const width of [1440, 390, 320]) {
  for (const theme of ['light', 'dark']) {
    for (const language of ['ru', 'en']) {
      test(`${width}px ${theme} ${language}: request, manual level, skills, reopen`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({
          width,
          height: width === 320 ? 568 : width === 390 ? 844 : 900,
        });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        // External reads are irrelevant to this isolated modal check. Writes are never submitted.
        await page.route(/firestore\.googleapis\.com|cloudfunctions\.net/, (route) =>
          route.abort()
        );
        await page.goto(
          `/tests/browser/level-modals/index.html?theme=${theme}&language=${language}`
        );
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);

        const request = language === 'ru' ? 'Запросить изменение уровня' : 'Request level change';
        const skillOpen = language === 'ru' ? 'Test Student: Оценить' : 'Test Student: Assess';
        const openers = [
          { kind: 'request', opener: page.getByRole('button', { name: request, exact: true }) },
          { kind: 'admin', opener: page.getByTestId('admin-open') },
          { kind: 'skills', opener: page.getByRole('button', { name: skillOpen, exact: true }) },
        ];
        for (const { kind, opener } of openers) {
          for (let attempt = 0; attempt < 3; attempt++) {
            await opener.click();
            const dialog = await checkDialog(page);
            if (kind !== 'skills') {
              await dialog
                .locator('textarea')
                .first()
                .fill(language === 'ru' ? 'Проверка окна' : 'Modal check');
              await dialog.locator('select').first().selectOption('2');
              const operation = dialog.getByRole('button', {
                name:
                  kind === 'request'
                    ? request
                    : language === 'ru'
                      ? 'Назначить уровень'
                      : 'Assign level',
                exact: true,
              });
              await expect(operation).toBeEnabled();
              await operation.click({ trial: true });
              await dialog.locator('header button').scrollIntoViewIfNeeded();
            } else {
              const maximum = dialog.getByRole('button', { name: /: 25 \/ 25$/ }).first();
              const zero = maximum.locator('..').getByRole('button', { name: /: 0 \/ 25$/ });
              for (const rating of [zero, maximum]) {
                await rating.scrollIntoViewIfNeeded();
                await expect(rating).toBeInViewport();
                expect(
                  await rating.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    return el.contains(
                      document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
                    );
                  })
                ).toBe(true);
                await rating.click();
                await expect(rating).toHaveAttribute('aria-pressed', 'true');
              }
              if (attempt === 0 && theme === 'dark' && language === 'ru') {
                await page.screenshot({
                  path: `.scratch/level-modal-visibility/after-ratings-${width}-dark-ru.png`,
                });
              }
              const stage = dialog.getByRole('button', { name: /Carve → Performance/ });
              await stage.click();
              await expect(stage).toHaveClass(/border-accent/);
              expect((await stage.boundingBox())!.height).toBeLessThan(80);
              const save = dialog.getByRole('button', {
                name: language === 'ru' ? 'Сохранить оценки' : 'Save Ratings',
                exact: true,
              });
              await expect(save).toBeInViewport();
              await save.click({ trial: true });
            }
            if (attempt === 0) {
              await page.screenshot({
                path: `.scratch/level-modal-visibility/after-${kind}-${width}-${theme}-${language}.png`,
              });
            }
            if (attempt === 1) await page.keyboard.press('Escape');
            else await dialog.locator('header button').click();
            await expect(page.getByRole('dialog')).toHaveCount(0);
            await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
            await expect(opener).toBeFocused();
          }
        }
        expect(errors).toEqual([]);
      });
    }
  }
}
