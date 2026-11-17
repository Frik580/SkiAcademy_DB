import { expect, test } from '@playwright/test';

// This scenario needs Vite's fixture route or the app's live source-store modules.
test.use({ baseURL: 'http://127.0.0.1:5174' });

test.beforeEach(async ({ page }) => {
  // Geometry checks do not depend on external storage or the image proxy.
  await page.route(/storage.yandexcloud.net|\/api\/img/, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#668b94"/></svg>',
    })
  );
});

for (const width of [1440, 768, 390, 320]) {
  for (const language of ['ru', 'en']) {
    test(`CTA stays stable at ${width}px (${language})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((lang) => {
        localStorage.setItem('alpine_glide_lang', lang);
      }, language);
      await page.goto('/e2e/hero-layout/');
      await expect(
        page.locator('#after-hero'),
        'Dedicated Hero fixture must be mounted'
      ).toHaveCount(1);
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
          expect(measurement.hero.top).toBeCloseTo(0, 0);
          expect(measurement.hero.height).toBeCloseTo(900, 0);
          expect(measurement.after).toBeCloseTo(900, 0);
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

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];

let videoBody: Buffer;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.start();
    for (let i = 0; i < 4; i++) {
      context.fillStyle = i % 2 ? '#315667' : '#668b94';
      context.fillRect(0, 0, 64, 64);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    recorder.stop();
    const blob = await finished;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  videoBody = Buffer.from(bytes);
  await page.close();
});

for (const viewport of viewports) {
  for (const language of ['ru', 'en']) {
    for (const theme of ['light', 'dark']) {
      for (const media of ['image', 'video']) {
        test(`overlay ${viewport.width}x${viewport.height} ${language} ${theme} ${media}`, async ({
          page,
        }, testInfo) => {
          await page.setViewportSize(viewport);
          await page.addInitScript(
            ({ language, theme }) => {
              localStorage.setItem('alpine_glide_lang', language);
              localStorage.setItem('theme', theme);
            },
            { language, theme }
          );
          await page.route('https://hero.fixture/**', (route) =>
            route.fulfill({
              contentType: 'video/webm',
              body: videoBody,
            })
          );
          await page.goto(`/e2e/hero-layout/${media === 'video' ? '?video=1' : ''}`);
          await page.evaluate(() => document.fonts.ready);
          const hero = page.locator('.hero-layout');
          const nav = page.locator('nav.home-overlay-header');
          await expect(hero).toHaveAttribute('data-presented-slide', '0');
          await expect(nav).toHaveAttribute('data-transparent', 'true');
          await expect(nav.locator('header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await page.waitForTimeout(1500);
          if (media === 'video') {
            const video = hero.locator('video').first();
            await expect
              .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
              .toBeGreaterThanOrEqual(2);
            expect(
              await video.evaluate(
                (el: HTMLVideoElement) =>
                  el.muted && el.playsInline && !el.controls && el.currentTime > 0
              )
            ).toBe(true);
          } else {
            await expect
              .poll(() =>
                hero
                  .locator('img')
                  .first()
                  .evaluate((el: HTMLImageElement) => el.naturalWidth)
              )
              .toBeGreaterThan(0);
          }
          const measure = () =>
            page.evaluate(() => {
              const box = (selector: string) =>
                document.querySelector(selector)!.getBoundingClientRect().toJSON();
              return {
                hero: box('.hero-layout'),
                header: box('header'),
                media: box('.hero-banner-media'),
                copy: box('[aria-hidden="false"] .hero-copy'),
                actions: box('.hero-actions'),
                after: box('#after-hero'),
                overflow: document.documentElement.scrollWidth > innerWidth,
              };
            });
          const initial = await measure();
          expect(initial.hero.top).toBeCloseTo(0, 0);
          expect(initial.media.top).toBeCloseTo(0, 0);
          expect(initial.media.bottom).toBeCloseTo(viewport.height, 0);
          expect(initial.hero.bottom).toBeCloseTo(viewport.height, 0);
          expect(initial.after.top).toBeCloseTo(viewport.height, 0);
          expect(initial.copy.top).toBeGreaterThan(initial.header.bottom);
          expect(initial.copy.bottom).toBeLessThanOrEqual(initial.actions.top);
          expect(initial.actions.bottom).toBeLessThan(initial.hero.bottom);
          expect(initial.overflow).toBe(false);

          if (viewport.width < 1024) {
            const trigger = nav.locator('button[aria-controls]');
            await trigger.click();
            await expect(trigger).toHaveAttribute('aria-expanded', 'true');
            await expect(nav).toHaveAttribute('data-transparent', 'false');
            expect((await measure()).hero.bottom).toBeCloseTo(initial.hero.bottom, 0);
            await page.keyboard.press('Escape');
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');
            await expect(nav).toHaveAttribute('data-transparent', 'true');
            await expect(page.locator('nav [aria-hidden="true"][inert]')).toHaveCount(1);
            await expect(nav.locator('[role="region"]')).toHaveCount(0);
          }
          await page.evaluate(() => window.scrollTo(0, innerHeight + 150));
          await expect(nav).toHaveAttribute('data-transparent', 'false');
          await expect.poll(() => nav.evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
          const sticky = await page.locator('.conditions-strip').boundingBox();
          expect(sticky!.y).toBeCloseTo(initial.header.height, 0);
          await page.evaluate(() => window.scrollTo(0, innerHeight + 1250));
          await expect
            .poll(() =>
              page.locator('.conditions-strip').evaluate((el) => el.getBoundingClientRect().bottom)
            )
            .toBeLessThanOrEqual(initial.header.height + 1);
          await page.evaluate(() => window.scrollTo(0, 0));
          await expect(nav).toHaveAttribute('data-transparent', 'true');
          expect((await measure()).hero.bottom).toBeCloseTo(initial.hero.bottom, 0);

          // Dynamic viewport changes must resize Hero and preserve the next section's boundary.
          await page.setViewportSize({ ...viewport, height: viewport.height - 80 });
          await expect
            .poll(async () => (await measure()).hero.bottom)
            .toBeCloseTo(viewport.height - 80, 0);
          expect((await measure()).after.top).toBeCloseTo(viewport.height - 80, 0);
          await page.setViewportSize(viewport);
          await expect(nav.locator('[role="region"]')).toHaveCount(0);
          if (language === 'ru' && theme === 'dark' && media === 'image') {
            await page.screenshot({ path: testInfo.outputPath('overlay.png') });
          }
          await page.locator('#route-toggle').click();
          await expect(page.locator('nav')).not.toHaveClass(/home-overlay-header/);
          await expect(page.locator('.home-header-sentinel')).toHaveCount(0);
          await expect(page.locator('nav header')).not.toHaveCSS(
            'background-color',
            'rgba(0, 0, 0, 0)'
          );
        });
      }
    }
  }
}

test('connection warning stays clear of Header and Hero content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/e2e/hero-layout/?warning=1');
  const hero = await page.locator('.hero-layout').boundingBox();
  const warning = await page.locator('.page-status-warning').boundingBox();
  expect(hero!.y).toBeCloseTo(0, 0);
  expect(hero!.height).toBeCloseTo(667, 0);
  const header = await page.locator('header').boundingBox();
  expect(warning!.y).toBeGreaterThanOrEqual(header!.height);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const copy = await page.locator('[aria-hidden="false"] .hero-copy').boundingBox();
  expect(copy!.y).toBeGreaterThan(warning!.y + warning!.height);
  await page.locator('.page-status-warning button').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.hero-primary-cta')).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
