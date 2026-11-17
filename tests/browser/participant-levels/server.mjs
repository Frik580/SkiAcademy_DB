import process from 'node:process';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

let ready = false;
const server = await createServer({
  configFile: 'vite.config.ts',
  mode: 'e2e',
  server: { host: '127.0.0.1', port: 5177, strictPort: true },
  plugins: [
    {
      name: 'participant-levels-fixture-readiness',
      configureServer(vite) {
        vite.middlewares.use('/__participant_levels_ready', (_request, response) => {
          response.statusCode = ready ? 200 : 503;
          response.end(ready ? 'ready' : 'warming fixture');
        });
      },
    },
  ],
});
let browser;
const close = () => Promise.allSettled([browser?.close(), server.close()]);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void close().finally(() => process.exit(0)));
}
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) => route.abort());
  // The unchanged webServer startup budget owns cold module/CSS compilation.
  // A 200 HTML response alone does not mean the first fixture is ready to test.
  await page.goto(
    'http://127.0.0.1:5177/tests/browser/participant-levels/lesson-skills.html?theme=light',
    {
      waitUntil: 'domcontentloaded',
      timeout: 0,
    }
  );
  await page.getByRole('dialog').waitFor({ timeout: 0 });
  await page.getByRole('button', { name: 'Beginner 1', exact: true }).waitFor({ timeout: 0 });
  await page.waitForFunction(
    () => {
      const row = globalThis.document.querySelector('.lesson-skill-row');
      return row && globalThis.getComputedStyle(row).display === 'grid';
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
