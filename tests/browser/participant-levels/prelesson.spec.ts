import { test, expect } from '@playwright/test';
for (const width of [390, 768, 1440])
  for (const language of ['ru', 'en']) {
    test(`prelesson read and clock transition ${width} ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.install();
      await page.goto(
        `/tests/browser/participant-levels/index.html?scenario=prelesson&language=${language}`
      );
      await page
        .getByRole('button', {
          name: language === 'ru' ? 'Действия с инструктором' : 'Instructor actions',
        })
        .click();
      await page
        .getByRole('button', {
          name: language === 'ru' ? 'Заблокировать инструктора' : 'Block instructor',
          exact: true,
        })
        .click();
      const confirm = page.getByRole('button', {
        name: language === 'ru' ? 'Подтверждение' : 'Confirm Action',
        exact: true,
      });
      await expect(confirm).toBeDisabled();
      await page.getByRole('textbox').fill('Reason');
      await confirm.click();
      await expect(page.getByTestId('block')).toHaveText('true');
      await page.getByRole('button', { name: 'Open progress' }).click();
      const status = page
        .getByRole('status')
        .filter({ hasText: language === 'ru' ? 'Просмотр доступен.' : 'Viewing is available.' });
      await expect(status).toBeVisible();
      const rating = page.getByRole('button', { name: /: 1 \/ / }).first();
      await expect(rating).toBeDisabled();
      await expect(page.getByText('Coach comment', { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.clock.fastForward(60_001);
      await expect(status).toHaveCount(0);
      await expect(rating).toBeEnabled();
      await expect(page.getByTestId('saves')).toHaveText('0');
    });
  }
