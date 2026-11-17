import process from 'node:process';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

let ready = false;
const server = await createServer({
  configFile: 'vite.config.ts',
  mode: 'staging',
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  plugins: [
    {
      name: 'attendance-fixture-readiness',
      configureServer(vite) {
        // Register before Vite's HTML fallback so the probe cannot get a false 200.
        vite.middlewares.use('/__attendance_ready', (_request, response) => {
          response.statusCode = ready ? 200 : 503;
          response.end(ready ? 'ready' : 'warming fixture');
        });
      },
    },
  ],
});

/** @type {import('@playwright/test').Browser | undefined} */
let browser;
const close = () => Promise.allSettled([browser?.close(), server.close()]);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void close().finally(() => process.exit(0)));
}

try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) => route.abort());
  // The unchanged Playwright webServer startup budget bounds the entire warmup.
  // Do not spend the first scenario's 30s budget on Vite's cold module/CSS graph.
  await page.goto(
    'http://127.0.0.1:5176/tests/browser/admin-issue-attendance/index.html?theme=light&language=ru',
    { waitUntil: 'domcontentloaded', timeout: 0 }
  );
  await page.getByRole('button', { name: 'Все присутствовали' }).waitFor({ timeout: 0 });
  await page.waitForFunction(
    () => {
      const button = globalThis.document.querySelector('button');
      return button && !button.disabled && globalThis.getComputedStyle(button).display === 'inline-flex';
    },
    undefined,
    { timeout: 0 }
  );
  await page.evaluate(() => globalThis.document.fonts.ready);
  if (browserErrors.length) throw new Error(`Fixture browser errors: ${browserErrors.join('\n')}`);
  await browser.close();
  browser = undefined;
  ready = true;
} catch (error) {
  await close();
  throw error;
}
