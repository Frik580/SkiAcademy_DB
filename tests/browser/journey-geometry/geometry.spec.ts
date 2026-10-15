import { expect, test, type Page } from '@playwright/test';

async function measure(page: Page, port: number, query: string) {
  await page.goto(`http://127.0.0.1:${port}/tests/browser/journey-geometry/index.html?${query}`);
  const current = page.locator('.journey-stage-node[data-journey-state="current"] > span');
  await expect(current).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Reveal state is set after mount. Wait for layout and any ancestor transition
  // to settle instead of measuring the initial scale-50 animation frame.
  await expect(current.locator('..')).toHaveCSS('opacity', '1');
  await expect
    .poll(() =>
      current
        .locator('..')
        .evaluate(
          (node) => node.getBoundingClientRect().width / parseFloat(getComputedStyle(node).width)
        )
    )
    .toBeCloseTo(1, 3);
  return page.locator('#your-journey').evaluate((section) => {
    const circle = section.querySelector<HTMLElement>(
      '.journey-stage-node[data-journey-state="current"] > span'
    )!;
    const avatar = section.querySelector<HTMLElement>('.journey-user-marker .ui-avatar')!;
    const caption = section.querySelector<HTMLElement>('.journey-marker-caption')!;
    const c = circle.getBoundingClientRect();
    const a = avatar.getBoundingClientRect();
    const x = caption.getBoundingClientRect();
    const style = getComputedStyle(caption);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return {
      circleScale: c.width / parseFloat(getComputedStyle(circle).width),
      circleWidth: c.width,
      circleHeight: c.height,
      avatarWidth: a.width,
      captionWidth: x.width,
      xpCenterOffset: x.x + x.width / 2 - (a.x + a.width / 2),
      transformX: matrix.m41,
      translate: style.translate,
    };
  });
}

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    for (const level of [1, 2, 4]) {
      test(`cabinet ${width}px ${theme} level ${level}: dev equals preview`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) =>
          route.abort()
        );
        const query = new URLSearchParams({
          theme,
          level: String(level),
          language: 'ru',
        }).toString();
        const dev = await measure(page, 5181, query);
        const preview = await measure(page, 4181, query);
        await info.attach('geometry', {
          body: JSON.stringify({ width, theme, level, dev, preview }, null, 2),
          contentType: 'application/json',
        });
        console.log(JSON.stringify({ width, theme, level, dev, preview }));
        for (const metrics of [dev, preview]) {
          expect(metrics.circleScale).toBeCloseTo(1, 2);
          expect(metrics.circleWidth).toBe(width < 640 ? 32 : 44);
          expect(metrics.circleHeight).toBe(metrics.circleWidth);
          expect(metrics.avatarWidth).toBe(32);
          expect(Math.abs(metrics.xpCenterOffset)).toBeLessThanOrEqual(1);
          // A horizontal shift must have exactly one owner, even after CSS optimization.
          const individualShift = !['none', '0px', '0px 0px'].includes(metrics.translate);
          expect(individualShift && Math.abs(metrics.transformX) > 0.01).toBe(false);
        }
        for (const key of [
          'circleScale',
          'circleWidth',
          'circleHeight',
          'avatarWidth',
          'captionWidth',
          'xpCenterOffset',
        ] as const) {
          expect(Math.abs(dev[key] - preview[key]), key).toBeLessThanOrEqual(0.1);
        }
      });
    }
  }
}
