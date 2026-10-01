/**
 * Completes the guest booking request end-to-end on STAGING (creates one disposable test record).
 * Credentials not required. Nothing is deleted afterwards.
 * Usage: node probe-guest-submit.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'shots');
const URL_BASE = (process.env.CA_URL || 'https://ski-school-staging.web.app/').replace(/\/$/, '');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const log = [];
let n = 0;

const snap = async (name, full = false) => {
  await page.waitForTimeout(1200);
  const f = `flow-guestsubmit-${String(++n).padStart(2, '0')}-${name}`;
  await page.screenshot({ path: path.join(shotDir, `${f}.png`), fullPage: full });
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const t = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 1200);
    const d = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog')].filter(vis);
    return {
      url: location.href,
      dialog: d.map(t).join(' || ').slice(0, 1400),
      buttons: [...document.querySelectorAll('button')].filter(vis).map(t).filter(Boolean).slice(-25),
      alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].filter(vis).map(t),
    };
  });
  log.push({ f, ...info });
  console.log(`\n### ${f}`);
  if (info.dialog) console.log('DIALOG:', info.dialog.slice(0, 900));
  console.log('ALERTS:', JSON.stringify(info.alerts));
  console.log('BUTTONS(tail):', JSON.stringify(info.buttons));
};

try {
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator('button:has-text("Забронировать")').first().click();
  await page.waitForTimeout(2500);
  await snap('opened');

  // identity
  const inputs = page.locator('[role="dialog"] input, [aria-modal="true"] input, dialog input');
  const fields = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('input,textarea')]
      .filter(vis)
      .map((i, idx) => ({ idx, tag: i.tagName, type: i.type, ph: i.placeholder || '' }));
  });
  console.log('FIELDS:', JSON.stringify(fields));
  const vis = page.locator('input:visible, textarea:visible');
  await vis.nth(0).fill('Тестовый Гость Проверки');
  await vis.nth(1).fill('+7 701 234 56 78');
  await vis.nth(2).fill('guest.booking.test@carveacademy.local');
  const ta = page.locator('textarea:visible');
  if (await ta.count()) await ta.first().fill('Проверка гостевой заявки: первый раз на лыжах, нужна короткая зелёная трасса.');
  await snap('filled');

  // pick a date in the calendar (prefer a day number that is not "today")
  for (const d of ['16', '17', '18', '19', '20']) {
    const b = page.locator(`[role="dialog"] button:text-is("${d}")`).first();
    if (await b.count()) { await b.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(2500);
  await snap('date-picked');

  // pick a time slot if any appeared
  const slots = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('[role="dialog"] button, dialog button')]
      .filter(vis).map((b) => (b.innerText || '').trim())
      .filter((t) => /^\d{1,2}[:.]\d{2}$/.test(t));
  });
  console.log('SLOTS:', JSON.stringify(slots.slice(0, 20)));
  if (slots.length) {
    await page.locator(`[role="dialog"] button:text-is("${slots[0]}")`).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await snap('slot-picked');

  // submit
  const submit = page.locator('button:has-text("Отправить заявку")').first();
  if (await submit.count()) {
    await submit.click().catch((e) => console.log('submit failed', String(e).slice(0, 120)));
    await page.waitForTimeout(4000);
    await snap('submitted');
  } else {
    console.log('SUBMIT BUTTON NOT FOUND');
  }
} catch (e) {
  console.log('ERROR:', e.message);
  log.push({ error: e.message });
} finally {
  fs.writeFileSync(path.join(here, 'flow-guestsubmit.json'), JSON.stringify(log, null, 2));
  await browser.close();
}