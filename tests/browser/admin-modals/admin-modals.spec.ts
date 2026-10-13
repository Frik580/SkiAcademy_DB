import { expect, test, type Page } from '@playwright/test';

async function openFixture(page: Page, kind: string) {
  await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) => route.abort());
  await page.goto(`/tests/browser/admin-modals/index.html?kind=${kind}`);
  await page.getByRole('button', { name: 'Открыть окно' }).click();
  return page.getByRole('dialog');
}

const sizes = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
for (const size of sizes) {
  for (const theme of ['light', 'dark']) {
    for (const kind of [
      'slot',
      'move',
      'link',
      'chat',
      'confirm',
      'long',
      'reference',
      'native-confirm',
      'native-alert',
    ]) {
      test(`${kind} ${size.width}x${size.height} ${theme}`, async ({ page }) => {
        await page.setViewportSize(size);
        // This fixture must never talk to a real Firebase backend.
        await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) =>
          route.abort()
        );
        await page.goto(`/tests/browser/admin-modals/index.html?kind=${kind}&theme=${theme}`);
        await page.getByRole('button', { name: 'Открыть окно' }).click();
        const shell =
          kind === 'reference'
            ? page.getByRole('dialog', { name: 'Эталон бронирования' })
            : page.getByRole('dialog');
        await expect(shell).toBeVisible();
        if (kind !== 'reference') {
          await expect
            .poll(async () => {
              const bounds = await shell.boundingBox();
              return bounds
                ? Math.max(
                    Math.abs(bounds.x + bounds.width / 2 - size.width / 2),
                    Math.abs(bounds.y + bounds.height / 2 - size.height / 2)
                  )
                : Infinity;
            })
            .toBeLessThan(2);
        }
        await page.screenshot({
          animations: 'disabled',
          path: `.scratch/admin-modal-unification/after/${kind}-${size.width}-${theme}.png`,
        });
        if (kind === 'reference') return;
        const box = await shell.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.abs(box!.x + box!.width / 2 - size.width / 2)).toBeLessThan(2);
        expect(Math.abs(box!.y + box!.height / 2 - size.height / 2)).toBeLessThan(2);
        expect(box!.width).toBeLessThanOrEqual(size.width - 24);
        expect(box!.height).toBeLessThanOrEqual(size.height - 24);
        expect(await shell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        const chrome = (element: Element) => {
          const style = getComputedStyle(element);
          return [
            style.backgroundColor,
            style.borderColor,
            style.boxShadow,
            style.color,
            style.fontFamily,
          ];
        };
        expect(await shell.evaluate(chrome)).toEqual(
          await page.getByTestId('reference-shell').evaluate(chrome)
        );
        const body = shell.locator('.admin-modal-body');
        if (kind === 'long') {
          expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
          await body.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          await expect(shell.getByLabel('Последнее поле')).toBeVisible();
          await expect(shell.getByRole('button', { name: 'Подтвердить' })).toBeInViewport();
        }
        await page.keyboard.press('Escape');
        await expect(shell).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Открыть окно' })).toBeFocused();
      });
    }
  }
}

test('native schedule controls preserve the submit payload', async ({ page }) => {
  const dialog = await openFixture(page, 'slot');
  await dialog.getByRole('combobox').selectOption('2');
  await dialog.getByRole('textbox').fill('Перерыв на обед');
  await dialog.getByRole('button', { name: 'Запланировать', exact: true }).click();
  await expect(page.getByTestId('saved')).toContainText('Перерыв на обед');
  await expect(dialog).toHaveCount(0);
});

test('booking tab uses reference chrome for every client/participant field', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const dialog = await openFixture(page, 'slot');
  await dialog.getByRole('tab', { name: 'Запись', exact: true }).click();
  const controls = dialog.getByRole('combobox');
  await expect(controls).toHaveCount(4);
  const shape = (element: Element) => {
    const style = getComputedStyle(element);
    return [
      style.backgroundColor,
      style.borderRadius,
      style.borderWidth,
      style.fontSize,
      style.color,
    ];
  };
  const referenceShape = await page.getByTestId('reference-choice').evaluate((element) => {
    const frame = element.firstElementChild!.firstElementChild!;
    const band = frame.querySelector('[class*="top-1/2"]')!;
    const label = frame.querySelector('button > span')!;
    return [
      getComputedStyle(band).backgroundColor,
      getComputedStyle(frame).borderRadius,
      getComputedStyle(frame).borderWidth,
      getComputedStyle(label).fontSize,
      getComputedStyle(label).color,
    ];
  });
  for (const control of await controls.all()) {
    expect(await control.evaluate(shape)).toEqual(referenceShape);
  }
  const field = dialog.getByRole('textbox').first();
  expect(await field.evaluate(shape)).toEqual(
    await page.getByTestId('reference-field').evaluate(shape)
  );
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({
    path: '.scratch/admin-modal-unification/after/booking-320-light.png',
    animations: 'disabled',
  });
});

test('guest linking still searches, selects and submits the selected account', async ({ page }) => {
  const dialog = await openFixture(page, 'link');
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await dialog.getByRole('textbox').fill('client-2@example.test');
  await dialog.getByRole('button', { name: /Клиент 3/ }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByTestId('saved')).toHaveText('booking-fixture/client-2');
});

test('admin chat preserves composer and attachment controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const dialog = await openFixture(page, 'chat');
  await dialog.getByRole('textbox').fill('Сообщение администратору');
  await dialog.locator('button[type="submit"]').click();
  await expect(page.getByTestId('saved')).toHaveText('message');
  await dialog.getByRole('button', { name: /Ссылка/i }).click();
  await expect(dialog.getByRole('textbox')).toHaveCount(2);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('Escape closes the planner confirmation before its underlying form', async ({ page }) => {
  const parent = await openFixture(page, 'move');
  const trigger = parent.locator('.admin-modal-actions button').first();
  await trigger.click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('modal-scroll-lock'))
  ).toBe(true);
});

test('keyboard-resized visual viewport keeps the form and actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: 390, height: 350, offsetTop: 120, offsetLeft: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });
  const dialog = await openFixture(page, 'long');
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      return Math.abs(box!.y + box!.height / 2 - 295);
    })
    .toBeLessThan(2);
  const box = await dialog.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(326);
  await dialog.getByLabel('Последнее поле').fill('Проверка клавиатуры');
  await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeInViewport();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({
    path: '.scratch/admin-modal-unification/after/keyboard-390.png',
    animations: 'disabled',
  });
});
