import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { loadRuntimeConfig, signInStudent, watchBrowserFailures } from './fixtures';

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

test('Today Tasks preserves participant persistence, pinning, keyboard and four visual variants', async ({
  page,
}, info) => {
  const r = loadRuntimeConfig();
  const db = emulatorDb();
  const profile = db.doc(`users/${r.studentUid}`);
  const a = r.studentParticipantId;
  const b = r.studentChildParticipantId;
  const date = new Date().toISOString().split('T')[0];
  await profile.update({
    participantTodayChecklists: {
      [a]: {
        customTodayTasks: [
          { id: 'a', text: 'Check bindings before training' },
          {
            id: 'long',
            text: 'Pack gloves and a warm extra layer before leaving for the mountain and check the weather forecast',
          },
        ],
        todaySkillItemIds: ['l1_1'],
        completedTodayTaskIds: ['custom:a'],
        completedTodayDate: date,
        dismissedTodayTaskIds: [],
      },
      [b]: {
        customTodayTasks: [{ id: 'b', text: 'Bob reminder' }],
        todaySkillItemIds: [],
        completedTodayTaskIds: [],
        completedTodayDate: date,
        dismissedTodayTaskIds: [],
      },
    },
  });
  const progressBefore = await db.doc(`participant_progress/${a}`).get();
  const healthy = watchBrowserFailures(page);
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  const participantRead = page.waitForResponse(
    (response) =>
      response.url().endsWith('/queryManagedParticipantPickerReadModels') &&
      response.request().method() === 'POST'
  );
  await signInStudent(page, r);
  expect((await participantRead).ok()).toBe(true);
  // Sign-in routes to Cabinet; wait for participant hydration before using scoped tasks.
  const header = page
    .getByRole('banner')
    .locator('[data-testid="navbar-participant-switcher"]:visible');
  await expect(header.locator(`[data-participant-id="${a}"]`)).toBeVisible();
  const tile = page.locator('[data-dashboard-tile="todayTasks"]');
  const input = tile.getByRole('textbox', { name: 'New reminder' });
  const first = tile.getByRole('checkbox', { name: 'Check bindings before training' });
  await expect(first).toBeChecked();
  await expect(tile.locator('.sc-today-tasks-actions [data-participant-scope]')).toContainText(
    r.studentDisplayName
  );
  await expect(tile).not.toContainText('of 3 completed');
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).not.toBeChecked();
  await expect
    .poll(
      async () => (await profile.get()).data()?.participantTodayChecklists[a].completedTodayTaskIds
    )
    .toEqual([]);
  await first.check();
  await expect
    .poll(
      async () => (await profile.get()).data()?.participantTodayChecklists[a].completedTodayTaskIds
    )
    .toEqual(['custom:a']);
  await tile.getByRole('button', { name: 'New reminder', exact: true }).click();
  await expect(input).toBeFocused();
  await input.fill('   ');
  await expect(tile.getByRole('button', { name: 'Add to Today', exact: true })).toBeDisabled();
  await input.fill('Bring water');
  await input.press('Enter');
  await expect(tile.getByRole('checkbox', { name: 'Bring water' })).toBeVisible();
  await expect
    .poll(async () =>
      (await profile.get())
        .data()
        ?.participantTodayChecklists[a].customTodayTasks.map((task: { text: string }) => task.text)
    )
    .toContain('Bring water');
  await page.reload();
  await expect(first).toBeChecked();
  await expect(tile.getByRole('checkbox', { name: 'Bring water' })).toBeVisible();
  await expect(header).toBeVisible();
  await input.fill('Alice draft');
  await header.locator(`[data-participant-id="${b}"]`).click();
  await expect(tile.getByRole('checkbox', { name: 'Bob reminder' })).toBeVisible();
  await expect(first).toHaveCount(0);
  await expect(input).toHaveValue('');
  await tile.getByRole('checkbox', { name: 'Bob reminder' }).check();
  await expect
    .poll(
      async () => (await profile.get()).data()?.participantTodayChecklists[b].completedTodayTaskIds
    )
    .toEqual(['custom:b']);
  await header.locator(`[data-participant-id="${a}"]`).click();
  await expect(first).toBeChecked();
  await expect(tile.getByRole('checkbox', { name: 'Bob reminder' })).toHaveCount(0);
  expect((await db.doc(`participant_progress/${a}`).get()).data()).toEqual(progressBefore.data());
  await expect(tile).not.toContainText('XP');
  // Actual exercise pin rendered from the existing participant checklist; removal persists.
  const pinned = tile
    .locator('[data-task-row]')
    .filter({ has: page.getByRole('checkbox') })
    .filter({ hasNotText: /Check bindings|Pack gloves|Bring water/ });
  await expect(pinned).toHaveCount(1);
  await pinned.getByRole('button', { name: 'Remove task' }).click();
  await expect
    .poll(async () => (await profile.get()).data()?.participantTodayChecklists[a].todaySkillItemIds)
    .toEqual([]);
  await tile.getByRole('button', { name: /Development/ }).click();
  await page.getByRole('button', { name: 'Add to Today', exact: true }).first().click();
  await expect
    .poll(
      async () =>
        (await profile.get()).data()?.participantTodayChecklists[a].todaySkillItemIds.length
    )
    .toBe(1);
  await page.goto('/cabinet');
  await expect(pinned).toHaveCount(1);
  await pinned.getByRole('button', { name: 'Remove task' }).click();
  await expect
    .poll(async () => (await profile.get()).data()?.participantTodayChecklists[a].todaySkillItemIds)
    .toEqual([]);
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
    await tile.screenshot({ path: info.outputPath(`${name}.png`) });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(input).toBeVisible();
  expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (const label of [
    'Bring water',
    'Pack gloves and a warm extra layer before leaving for the mountain and check the weather forecast',
    'Check bindings before training',
  ]) {
    await tile
      .locator('[data-task-row]')
      .filter({ has: page.getByRole('checkbox', { name: label }) })
      .getByRole('button', { name: 'Remove task' })
      .click();
    await expect(tile.getByRole('checkbox', { name: label })).toHaveCount(0);
  }
  await expect
    .poll(async () => (await profile.get()).data()?.participantTodayChecklists[a].customTodayTasks)
    .toEqual([]);
  await page.reload();
  await expect(tile).toContainText('No tasks for today yet.');
  await expect(input).toBeVisible();
  expect((await profile.get()).data()?.participantTodayChecklists[b].completedTodayTaskIds).toEqual(
    ['custom:b']
  );
  healthy();
});
