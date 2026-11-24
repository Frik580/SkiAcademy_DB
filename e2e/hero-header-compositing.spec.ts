import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { E2E_LIVE_APP_URL } from './emulator-config';

test.describe.configure({ mode: 'parallel' });
test.use({ baseURL: E2E_LIVE_APP_URL });

const sizes = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs><pattern id="p" width="80" height="64" patternUnits="userSpaceOnUse">
    <rect width="80" height="64" fill="#668b94"/>
    <rect y="16" width="80" height="16" fill="#cb9670"/>
    <rect x="32" width="16" height="64" fill="#395f73"/>
  </pattern></defs><rect width="1920" height="1080" fill="url(#p)"/>
</svg>`;

async function recordFrame(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.start();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#668b94';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#cb9670';
      ctx.fillRect(0, 32, 128, 32);
      ctx.fillStyle = '#395f73';
      ctx.fillRect(48, 0, 32, 128);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    recorder.stop();
    const blob = await done;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function pixels(page: Page, png: Buffer): Promise<number[]> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, image.width, image.height).data);
  }, png.toString('base64'));
}

async function sample(page: Page, testInfo: TestInfo, name: string) {
  // Use document coordinates, compensating for scroll: this is the same image/video area.
  // The band is above pagination, below CTA, and outside Header and its menu.
  const clip = await page.locator('.ui-hero').evaluate((hero) => {
    const box = hero.getBoundingClientRect();
    return { x: 12, y: box.bottom - 100, width: box.width - 24, height: 24 };
  });
  const png = await page.screenshot({ clip });
  await testInfo.attach(name, { body: png, contentType: 'image/png' });
  return pixels(page, png);
}

function unchanged(before: number[], after: number[]) {
  expect(after.length).toBe(before.length);
  let changedChannels = 0;
  let largestDifference = 0;
  for (let i = 0; i < before.length; i++) {
    const delta = Math.abs(after[i] - before[i]);
    if (delta !== 0) changedChannels++;
    largestDifference = Math.max(largestDifference, delta);
  }
  expect({ changedChannels, largestDifference }).toEqual({
    changedChannels: 0,
    largestDifference: 0,
  });
}

for (const viewport of sizes) {
  for (const theme of ['dark', 'light']) {
    for (const language of ['ru', 'en']) {
      for (const media of ['image', 'video']) {
        test(`Hero pixels ${viewport.width} ${theme} ${language} ${media}`, async ({
          page,
        }, testInfo) => {
          await page.setViewportSize(viewport);
          await page.addInitScript(
            ({ theme, language }) => {
              localStorage.setItem('theme', theme);
              localStorage.setItem('alpine_glide_lang', language);
            },
            { theme, language }
          );
          const videoBody = media === 'video' ? await recordFrame(page) : undefined;
          await page.route(/storage.yandexcloud.net|\/api\/img/, (route) =>
            route.fulfill({ contentType: 'image/svg+xml', body: image })
          );
          if (videoBody) {
            await page.route('https://hero.fixture/**', (route) =>
              route.fulfill({ contentType: 'video/webm', body: videoBody })
            );
          }
          await page.goto(`/e2e/hero-layout/?appearance=1${media === 'video' ? '&video=1' : ''}`);
          // Vite preview's SPA fallback also renders a Hero, but without the one-slide fixture.
          await expect(page.locator('#after-hero')).toHaveCount(1);
          const hero = page.locator('.ui-hero');
          const nav = page.locator('nav.home-overlay-header');
          const header = nav.locator('header');
          await expect(hero).toHaveAttribute('data-presented-slide', '0');
          await page.evaluate(() => document.fonts.ready);
          if (media === 'video') {
            const video = hero.locator('video[data-video-role="ACTIVE"]');
            await expect
              .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
              .toBeGreaterThanOrEqual(2);
            // An ended/paused constant frame cannot introduce differences between captures.
            await expect
              .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
              .toBeGreaterThan(0);
            await video.evaluate((el: HTMLVideoElement) => el.pause());
          } else {
            const banner = hero.locator('img.hero-banner-media');
            await expect(banner).toHaveCount(1);
            await expect
              .poll(() => banner.evaluate((el: HTMLImageElement) => el.naturalWidth))
              .toBeGreaterThan(0);
          }
          await page.waitForTimeout(1500);
          const initial = await hero.boundingBox();
          expect(initial!.y).toBe(0);
          expect(initial!.height).toBe(viewport.height);

          for (const scrim of ['default', 'custom']) {
            const overlay = hero.locator(':scope > .z-0 > div > div.pointer-events-none');
            if (scrim === 'custom') {
              await overlay.evaluate((el, theme) => {
                (el as HTMLElement).style.backgroundImage =
                  theme === 'dark'
                    ? 'linear-gradient(90deg, rgba(10,10,10,0.73), rgba(10,10,10,0.31))'
                    : 'linear-gradient(90deg, rgba(255,255,255,0.73), rgba(255,255,255,0.31))';
              }, theme);
            }
            const scrimStyle = await overlay.getAttribute('style');
            await expect(nav).toHaveAttribute('data-transparent', 'true');
            await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            const baseline = await sample(page, testInfo, `${scrim}-transparent`);
            // A neutral filter keeps the backdrop compositing context alive at the top.
            // none -> blur would create/destroy it when scrolling over a video overlay.
            await expect(header).toHaveCSS('isolation', 'isolate');
            await expect(header).toHaveCSS('backdrop-filter', 'blur(0px) saturate(1)');
            await page.evaluate(() => scrollTo(0, 8));
            await expect(nav).toHaveAttribute('data-transparent', 'false');
            await page.waitForTimeout(80);
            unchanged(baseline, await sample(page, testInfo, `${scrim}-transition`));
            await expect(header).toHaveCSS('backdrop-filter', 'blur(24px) saturate(1.5)');
            unchanged(baseline, await sample(page, testInfo, `${scrim}-scrolled`));
            await page.evaluate(() => scrollTo(0, 0));
            await expect(nav).toHaveAttribute('data-transparent', 'true');
            await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            unchanged(baseline, await sample(page, testInfo, `${scrim}-returned`));
            if (viewport.width < 1024) {
              await nav.locator('button[aria-controls]').click();
              await expect(nav).toHaveAttribute('data-transparent', 'false');
              await expect(header).toHaveCSS('backdrop-filter', 'blur(24px) saturate(1.5)');
              unchanged(baseline, await sample(page, testInfo, `${scrim}-menu`));
              await page.keyboard.press('Escape');
              await expect(nav.locator('[role="region"]')).toHaveCount(0);
              await expect(nav).toHaveAttribute('data-transparent', 'true');
              unchanged(baseline, await sample(page, testInfo, `${scrim}-closed`));
            }
            await expect(overlay).toHaveAttribute('style', scrimStyle!);
            await expect(hero).toHaveAttribute('data-presented-slide', '0');
            await expect(hero).toHaveAttribute('data-outgoing-slide', '');
            expect(await hero.boundingBox()).toEqual(initial);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
            ).toBe(false);
          }
        });
      }
    }
  }
}
