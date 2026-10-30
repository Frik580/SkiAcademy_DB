import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { DEFAULT_SKILL_CONFIG } from '../src/domain/achievements';
import { loadRuntimeConfig, signInStudent, watchBrowserFailures } from './fixtures';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const requireRoot = createRequire(`${process.cwd()}/package.json`);
const {
  ParticipantProgressSchema,
  ParticipantAchievementsSchema,
  participantProgressDayKey,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test('Today achievements isolates canonical participant fixtures and renders four variants', async ({
  page,
}, info) => {
  test.setTimeout(360_000);
  // Direct seed is confined to disposable demo emulators; schemas validate all fixtures.
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  const db = requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
  const runtime = loadRuntimeConfig();
  const now = new Date('2026-10-06T07:00:00Z');
  const stamp = timestampFromDate(now);
  const skills = DEFAULT_SKILL_CONFIG.items.filter((item) => item.maxPoints >= 20).slice(0, 2);
  const ids = [runtime.studentParticipantId, runtime.studentChildParticipantId];
  const refs = ids.flatMap((id) => [
    db.doc(`participant_progress/${id}`),
    db.doc(`participant_achievements/${id}`),
  ]);
  const originals = await db.getAll(...refs);
  try {
    for (const [index, participantId] of ids.entries()) {
      const audit = {
        createdByCommandId: 'command_e2e_today_fixture',
        lastChangedByCommandId: 'command_e2e_today_fixture',
        correlationId: 'correlation_e2e_today_fixture',
      };
      await db.doc(`participant_progress/${participantId}`).set(
        ParticipantProgressSchema.parse({
          participantId,
          level: index ? 3 : 2,
          skillScores: index ? { [skills[1].id]: 15 } : { [skills[0].id]: 8, [skills[1].id]: 7 },
          skillComments: {},
          revision: 1,
          createdAt: stamp,
          updatedAt: stamp,
          audit,
          dailyProgress: {
            date: participantProgressDayKey(now),
            timeZone: 'Asia/Almaty',
            baselineLevel: index ? 3 : 1,
            baselineSkillScores: index
              ? { [skills[1].id]: 6 }
              : { [skills[0].id]: 3, [skills[1].id]: 5 },
            complete: true,
          },
        })
      );
      await db.doc(`participant_achievements/${participantId}`).set(
        ParticipantAchievementsSchema.parse({
          participantId,
          revision: 1,
          createdAt: stamp,
          updatedAt: stamp,
          audit,
          earned: {
            [index ? 'ten_lessons' : 'first_lesson']: {
              earnedAt: stamp,
              source: 'participant_attendance',
            },
            five_exercises: {
              earnedAt: timestampFromDate(new Date('2026-10-05T18:59:59Z')),
              source: 'participant_progress',
            },
          },
        })
      );
    }
    const healthy = watchBrowserFailures(page);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.clock.install({ time: now });
    await signInStudent(page, runtime);
    const tile = page.locator('[data-dashboard-tile="todayAchievements"]');
    const selector = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible');
    for (const [id, xp, level] of [
      [ids[0], '+7 XP', 'New Level: 2'],
      [ids[1], '+9 XP', 'Level 3'],
      [ids[0], '+7 XP', 'New Level: 2'],
    ] as const) {
      await selector.locator(`[data-participant-id="${id}"]`).click();
      await expect(tile.locator('.sc-today-achievements-xp-value')).toHaveText(xp);
      await expect(tile.locator('.sc-today-achievements-level')).toHaveText(level);
      await expect(tile.locator('[data-participant-scope]')).toHaveCount(1);
      await expect(tile.locator('[data-participant-scope]')).toHaveAttribute(
        'data-participant-scope',
        id
      );
      await expect(tile.locator('.sc-today-achievements-score-row')).toHaveCount(
        id === ids[0] ? 2 : 1
      );
      await expect(tile.locator('.sc-today-achievements-badge')).toHaveCount(1);
    }
    const cdp = await page.context().newCDPSession(page);
    for (const timezoneId of ['Asia/Almaty', 'UTC', 'America/New_York']) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId });
      await page.clock.setSystemTime(new Date('2026-10-06T18:59:00Z'));
      await page.reload();
      await expect(tile.locator('.sc-today-achievements-xp-value')).toHaveText('+7 XP');
      await expect(tile.locator('.sc-today-achievements-badge')).toHaveCount(1);
      let navigations = 0;
      const onNavigation = () => {
        navigations += 1;
      };
      page.on('load', onNavigation);
      await page.clock.fastForward(60_000);
      await expect(tile).toHaveCount(0);
      await page.clock.fastForward(60_000);
      await expect(tile).toHaveCount(0);
      expect(navigations).toBe(0);
      page.off('load', onNavigation);
      // Simulate a suspended timer: moving wall time does not fire timers.
      await page.clock.setSystemTime(new Date('2026-10-06T18:59:00Z'));
      await page.reload();
      await expect(tile.locator('.sc-today-achievements-xp-value')).toHaveText('+7 XP');
      await page.clock.setSystemTime(new Date('2026-10-06T19:01:00Z'));
      await expect(tile.locator('.sc-today-achievements-xp-value')).toHaveText('+7 XP');
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect(tile).toHaveCount(0);
    }
    await page.clock.setSystemTime(now);
    await page.reload();
    await expect(tile.locator('.sc-today-achievements-xp-value')).toHaveText('+7 XP');
    await page.clock.resume();
    await page
      .getByRole('group', { name: /Switch language|Сменить язык/ })
      .getByRole('button', { name: 'RU', exact: true })
      .click();
    await expect(tile).toContainText('Достижения за сегодня');
    for (const [name, width, dark] of [
      ['desktop-light', 1440, false],
      ['mobile-light', 390, false],
      ['desktop-dark', 1440, true],
      ['mobile-dark', 390, true],
      ['narrow-light', 320, false],
      ['narrow-dark', 320, true],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (value) => document.documentElement.classList.toggle('dark', value),
        dark
      );
      await tile.scrollIntoViewIfNeeded();
      await tile.evaluate((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - 100));
      });
      expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await tile.screenshot({ path: info.outputPath(`${name}.png`) });
    }
    // Historical unknown keeps achievements visible, but never fabricates zero XP.
    await db
      .doc(`participant_progress/${ids[0]}`)
      .update({ dailyProgress: requireFunctions('firebase-admin/firestore').FieldValue.delete() });
    await page.reload();
    await expect(tile.locator('.sc-today-achievements-xp-value')).toHaveText('— XP');
    await expect(tile).toContainText('Дневная история оценок ещё недоступна.');
    healthy();
  } finally {
    for (const original of originals) {
      if (original.exists) await original.ref.set(original.data()!);
      else await original.ref.delete();
    }
  }
});
