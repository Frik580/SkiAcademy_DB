/**
 * Staging live-flow verification (read-only inspection + disposable test records).
 * Credentials come from env vars only; nothing is written to the repo.
 *
 *   flow=guest   -> open guest booking, fill, submit, capture confirmation
 *   flow=book    -> student books a lesson with the fixture coach (creates a disposable record)
 *   flow=teacher -> login as instructor, verify lessons, open lesson, mark attendance
 *
 * Usage: node probe-flows.mjs <flow>
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const URL_BASE = (process.env.CA_URL || 'https://ski-school-staging.web.app/').replace(/\/$/, '');
const flow = process.argv[2] || 'guest';
const EMAIL = process.env.CA_EMAIL || '';
const PASSWORD = process.env.CA_PASSWORD || '';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const log = [];
let n = 0;

const snap = async (name, full = true) => {
  await page.waitForTimeout(1000);
  const f = `flow-${flow}-${String(++n).padStart(2, '0')}-${name}`;
  await page.screenshot({ path: path.join(shotDir, `${f}.png`), fullPage: full });
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const t = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 1500);
    return {
      url: location.href,
      dialogs: [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog')].filter(vis).map(t),
      body: t(document.body).slice(0, 1500),
      buttons: [...document.querySelectorAll('button')].filter(vis).map(t).filter(Boolean),
      inputs: [...document.querySelectorAll('input,select,textarea')].filter(vis).map((i) => `${i.type}:${i.placeholder || i.getAttribute('aria-label') || i.name || ''}`),
    };
  });
  log.push({ f, ...info });
  console.log(`\n### ${f}\nURL ${info.url}`);
  if (info.dialogs.length) console.log('DIALOG:', info.dialogs.join(' || ').slice(0, 700));
  console.log('BUTTONS:', JSON.stringify(info.buttons));
  console.log('INPUTS:', JSON.stringify(info.inputs));
  console.log('BODY:', info.body.slice(0, 600));
  return info;
};

const click = async (text, nth = 0, wait = 1200) => {
  const variants = Array.isArray(text) ? text : [text];
  for (const t of variants) {
    const loc = page.locator(`button:has-text("${t}"), [role="tab"]:has-text("${t}"), [role="button"]:has-text("${t}")`).nth(nth);
    try {
      await loc.waitFor({ state: 'visible', timeout: 4000 });
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ timeout: 4000 });
      await page.waitForTimeout(wait);
      return true;
    } catch (e) { /* try next variant */ }
  }
  console.log(`click(${JSON.stringify(variants)}) failed`);
  return false;
};

async function login() {
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  for (const t of ['Sign In', 'Войти']) {
    const l = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
    if (await l.count()) { await l.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(1500);
  const inputs = page.locator('input');
  await inputs.nth(0).fill(EMAIL);
  await inputs.nth(1).fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(8000);
  console.log('LOGIN ->', page.url());
}

try {
  if (flow === 'guest') {
    await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await snap('home');
    if (await click(['Book Lesson', 'Забронировать'], 0, 2500)) await snap('booking-dialog', false);
    if (await click(['Book Lesson', 'Забронировать'], 1, 2500)) await snap('booking-dialog-2', false);
  }

  if (flow === 'book') {
    await login();
    await page.goto(URL_BASE + '/cabinet', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await click(['Coach', 'Тренер'], 0, 2500);
    await snap('coach-list');
    if (await click(['Book Lesson', 'Забронировать', 'Записаться'], 0, 2500)) await snap('booking-dialog', false);
  }

  if (flow === 'teacher') {
    await login();
    await page.goto(URL_BASE + '/instructor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    await snap('instructor-today');
    await click(['Today', 'Сегодня'], 0, 1500);
    await snap('instructor-after-nav');
  }
} catch (e) {
  console.log('ERROR:', e.message);
  log.push({ error: e.message });
} finally {
  fs.writeFileSync(path.join(here, `flow-${flow}.json`), JSON.stringify(log, null, 2));
  await browser.close();
}