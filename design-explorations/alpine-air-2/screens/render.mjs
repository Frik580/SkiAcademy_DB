/**
 * Renders every generated screen at 1440 / 1024 / 390 / 360 and writes PNGs.
 * Usage: node screens/render.mjs [screenId]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screensDir = path.join(root, 'screens');
const pngBase = path.join(root, 'screens', 'png');

const WIDTHS = [
  { w: 1440, h: 1000 },
  { w: 1024, h: 900 },
  { w: 390, h: 844, mobile: true },
  { w: 360, h: 780, mobile: true },
];

const only = process.argv[2] || null;

const files = [];
for (const role of ['public', 'student', 'instructor', 'admin', 'shared']) {
  const dir = path.join(screensDir, role);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.html')) files.push({ role, name: f.replace('.html', ''), path: path.join(dir, f) });
  }
}
const target = only ? files.filter((f) => f.name === only) : files;

const browser = await chromium.launch();
let n = 0;
for (const f of target) {
  for (const vp of WIDTHS) {
    const outDir = path.join(pngBase, String(vp.w));
    fs.mkdirSync(outDir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.w <= 390 ? 2 : 1.5,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile,
    });
    const page = await ctx.newPage();
    await page.goto('file:///' + f.path.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outDir, `${f.name}.png`), fullPage: true });
    await ctx.close();
    n++;
  }
  console.log(`rendered ${f.role}/${f.name} @ ${WIDTHS.map((w) => w.w).join(', ')}`);
}
await browser.close();
console.log(`total shots: ${n}`);