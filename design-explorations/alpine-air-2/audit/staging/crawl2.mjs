/**
 * Staging audit crawler v2 (read-only). Credentials come from env vars only.
 *   CA_URL, CA_EMAIL, CA_PASSWORD
 * Usage: node crawl2.mjs <guest|student|instructor|admin>
 * Runs the app in English so selectors are stable, and dumps every route/screen inventory.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const URL_BASE = (process.env.CA_URL || 'https://ski-school-staging.web.app/').replace(/\/$/, '');
const EMAIL = process.env.CA_EMAIL || '';
const PASSWORD = process.env.CA_PASSWORD || '';
const mode = process.argv[2] || 'guest';
const VIEW = (process.argv[3] || 'desktop').toLowerCase();
const VW = VIEW === 'mobile' ? { width: 390, height: 844 } : VIEW === 'narrow' ? { width: 360, height: 780 } : VIEW === 'tablet' ? { width: 1024, height: 820 } : { width: 1440, height: 900 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VW, isMobile: VIEW !== 'desktop' && VIEW !== 'tablet', hasTouch: VIEW !== 'desktop' });
const page = await ctx.newPage();
const dump = {};
let shotIdx = 0;

const GRAB = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  return {
    url: location.href,
    headings: [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((h) => `${h.tagName}|${txt(h)}`),
    buttons: [...document.querySelectorAll('button,[role="button"]')].filter(vis).map(txt).filter(Boolean),
    links: [...document.querySelectorAll('a[href]')].filter(vis).map((a) => `${txt(a)}=>${a.getAttribute('href')}`),
    inputs: [...document.querySelectorAll('input,select,textarea')].filter(vis).map((i) => `${i.tagName}[${i.type || ''}]${i.name ? '#' + i.name : ''}:${i.getAttribute('aria-label') || i.placeholder || ''}`),
    tabs: [...document.querySelectorAll('[role="tab"],[aria-selected],button[aria-controls]')].filter(vis).map(txt).filter(Boolean),
    dialogs: [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog')].filter(vis).map(txt),
    tables: [...document.querySelectorAll('table')].filter(vis).map((t) => `${[...t.querySelectorAll('thead th')].map(txt).join(' | ')} [rows=${t.querySelectorAll('tbody tr').length}]`),
    counts: { btn: document.querySelectorAll('button').length, a: document.querySelectorAll('a[href]').length, input: document.querySelectorAll('input').length, table: document.querySelectorAll('table').length, row: document.querySelectorAll('tbody tr').length },
  };
};

async function snap(name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 700);
  const f = `${mode}-${VIEW}-${String(++shotIdx).padStart(2, '0')}-${name}`;
  await page.screenshot({ path: path.join(shotDir, `${f}.png`), fullPage: opts.full !== false });
  dump[f] = await page.evaluate(GRAB);
  console.log(`${f} | btn=${dump[f].counts.btn} input=${dump[f].counts.input} table=${dump[f].counts.table} rows=${dump[f].counts.row}`);
  return dump[f];
}

async function clickText(text, { nth = 0, timeout = 2500, wait = 700 } = {}) {
  const loc = page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="tab"]:has-text("${text}"), [role="button"]:has-text("${text}")`).nth(nth);
  try {
    await loc.waitFor({ state: 'visible', timeout });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ timeout });
    await page.waitForTimeout(wait);
    return true;
  } catch { return false; }
}

async function goto(p) {
  await page.goto(URL_BASE + p, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
}

async function setLang(code) {
  // the language control is a plain button; clicking it cycles/switches
  for (let i = 0; i < 3; i++) {
    const cur = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^(RU|KZ|EN)$/.test((x.innerText || '').trim()));
      return b ? b.innerText.trim() : null;
    });
    if (cur === code) return cur;
    const loc = page.locator('button').filter({ hasText: /^(RU|KZ|EN)$/ }).first();
    if (!(await loc.count())) return null;
    await loc.click().catch(() => {});
    await page.waitForTimeout(900);
  }
  return null;
}

async function login() {
  await goto('/');
  await setLang('EN');
  if (!(await clickText('Sign In', { wait: 1200 }))) await clickText('Войти', { wait: 1200 });
  // robust field discovery: password field first, then the first other visible input
  const info = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && i.type !== 'hidden' && i.type !== 'checkbox';
    });
    return inputs.map((i, idx) => ({ idx, type: i.type, name: i.name, id: i.id, ph: i.placeholder }));
  });
  console.log('LOGIN FIELDS:', JSON.stringify(info));
  const pwIdx = info.findIndex((f) => f.type === 'password');
  const userIdx = info.findIndex((f) => f.type !== 'password');
  if (pwIdx < 0 || userIdx < 0) throw new Error('login fields not found: ' + JSON.stringify(info));
  const all = page.locator('input');
  await all.nth(userIdx).fill(EMAIL);
  await all.nth(pwIdx).fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(8000);
  console.log('login ->', page.url());
}

async function closeOverlay() {
  // try explicit close affordances first
  for (const sel of [
    'button[aria-label*="Close" i]',
    'button[aria-label*="close" i]',
    'button[aria-label*="Закрыть"]',
    '[role="dialog"] button[aria-label]',
    '[role="dialog"] .close',
  ]) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(500);
      if ((await page.locator('[role="dialog"],[aria-modal="true"],dialog').count()) === 0) return true;
    }
  }
  // otherwise click the backdrop far from the dialog
  await page.mouse.click(20, 20);
  await page.waitForTimeout(400);
  if ((await page.locator('[role="dialog"],[aria-modal="true"],dialog').count()) === 0) return true;
  // last resort: reload
  await goto('/');
  return false;
}

try {
  if (mode === 'guest') {
    await goto('/');
    await setLang('EN');
    await snap('home');
    const d0 = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean));
    console.log('BUTTONS:', JSON.stringify(d0));

    if (await clickText('Sign In', { wait: 1200 })) await snap('auth', { full: false });
    for (const t of ['Register', 'Sign Up', 'Forgot', 'Reset', 'Recovery']) {
      if (await clickText(t, { wait: 400 })) await snap(`auth-${t.replace(/\s/g, '_')}`, { full: false, wait: 400 });
    }
    await closeOverlay();

    for (const t of ['Start Your Journey', 'Choose Course', 'Enroll', 'Details', 'Book Lesson']) {
      if (await clickText(t, { wait: 800 })) await snap(`cta-${t.replace(/\s/g, '_')}`, { full: false, wait: 600 });
      await closeOverlay();
    }

    for (const t of ['Carving', 'Mastery', 'Expert', 'Beginner', 'Group', 'Guides']) {
      if (await clickText(t, { wait: 500 })) await snap(`tab-${t}`, { full: false, wait: 500 });
    }
  }

  if (mode === 'student' || mode === 'instructor' || mode === 'admin') {
    await login();
    await snap('after-login');

    if (mode === 'student') {
      await goto('/cabinet');
      await snap('cabinet-home');
      const tabs = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('[role="tab"],nav button,aside button')].map((b) => (b.innerText || '').trim()).filter(Boolean))]
      );
      console.log('STUDENT TABS:', JSON.stringify(tabs));
      for (const t of tabs) {
        if (await clickText(t, { wait: 1400 })) {
          await snap(`cab-${t.replace(/\s+/g, '_')}`);
          const btns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean));
          console.log(`  buttons[${t}]:`, JSON.stringify(btns));
        }
      }
      for (const slug of ['lessons', 'progress', 'skills', 'wallet', 'achievements', 'participants', 'profile']) {
        await goto(`/cabinet/${slug}`);
        const d = await snap(`slug-${slug}`);
        if (d.counts.btn > 20) console.log(`  slug ${slug}: ${JSON.stringify(d.buttons)}`);
      }
    }

    if (mode === 'instructor') {
      await goto('/instructor');
      await snap('instructor-home');
      const tabs = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('[role="tab"],nav button,aside button')].map((b) => (b.innerText || '').trim()).filter(Boolean))]
      );
      console.log('INSTRUCTOR TABS:', JSON.stringify(tabs));
      for (const t of tabs) {
        if (await clickText(t, { wait: 1400 })) {
          await snap(`inst-${t.replace(/\s+/g, '_')}`);
          const btns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean));
          console.log(`  buttons[${t}]:`, JSON.stringify(btns));
        }
      }
    }

    if (mode === 'admin') {
      for (const tab of ['operations', 'finance', 'people', 'product', 'system']) {
        await goto(`/admin?tab=${tab}`);
        const d = await snap(`admin-${tab}`);
        console.log(`ADMIN[${tab}] tables=${JSON.stringify(d.tables)}`);
        const secs = await page.evaluate(() =>
          [...document.querySelectorAll('button,summary,[class*="collapse" i],[id]')]
            .map((e) => (e.innerText || '').trim().split('\n')[0])
            .filter((t) => t && t.length < 60).slice(0, 60)
        );
        console.log(`ADMIN[${tab}] controls=${JSON.stringify([...new Set(secs)])}`);
      }
    }
  }
} catch (e) {
  console.log('ERROR:', e.message);
  dump.__error = e.message;
} finally {
  fs.writeFileSync(path.join(here, `crawl2-${mode}-${VIEW}.json`), JSON.stringify(dump, null, 2));
  await browser.close();
}
