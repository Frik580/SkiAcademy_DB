import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'png');
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  { file: '00-concept.html', width: 1300, height: 1100 },
  { file: '01-home.html', width: 1440, height: 1100 },
  { file: '02-booking.html', width: 1440, height: 1100 },
  { file: '03-cabinet.html', width: 1440, height: 1100 },
  { file: '04-instructor.html', width: 1440, height: 1100 },
  { file: '05-admin.html', width: 1560, height: 1100 },
  { file: '06-mobile.html', width: 1560, height: 1000 },
  { file: '07-states.html', width: 1300, height: 1100 },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto('file:///' + path.join(here, s.file).replace(/\\/g, '/'));
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    /* fonts may be offline; continue */
  }
  await page.waitForTimeout(1200);
  const out = path.join(outDir, s.file.replace('.html', '.png'));
  await page.screenshot({ path: out, fullPage: true });
  console.log('rendered', path.basename(out));
  await ctx.close();
}
await browser.close();
