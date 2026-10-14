import { expect, test } from '@playwright/test';
for (const width of [390, 768, 1440])
  for (const theme of ['light', 'dark'])
    for (const language of ['ru', 'en']) {
      test(`mastery panels ${width} ${theme} ${language}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) =>
          route.abort()
        );
        await page.goto(
          `/tests/browser/participant-levels/index.html?theme=${theme}&language=${language}`
        );
        const instructor = page.getByTestId('instructor');
        const confirm = instructor.getByRole('button', {
          name: language === 'ru' ? 'Подтвердить повышение' : 'Confirm promotion',
        });
        await expect(confirm).toBeVisible();
        await expect(page.getByTestId('assigned').getByRole('heading')).toContainText(
          'Performance'
        );
        await expect(page.getByTestId('assigned')).toContainText(
          language === 'ru' ? 'XP текущего этапа: 0 / 100' : 'Current stage XP: 0 / 100'
        );
        await expect(
          page
            .getByTestId('admin')
            .getByRole('button', { name: language === 'ru' ? 'Назначить уровень' : 'Assign level' })
        ).toBeDisabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({
          path: `.scratch/unified-participant-levels/${width}-${theme}-${language}.png`,
          fullPage: true,
        });
        await confirm.click();
        await expect(instructor.getByRole('heading')).toContainText('Carve');
        await expect(confirm).toHaveCount(0);
        await expect(instructor).toContainText(
          language === 'ru' ? 'XP текущего этапа: 0 / 100' : 'Current stage XP: 0 / 100'
        );
      });
    }
