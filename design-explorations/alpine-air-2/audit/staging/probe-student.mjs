/**
 * Focused probe: student cabinet sub-sections + participant switcher. Read-only.
 * Credentials from env vars only.
 * Usage: node probe-student.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const out = {};

const grab = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 2500);
  return {
    url: location.href,
    body: t(document.body),
    buttons: [...document.querySelectorAll('button,[role="button"],[role="tab"]')].filter(vis).map(t).filter(Boolean),
    headings: [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((h) => `${h.tagName}|${t(h)}`),
    inputs: [...document.querySelectorAll('input,select,textarea')].filter(vis).map((i) => `${i.type}:${i.placeholder || i.getAttribute('aria-label') || ''}`),
    tables: [...document.querySelectorAll('table')].filter(vis).map((x) => [...x.querySelectorAll('thead th')].map(t).join('|') + ` rows=${x.querySelectorAll('tbody tr').length}`),
    dialogs: [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(vis).map(t),
  };
};

async function snap(n) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, `probe-stu-${n}.png`), fullPage: true });
  out[n] = await page.evaluate(grab);
  console.log(`--- ${n} --- headings=${out[n].headings.length} btns=${out[n].buttons.length}`);
  console.log(out[n].body.slice(0, 420));
}

async function click(text, nth = 0) {
  const loc = page.locator(`button:has-text("${text}"), [role="tab"]:has-text("${text}"), [role="button"]:has-text("${text}")`).nth(nth);
  try {
    await loc.waitFor({ state: 'visible', timeout: 3000 });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ timeout: 3000 });
    await page.waitForTimeout(1000);
    return true;
  } catch { return false; }
}

await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
let ok = false;
for (const t of ['Sign In', 'Войти']) {
  const l = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
  if (await l.count()) { await l.click().catch(() => {}); ok = true; break; }
}
await page.waitForTimeout(1500);
const inputs = page.locator('input');
await inputs.nth(0).fill(EMAIL);
await inputs.nth(1).fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(7000);
await page.goto(URL_BASE + '/cabinet', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await snap('01-home');

for (const tab of ['Profile', 'Training', 'Coach', 'Home']) {
  if (await click(tab)) await snap(`02-tab-${tab}`);
}

// Profile sections (EN labels)
for (const s of ['Participants', 'Wallet', 'history', 'Skills', 'Certificates', 'Achievements', 'This season', 'Video', 'Settings']) {
  if (await click(s)) await snap(`03-sec-${s.replace(/\s/g, '_')}`);
}

// participant switcher: click each avatar-like button in the top bar
const avatars = await page.evaluate(() => [...document.querySelectorAll('header button, nav button')].map((b, i) => ({ i, t: (b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 40), w: b.getBoundingClientRect().width })).filter((x) => x.w > 0 && x.w < 60 && x.t.length <= 3));
console.log('AVATAR BUTTONS:', JSON.stringify(avatars));
for (const a of avatars.slice(0, 4)) {
  const loc = page.locator('header button, nav button').nth(a.i);
  await loc.click().catch(() => {});
  await page.waitForTimeout(1200);
  await snap(`04-participant-${a.i}`);
  // go back to home
  await page.goto(URL_BASE + '/cabinet', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

out.__errors = [...new Set(errors)];
fs.writeFileSync(path.join(here, 'probe-student.json'), JSON.stringify(out, null, 2));
await browser.close();
