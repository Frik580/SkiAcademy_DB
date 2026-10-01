/**
 * Staging audit crawler (read-only). Credentials come from env vars only.
 *   CA_URL, CA_EMAIL, CA_PASSWORD
 * Usage: node crawl.mjs <guest|student|instructor|admin>
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
const mode = process.argv[2] || 'guest';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const dump = {};

const GRAB = () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  return {
    url: location.href,
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => `${h.tagName}|${txt(h)}`),
    buttons: [...document.querySelectorAll('button')].filter(vis).map(txt).filter(Boolean),
    links: [...document.querySelectorAll('a[href]')].filter(vis).map((a) => `${txt(a)}=>${a.getAttribute('href')}`),
    inputs: [...document.querySelectorAll('input,select,textarea')].filter(vis).map((i) => `${i.tagName}[${i.type || ''}]${i.name || i.id ? '#' + (i.name || i.id) : ''}:${i.getAttribute('aria-label') || i.placeholder || ''}`),
    tabs: [...document.querySelectorAll('[role="tab"],[data-tab],button[aria-selected],a[aria-current]')].filter(vis).map(txt).filter(Boolean),
    dialogs: [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog')].filter(vis).map((d) => txt(d)),
    selects: [...document.querySelectorAll('select')].filter(vis).map((s) => s.options ? [...s.options].map((o) => o.text).join('|') : ''),
    tables: [...document.querySelectorAll('table')].filter(vis).map((t) => {
      const head = [...t.querySelectorAll('thead th')].map((h) => txt(h)).join(' | ');
      const rows = t.querySelectorAll('tbody tr').length;
      return `${head} [rows=${rows}]`;
    }),
    counts: {
      btn: document.querySelectorAll('button').length,
      a: document.querySelectorAll('a[href]').length,
      input: document.querySelectorAll('input').length,
      table: document.querySelectorAll('table').length,
      rows: document.querySelectorAll('tbody tr').length,
    },
  };
};

async function snap(name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 1400);
  const file = path.join(shotDir, `${mode}-${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.full !== false });
  dump[name] = await page.evaluate(GRAB);
  const d = dump[name];
  console.log(`${name}: ${d.url} | btn=${d.counts.btn} a=${d.counts.a} input=${d.counts.input} table=${d.counts.table} rows=${d.counts.rows}`);
  return d;
}

async function clickText(text, { nth = 0, timeout = 4000, wait = 1200 } = {}) {
  const loc = page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="tab"]:has-text("${text}"), [role="button"]:has-text("${text}")`).nth(nth);
  try {
    await loc.waitFor({ state: 'visible', timeout });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ timeout });
    await page.waitForTimeout(wait);
    return true;
  } catch {
    return false;
  }
}

async function goto(p) {
  await page.goto(URL_BASE.replace(/\/$/, '') + p, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
}

async function login() {
  await goto('/');
  await clickText('Войти', { wait: 1500 });
  const email = page.locator('input[type="email"],input[name="email"],input[autocomplete="email"]').first();
  const pass = page.locator('input[type="password"]').first();
  await email.waitFor({ timeout: 10000 });
  await email.fill(EMAIL);
  await pass.fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(7000);
  console.log('login ->', page.url());
}

async function logout() {
  await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => /auth|firebase|session|token/i.test(k));
    sessionStorage.clear();
    for (const k of keys) localStorage.removeItem(k);
  });
  await page.context().clearCookies();
  await goto('/');
}

try {
  if (mode === 'guest') {
    await goto('/');
    await snap('01-home');

    // language menu
    await clickText('RU', { wait: 900 });
    await snap('02-language-menu', { full: false });
    await page.keyboard.press('Escape');
    await page.mouse.click(1200, 600);

    // auth dialog
    await clickText('Войти', { wait: 1600 });
    await snap('03-auth-dialog', { full: false });
    for (const t of ['Регистрация', 'Register', 'Забыли пароль', 'Восстановить', 'Reset']) {
      if (await clickText(t, { wait: 900 })) {
        await snap(`03-auth-${t.replace(/\s/g, '_')}`, { full: false });
      }
    }
    await page.keyboard.press('Escape');
    await page.mouse.click(1300, 700);
    await page.waitForTimeout(800);

    // CTA: записаться (course)
    if (await clickText('Записаться', { wait: 1800 })) await snap('04-course-booking-dialog', { full: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // CTA: подробнее
    if (await clickText('Подробнее', { wait: 1600 })) await snap('05-course-details', { full: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // CTA: забронировать (guide)
    if (await clickText('Забронировать', { wait: 1800 })) await snap('06-guide-booking', { full: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // course level tabs + carousel
    for (const t of ['КАРВИНГ', 'МАСТЕРСТВО', 'ЭКСПЕРТ']) {
      if (await clickText(t, { wait: 1000 })) await snap(`07-tab-${t}`, { full: false });
    }
    if (await clickText('Начать свой путь', { wait: 1600 })) await snap('08-start-path', { full: false });
    await page.keyboard.press('Escape');
    if (await clickText('Подобрать курс', { wait: 1600 })) await snap('09-pick-course', { full: false });
    await page.keyboard.press('Escape');

    // theme
    const theme = page.locator('button[aria-label*="тему"], button[title*="тему"], button[aria-label*="theme"]').first();
    if (await theme.count()) {
      await theme.click().catch(() => {});
      await snap('10-theme-toggled');
      await theme.click().catch(() => {});
    }
  }

  if (mode === 'student' || mode === 'instructor' || mode === 'admin') {
    await login();
    await snap('01-after-login');

    if (mode === 'student') {
      await goto('/cabinet');
      await snap('02-cabinet');
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/cabinet"], nav a, aside a')].map((a) => a.getAttribute('href')).filter(Boolean)
      );
      console.log('cabinet links:', JSON.stringify([...new Set(links)]));
      for (const href of [...new Set(links)].filter((h) => h.includes('/cabinet'))) {
        const slug = href.replace('/cabinet', '').replace(/^\//, '') || 'root';
        await goto(href);
        await snap(`03-cab-${slug}`);
      }
    }

    if (mode === 'instructor') {
      await goto('/instructor');
      await snap('02-instructor');
      const hrefs = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href],button[role="tab"],[role="tab"]')].map((e) => e.getAttribute('href') || (e.innerText || '').trim()).filter(Boolean))]
      );
      console.log('instructor nav:', JSON.stringify(hrefs.slice(0, 60)));
      for (const href of hrefs.filter((h) => typeof h === 'string' && h.startsWith('/'))) {
        const slug = href.replace(/^\//, '').replace(/[/?=&]/g, '_');
        await goto(href);
        await snap(`03-inst-${slug}`);
      }
    }

    if (mode === 'admin') {
      for (const tab of ['operations', 'finance', 'people', 'product', 'system']) {
        await goto(`/admin?tab=${tab}`);
        await snap(`02-admin-${tab}`);
      }
      // open collapsible sections
      await goto('/admin?tab=operations');
      const secs = await page.evaluate(() =>
        [...document.querySelectorAll('[id^="admin_"],[id^="canonical_"]')].map((e) => e.id).filter(Boolean)
      );
      console.log('admin section ids:', JSON.stringify(secs));
    }
  }
} catch (e) {
  console.log('ERROR:', e.message);
  dump.__error = e.message;
} finally {
  fs.writeFileSync(path.join(here, `crawl-${mode}.json`), JSON.stringify(dump, null, 2));
  await browser.close();
}
