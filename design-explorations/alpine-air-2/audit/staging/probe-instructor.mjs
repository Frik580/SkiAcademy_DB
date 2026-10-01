/**
 * Focused probe: instructor workspace + account switcher menu.
 * Credentials come from env vars only. Read-only.
 * Usage: node probe-instructor.mjs [waitMs]
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
const WAIT = Number(process.argv[2] || 15000);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));

const out = {};
const grab = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  return {
    url: location.href,
    body: t(document.body).slice(0, 3000),
    buttons: [...document.querySelectorAll('button,[role="button"]')].filter(vis).map(t).filter(Boolean),
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => t(h)),
    skeleton: document.querySelectorAll('.animate-pulse,[class*="skeleton"],[class*="shimmer" i]').length,
  };
};

async function snap(n) {
  await page.screenshot({ path: path.join(shotDir, `probe-inst-${n}.png`), fullPage: true });
  out[n] = await page.evaluate(grab);
  console.log(`--- ${n} --- skeleton=${out[n].skeleton} buttons=${out[n].buttons.length}`);
  console.log(out[n].body.slice(0, 700));
}

await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
let opened = false;
for (const t of ['Sign In', 'Войти']) {
  const loc = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
  if (await loc.count()) { await loc.click().catch(() => {}); opened = true; break; }
}
if (!opened) throw new Error('no sign-in trigger found');
await page.waitForTimeout(1500);
const inputs = page.locator('input');
await inputs.nth(0).fill(EMAIL);
await inputs.nth(1).fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);

await page.goto(URL_BASE + '/instructor', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(WAIT);
await snap('01-after-wait');

// account / workspace switcher in the top bar
for (const label of ['Instructor Workspace', 'Workspace', 'Account', 'Профиль', 'Кабинет']) {
  const loc = page.locator(`button:has-text("${label}"), [role="button"]:has-text("${label}")`).first();
  if (await loc.count()) {
    await loc.click().catch(() => {});
    await page.waitForTimeout(1200);
    await snap(`02-menu-${label.replace(/\s/g, '_')}`);
    await page.keyboard.press('Escape');
    break;
  }
}

// admin surface reachable from the same account?
await page.goto(URL_BASE + '/admin?tab=operations', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(WAIT);
await snap('03-admin-operations');

out.__consoleErrors = [...new Set(errors)].slice(0, 25);
console.log('CONSOLE ERRORS:', JSON.stringify(out.__consoleErrors.slice(0, 10), null, 1));
fs.writeFileSync(path.join(here, 'probe-instructor.json'), JSON.stringify(out, null, 2));
await browser.close();
