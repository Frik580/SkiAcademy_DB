import { expect, test } from '@playwright/test';

for (const width of [1440, 768, 390, 320]) {
  for (const theme of ['light', 'dark']) {
    for (const language of ['ru', 'en']) {
      test(`attendance ${width} ${theme} ${language}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) =>
          route.abort()
        );
        await page.goto(
          `/tests/browser/admin-issue-attendance/index.html?theme=${theme}&language=${language}`
        );
        const action = page.getByRole('button', {
          name: language === 'ru' ? 'Все присутствовали' : 'Everyone attended',
        });
        await expect(action).toBeVisible();
        await expect(
          page.getByText(language === 'ru' ? 'Отсутствовал' : 'Absent', { exact: true })
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({
          path: `.scratch/admin-issue-attendance/${width}-${theme}-${language}.png`,
          animations: 'disabled',
        });
        await action.click();
        await expect(
          page.getByRole('button', { name: language === 'ru' ? 'Сохраняем...' : 'Saving...' })
        ).toBeDisabled();
      });
    }
  }
}
