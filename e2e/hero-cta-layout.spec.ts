import { expect, test } from '@playwright/test';

for (const width of [1440, 768, 390, 320]) {
  for (const language of ['ru', 'en']) {
    test(`CTA stays stable at ${width}px (${language})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((lang) => {
        localStorage.setItem('alpine_glide_lang', lang);
      }, language);
      await page.goto('/e2e/hero-layout/');
      await page.evaluate(() => document.fonts.ready);
      // Initial CTA entrance is intentionally animated; slide changes must stay stable afterwards.
      await page.waitForTimeout(1500);
      const hero = page.locator('.hero-layout');
      if (width < 768) {
        await expect(page.locator('header img').nth(0)).toBeVisible();
        await expect(page.locator('header img').nth(1)).toBeHidden();
        await expect(page.locator('header img').nth(3)).toBeHidden();
      } else {
        await expect(page.locator('header img').nth(1)).toBeVisible();
      }
      const count = await hero.locator('.hero-copy').count();
      expect(count).toBeGreaterThan(1);
      const positions: number[][] = [];
      for (let index = 0; index < count; index++) {
        await expect(hero).toHaveAttribute('data-presented-slide', String(index));
        // Sample throughout the crossfade as well as after the text animations settle.
        for (const delay of [100, 1500]) {
          await page.waitForTimeout(delay);
          const measurement = await hero.evaluate((element) => {
            const rect = (selector: string) => {
              const node = element.querySelector(selector)!;
              const box = node.getBoundingClientRect();
              return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
            };
            return {
              hero: element.getBoundingClientRect().toJSON(),
              copy: rect('[aria-hidden="false"] .hero-copy'),
              actions: rect('.hero-actions'),
              buttons: Array.from(
                element.querySelectorAll('.hero-cta'),
                (button) => button.getBoundingClientRect().top
              ),
              pagination: rect('.hero-pagination'),
              after: document.getElementById('after-hero')!.getBoundingClientRect().top,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
            };
          });
          positions.push([...measurement.buttons, measurement.hero.bottom, measurement.after]);
          expect(measurement.overflow).toBe(false);
          expect(measurement.copy.top).toBeGreaterThanOrEqual(measurement.hero.top);
          expect(measurement.copy.bottom).toBeLessThanOrEqual(measurement.actions.top);
          expect(measurement.actions.left).toBeGreaterThanOrEqual(0);
          expect(measurement.actions.right).toBeLessThanOrEqual(width);
          expect(measurement.actions.bottom).toBeLessThanOrEqual(measurement.hero.bottom);
          if (width < 768) {
            expect(measurement.copy.right - measurement.copy.left).toBeLessThanOrEqual(
              width * 0.8 + 1
            );
            expect(measurement.actions.bottom).toBeLessThan(measurement.pagination.top);
            expect(measurement.pagination.bottom).toBeLessThanOrEqual(measurement.hero.bottom);
          }
          expect(measurement.hero.height).toBeCloseTo(900 - 68, 0);
        }
        if (index === 1) {
          await page.screenshot({ path: testInfo.outputPath('hero-longest.png') });
        }
        if (index < count - 1) {
          // The production touch handler works at every breakpoint; desktop pagination is hidden.
          await hero.evaluate((element) => {
            const touch = new Touch({ identifier: 1, target: element, clientX: 200, clientY: 100 });
            element.dispatchEvent(
              new TouchEvent('touchstart', { bubbles: true, touches: [touch] })
            );
          });
          await hero.evaluate((element) => {
            const touch = new Touch({ identifier: 1, target: element, clientX: 100, clientY: 100 });
            element.dispatchEvent(
              new TouchEvent('touchend', { bubbles: true, changedTouches: [touch] })
            );
          });
        }
      }
      for (let column = 0; column < positions[0].length; column++) {
        const values = positions.map((position) => position[column]);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
      }
      await hero.locator('.hero-primary-cta').click();
      await expect(page).toHaveURL(/#coaches-grid$/);
      await hero.locator('.hero-secondary-cta').click();
      await expect(page).toHaveURL(/#courses-grid$/);
    });
  }
}
