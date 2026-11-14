import { ensureFirestore } from './firestore-admin';
import { test, expect } from '@playwright/test';

// This scenario needs Vite's fixture route or the app's live source-store modules.
test.use({ baseURL: 'http://127.0.0.1:5174' });
import { loadRuntimeConfig, signInAccount, watchBrowserFailures } from './fixtures';
import { waitForCabinetReady } from './cabinet-readiness';
import { DEFAULT_SKILL_CONFIG, getSkillItemTitle } from '../src/domain/achievements';

function emulatorDb() {
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
  return ensureFirestore();
}

test('Next Step preserves participant pin persistence, development, XP and four visual variants', async ({
  page,
}, info) => {
  // Several full authenticated hydrations plus four viewport/theme captures.
  // Keep the per-assertion readiness timeout unchanged.
  test.setTimeout(120_000);
  const r = loadRuntimeConfig();
  const db = emulatorDb();
  const profile = db.doc(`users/${r.studentUid}`);
  const a = r.studentParticipantId;
  const b = r.studentChildParticipantId;
  await profile.update({
    participantTodayChecklists: {
      [a]: {
        todaySkillItemIds: [],
        customTodayTasks: [],
        completedTodayTaskIds: [],
        dismissedTodayTaskIds: [],
      },
      [b]: {
        todaySkillItemIds: ['l1_1'],
        customTodayTasks: [],
        completedTodayTaskIds: [],
        dismissedTodayTaskIds: [],
      },
    },
  });
  const progressBefore = await Promise.all(
    [a, b].map(async (id) => (await db.doc(`participant_progress/${id}`).get()).data())
  );
  const healthy = watchBrowserFailures(page);
  // Playwright routing disables HTTP caching for every request, including the
  // hundreds of Vite modules needed again on reload. Block only remote fonts
  // through Chromium so module caching remains available across documents.
  const network = await page.context().newCDPSession(page);
  await network.send('Network.enable');
  await network.send('Network.setBlockedURLs', {
    urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'],
  });
  let participantRead!: Promise<import('@playwright/test').Response>;
  await signInAccount(
    page,
    { email: r.studentEmail, password: r.studentPassword, expectedPath: '/cabinet' },
    () => {
      // Register before submitting so a fast authenticated response cannot race us.
      participantRead = page.waitForResponse(
        (response) =>
          response.url().endsWith('/queryManagedParticipantPickerReadModels') &&
          response.request().method() === 'POST'
      );
    }
  );
  expect((await participantRead).ok()).toBe(true);
  await waitForCabinetReady(page, a);
  const header = page
    .getByRole('banner')
    .locator('[data-testid="navbar-participant-switcher"]:visible');
  await expect(header.locator(`[data-participant-id="${a}"]`)).toBeVisible();
  await expect(header.locator(`[data-participant-id="${b}"]`)).toBeVisible();
  await expect(header.locator(`[data-participant-id="${a}"]`)).toHaveAttribute('aria-pressed', 'true');
  const tile = page.locator('[data-dashboard-tile="nextStep"]');
  const title = tile.getByRole('heading', { level: 3 });
  await expect(title).toHaveText('Maintain basic stance in motion for 100 m');
  const firstSkill = DEFAULT_SKILL_CONFIG.items.find((item) => item.id === 'l1_1')!;
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(title).toHaveText(getSkillItemTitle(firstSkill, 'ru'));
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(title).toHaveText('Maintain basic stance in motion for 100 m');
  await expect(tile.locator('[data-participant-scope]')).toContainText(r.studentDisplayName);
  await expect(tile).toContainText('Potential gain after instructor assessment');
  await expect(tile).not.toContainText(/video|15 min/);
  await header.locator(`[data-participant-id="${b}"]`).click();
  await expect(title).toHaveText('Slide 20 m on a steep slope using side-slipping');
  await expect(tile.locator('[data-participant-scope]')).toContainText(r.studentChildDisplayName);
  await header.locator(`[data-participant-id="${a}"]`).click();
  await expect(title).toHaveText('Maintain basic stance in motion for 100 m');
  const pin = tile.getByRole('button', { name: 'Add to tasks', exact: true });
  await pin.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await profile.get()).data()?.participantTodayChecklists[a].todaySkillItemIds)
    .toEqual(['l1_1']);
  await expect(page.locator('[data-dashboard-tile="todayTasks"]')).toContainText(
    'Maintain basic stance in motion for 100 m'
  );
  await expect(title).toHaveText('Slide 20 m on a steep slope using side-slipping');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCabinetReady(page, a);
  await expect(header.locator(`[data-participant-id="${a}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(tile.locator('[data-participant-scope]')).toContainText(r.studentDisplayName);
  await expect(page.locator('[data-dashboard-tile="todayTasks"]')).toContainText(
    'Maintain basic stance in motion for 100 m'
  );
  await expect(title).toHaveText('Slide 20 m on a steep slope using side-slipping');
  expect((await profile.get()).data()?.participantTodayChecklists[a].todaySkillItemIds).toEqual([
    'l1_1',
  ]);
  expect((await profile.get()).data()?.participantTodayChecklists[b].todaySkillItemIds).toEqual([
    'l1_1',
  ]);
  const developmentLink = tile.getByRole('link', { name: 'Go to Development', exact: true });
  const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  await developmentLink.click();
  await expect(page).toHaveURL(/\/cabinet\/development$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTimeOrigin);
  await expect(
    page.getByRole('button', { name: 'Add to Today', exact: true }).first()
  ).toBeVisible();
  await page.getByRole('banner').locator('a[href="/cabinet"]').click();
  await expect(page).toHaveURL(/\/cabinet$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTimeOrigin);
  await expect(title).toHaveText('Slide 20 m on a steep slope using side-slipping');
  // Recreate the global warning captured in CI, independent of suite order.
  // This is ephemeral UI state; no Firestore data or recommendation is changed.
  await page.evaluate(async () => {
    const moduleUrl = '/src/features/shell/uiStore.ts';
    const { useUiStore } = await import(moduleUrl);
    useUiStore
      .getState()
      .setDbStatusWarning(
        'Database sync restricted. Using active sandboxed state. (Operation: get, Path: bookings/booking_c5ed88af8ff44d6baa9e46c511d61844/messages)'
      );
  });
  await expect(page.getByText('Database sync restricted.', { exact: false })).toBeVisible();
  for (const [name, width, height, dark] of [
    ['desktop-light', 1440, 1000, false],
    ['mobile-light', 390, 844, false],
    ['desktop-dark', 1440, 1000, true],
    ['mobile-dark', 390, 844, true],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, dark);
    await tile.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -100));
    const dimensions = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    await info.attach(name + '-dimensions.json', {
      body: JSON.stringify(dimensions),
      contentType: 'application/json',
    });
    expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(
      await tile.locator('[data-dashboard-title]').evaluate((el) => getComputedStyle(el).fontSize)
    ).toBe('18px');
    expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('DM Sans');
    expect(await title.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
    for (const button of await tile.getByRole('button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
    }
    const warning = page.getByText('Database sync restricted.', { exact: false });
    expect(await warning.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await warning
      .locator('..')
      .locator('..')
      .screenshot({
        path: info.outputPath(`${name}-warning.png`),
      });
    await tile.screenshot({ path: info.outputPath(`${name}.png`) });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const allLevelOneIds = DEFAULT_SKILL_CONFIG.items
    .filter((item) => item.levelTarget === 1)
    .map((item) => item.id);
  await profile.update({ [`participantTodayChecklists.${a}.todaySkillItemIds`]: allLevelOneIds });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCabinetReady(page, a);
  await expect(tile).toContainText('No new exercises');
  await expect(tile.getByRole('button', { name: 'Add to tasks' })).toHaveCount(0);
  const progressAfter = await Promise.all(
    [a, b].map(async (id) => (await db.doc(`participant_progress/${id}`).get()).data())
  );
  expect(progressAfter).toEqual(progressBefore);
  healthy();
});
