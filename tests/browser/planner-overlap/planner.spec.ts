import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// Serve the compiled real components in memory: no protected route or test server required.
test.beforeEach(async ({ page }) => {
  await page.route('http://planner.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = fileURLToPath(
      new URL(`../../../.scratch/planner-overlap/harness${path}`, import.meta.url)
    );
    const contentType = path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.css')
        ? 'text/css'
        : 'text/html';
    await route.fulfill({ body: await readFile(file), contentType });
  });
});
for (const width of [1440, 768, 390, 320]) {
  for (const lang of ['ru', 'en']) {
    for (const theme of ['light', 'dark']) {
      test(`${width}px ${lang} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`/tests/browser/planner-overlap/index.html?lang=${lang}&theme=${theme}`);
        const list = page.getByTestId('schedule-conflict-day').filter({ visible: true });
        await expect(list).toHaveCount(1);
        await expect(
          list.getByText(lang === 'ru' ? 'Конфликт расписания' : 'Schedule conflict')
        ).toHaveCount(2);
        const first = list.locator('[data-schedule-event="booking:booking_a"]');
        const second = list.locator('[data-schedule-event="booking:booking_b"]');
        await first.getByText('child1, Tester-two, child3, child2', { exact: true }).click();
        await expect(page.getByTestId('opened-booking')).toHaveText('booking_a');
        await second.getByText('child2', { exact: true }).click();
        await expect(page.getByTestId('opened-booking')).toHaveText('booking_b');
        if (width === 320 && lang === 'ru' && theme === 'dark')
          await page.screenshot({
            path: '.scratch/planner-overlap/mobile-320-ru-dark.png',
            fullPage: true,
          });
        const a = (await first.boundingBox())!;
        const b = (await second.boundingBox())!;
        expect(a.y + a.height).toBeLessThanOrEqual(b.y);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      });
    }
  }
}
test('long participant labels wrap at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto('/tests/browser/planner-overlap/index.html?long');
  const card = page.locator('[data-schedule-event="booking:booking_a"]').filter({ visible: true });
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
