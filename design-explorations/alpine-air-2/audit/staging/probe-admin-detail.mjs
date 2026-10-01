/**
 * Checks whether instructor availability / lessons can be created via the admin UI (non-destructively),
 * and captures admin planner + people detail for the audit.
 * Usage: node probe-admin-detail.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'shots');
const URL_BASE = (process.env.CA_URL || 'https://ski-school-staging.web.app/').replace(/\/$/, '');
const EMAIL = process.env.CA_EMAIL || '';
const PASSWORD = process.env.CA_PASSWORD || '';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1560, height: 950 } });
const page = await ctx.newPage();
const log = [];
let n = 0;

const snap = async (name, full = false) => {
  await page.waitForTimeout(1200);
  const f = `admin-detail-${String(++n).padStart(2, '0')}-${name}`;
  await page.screenshot({ path: path.join(shotDir, `${f}.png`), fullPage: full });
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const t = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
    return {
      buttons: [...document.querySelectorAll('button,[role="button"]')].filter(vis).map(t).filter(Boolean),
      tables: [...document.querySelectorAll('table')].filter(vis).map((x) => [...x.querySelectorAll('thead th')].map(t).join('|') + ` rows=${x.querySelectorAll('tbody tr').length}`),
      text: t(document.body).slice(0, 2500),
    };
  });
  log.push({ f, ...info });
  console.log(`\n### ${f}`);
  console.log('TABLES:', JSON.stringify(info.tables));
  console.log('BUTTONS:', JSON.stringify(info.buttons.slice(0, 60)));
};

try {
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  for (const t of ['Войти', 'Sign In']) {
    const l = page.locator(`button:has-text("${t}")`).first();
    if (await l.count()) { await l.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(1500);
  const inputs = page.locator('input');
  await inputs.nth(0).fill(EMAIL);
  await inputs.nth(1).fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(8000);

  // planner / schedule board
  await page.goto(URL_BASE + '/admin?tab=operations', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await snap('operations', true);

  // people -> coaches
  await page.goto(URL_BASE + '/admin?tab=people', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await snap('people', true);
  for (const label of ['Раскрыть', 'Показать', 'Coaches', 'Инструкторы', 'Управление инструкторами']) {
    const l = page.locator(`button:has-text("${label}"), summary:has-text("${label}")`).first();
    if (await l.count()) { await l.click().catch(() => {}); await page.waitForTimeout(2000); await snap(`people-${label}`, true); break; }
  }
  const addBtn = page.locator('button:has-text("ДОБАВИТЬ ИНСТРУКТОРА"), button:has-text("Добавить инструктора")').first();
  if (await addBtn.count()) { await addBtn.click().catch(() => {}); await page.waitForTimeout(2000); await snap('add-instructor-dialog', true); }

  // product -> courses (archived lifecycle)
  await page.goto(URL_BASE + '/admin?tab=product', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await snap('product', true);
} catch (e) {
  console.log('ERROR:', e.message);
  log.push({ error: e.message });
} finally {
  fs.writeFileSync(path.join(here, 'admin-detail.json'), JSON.stringify(log, null, 2));
  await browser.close();
}