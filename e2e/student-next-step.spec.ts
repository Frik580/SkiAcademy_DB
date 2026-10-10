import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { loadRuntimeConfig, signInStudent, watchBrowserFailures } from './fixtures';
import { DEFAULT_SKILL_CONFIG } from '../src/domain/achievements';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
function emulatorDb() {
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  return requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
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
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  const participantRead = page.waitForResponse(
    (response) =>
      response.url().endsWith('/queryManagedParticipantPickerReadModels') &&
      response.request().method() === 'POST'
  );
  await signInStudent(page, r);
  expect((await participantRead).ok()).toBe(true);
  const header = page
    .getByRole('banner')
    .locator('[data-testid="navbar-participant-switcher"]:visible');
  await expect(header.locator(`[data-participant-id="${a}"]`)).toBeVisible();
  const tile = page.locator('[data-dashboard-tile="nextStep"]');
  const title = tile.getByRole('heading', { level: 3 });
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
  await expect(title).toHaveText('Slide 20 m on a steep slope using side-slipping');
  expect((await profile.get()).data()?.participantTodayChecklists[a].todaySkillItemIds).toEqual([
    'l1_1',
  ]);
  expect((await profile.get()).data()?.participantTodayChecklists[b].todaySkillItemIds).toEqual([
    'l1_1',
  ]);
  await tile.getByRole('button', { name: 'Explore development', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add to Today', exact: true }).first()
  ).toBeVisible();
  await page.goto('/cabinet', { waitUntil: 'domcontentloaded' });
  await expect(title).toHaveText('Slide 20 m on a steep slope using side-slipping');
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
    expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(
      await tile.locator('[data-dashboard-title]').evaluate((el) => getComputedStyle(el).fontSize)
    ).toBe('11px');
    expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('DM Sans');
    await tile.screenshot({ path: info.outputPath(`${name}.png`) });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const allLevelOneIds = DEFAULT_SKILL_CONFIG.items
    .filter((item) => item.levelTarget === 1)
    .map((item) => item.id);
  await profile.update({ [`participantTodayChecklists.${a}.todaySkillItemIds`]: allLevelOneIds });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(tile).toContainText('No new exercises');
  await expect(tile.getByRole('button', { name: 'Add to tasks' })).toHaveCount(0);
  const progressAfter = await Promise.all(
    [a, b].map(async (id) => (await db.doc(`participant_progress/${id}`).get()).data())
  );
  expect(progressAfter).toEqual(progressBefore);
  healthy();
});
