/**
 * Staging audit helper (read-only).
 * Credentials are read from environment variables only — never stored in this file.
 *
 *   CA_EMAIL / CA_PASSWORD / CA_URL  -> set in the shell that runs this script
 *
 * Usage: node audit.mjs <mode>       mode = guest | student | instructor | admin | probe
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const URL_BASE = process.env.CA_URL || 'https://ski-school-staging.web.app/';
const EMAIL = process.env.CA_EMAIL || '';
const PASSWORD = process.env.CA_PASSWORD || '';

const mode = process.argv[2] || 'probe';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const dump = {};

async function snap(name) {
  await page.waitForTimeout(1500);
  const file = path.join(shotDir, `${mode}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const data = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    return {
      url: location.href,
      title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => `${h.tagName}: ${txt(h)}`),
      nav: [...document.querySelectorAll('nav a, header a')].filter(vis).map((a) => `${txt(a)} -> ${a.getAttribute('href')}`),
      actions: [...document.querySelectorAll('button, [role="button"], a[href="#"], summary')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label') || b.title).filter(Boolean),
      inputs: [...document.querySelectorAll('input, select, textarea')].filter(vis).map((i) => `${i.tagName}[${i.type || ''}] name=${i.name || i.id || ''} label=${i.getAttribute('aria-label') || i.placeholder || ''}`),
      tabs: [...document.querySelectorAll('[role="tab"], [data-tab], nav a[aria-current]')].filter(vis).map((t) => txt(t)),
      dialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(vis).map((d) => txt(d).slice(0, 300)),
      counts: {
        buttons: document.querySelectorAll('button').length,
        links: document.querySelectorAll('a').length,
        inputs: document.querySelectorAll('input').length,
      },
    };
  });
  dump[name] = data;
  console.log(`[${mode}] ${name} :: ${data.url} :: ${data.counts.buttons} btn / ${data.counts.links} a / ${data.counts.inputs} input`);
  return data;
}

async function login() {
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // open any "Войти / Sign in" trigger
  const triggers = page.locator('button:has-text("Войти"), button:has-text("Sign in"), button:has-text("Вхід"), a:has-text("Войти")');
  const n = await triggers.count();
  for (let i = 0; i < n; i++) {
    try {
      await triggers.nth(i).first().click({ timeout: 2500 });
      await page.waitForTimeout(1200);
      break;
    } catch { /* try next */ }
  }
  const email = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const pass = page.locator('input[type="password"]').first();
  await email.waitFor({ timeout: 8000 });
  await email.fill(EMAIL);
  await pass.fill(PASSWORD);
  const submit = page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Sign in"), button:has-text("Увійти")').first();
  await submit.click();
  await page.waitForTimeout(6000);
  return page.url();
}

try {
  if (mode === 'guest' || mode === 'probe') {
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await snap('home');
    // scroll to capture the rest of the public page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await snap('home-bottom');
  }

  if (mode !== 'guest' && mode !== 'probe') {
    const url = await login();
    console.log('after login url =', url);
    await snap('after-login');
  }
} catch (e) {
  console.log('ERROR:', e.message);
  dump.__error = e.message;
} finally {
  fs.writeFileSync(path.join(here, `dump-${mode}.json`), JSON.stringify(dump, null, 2));
  await browser.close();
}
