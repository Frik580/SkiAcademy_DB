import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { DEFAULT_SKILL_CONFIG } from '../src/domain/achievements';
import {
  buildRadarDimensions,
  getChartDimensions,
} from '../src/features/student-cabinet/components/student/studentSkillRadarData';
import { loadRuntimeConfig, signInStudent, watchBrowserFailures } from './fixtures';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const requireRoot = createRequire(`${process.cwd()}/package.json`);
const { ParticipantProgressSchema, timestampFromDate } = requireRoot(
  '@ski-academy/shared-domain'
) as typeof import('@ski-academy/shared-domain');

test('Skill Rings preserves participant scores, selection, Development and four visual modes', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  // One serial test in a disposable demo-emulator run; restore all existing fixture documents.
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  const db = requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
  const runtime = loadRuntimeConfig();
  const ids = [runtime.studentParticipantId, runtime.studentChildParticipantId];
  const refs = ids.map((id) => db.doc(`participant_progress/${id}`));
  const originals = await db.getAll(...refs);
  const scores = DEFAULT_SKILL_CONFIG.items.reduce<Record<string, number>>(
    (result, item, index) => {
      result[item.id] = Math.floor(item.maxPoints * [0, 0.5, 1, 0.75][index % 4]);
      return result;
    },
    {}
  );
  const stamp = timestampFromDate(new Date('2026-10-11T07:00:00Z'));
  const expected = getChartDimensions(
    buildRadarDimensions({
      items: DEFAULT_SKILL_CONFIG.items,
      scores,
      targetStage: 3,
      pinnedIds: new Set(),
    })
  );
  try {
    for (const [i, ref] of refs.entries())
      await ref.set(
        ParticipantProgressSchema.parse({
          participantId: ids[i],
          level: i ? 1 : 3,
          skillScores: i ? {} : scores,
          skillComments: i
            ? {}
            : { [DEFAULT_SKILL_CONFIG.items[0].id]: 'Keep your shoulders quiet' },
          revision: 1,
          createdAt: stamp,
          updatedAt: stamp,
          audit: {
            createdByCommandId: 'command_e2e_skill_rings',
            lastChangedByCommandId: 'command_e2e_skill_rings',
            correlationId: 'correlation_e2e_skill_rings',
          },
        })
      );
    const healthy = watchBrowserFailures(page);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInStudent(page, runtime);
    const tile = page.locator('[data-dashboard-tile="skillRadar"]');
    const selector = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible');
    for (const id of [ids[0], ids[1], ids[0]]) {
      await selector.locator(`[data-participant-id="${id}"]`).click();
      const legend = tile.locator('.student-radar-skill');
      await expect(legend).toHaveCount(id === ids[0] ? 6 : 5);
      await expect(tile.locator('[data-participant-scope]')).toHaveCount(1);
      await expect(tile.locator('[data-participant-scope]')).toHaveAttribute(
        'data-participant-scope',
        id
      );
      if (id === ids[0]) {
        for (const [i, dimension] of expected.entries()) {
          await expect(legend.nth(i)).toContainText(`${dimension.percent}%`);
          await expect(legend.nth(i)).toContainText(`${dimension.earned}/${dimension.max}`);
          await expect(
            tile.locator(`[data-radar-dimension="${dimension.key}"] circle`).nth(1)
          ).toHaveAttribute('stroke', dimension.color);
        }
      } else for (const button of await legend.all()) await expect(button).toContainText('0%');
    }
    const legend = tile.locator('.student-radar-skill');
    await legend.nth(0).focus();
    await page.keyboard.press('Enter');
    await expect(legend.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(tile.locator('[data-radar-dimension="control"]')).toHaveAttribute(
      'opacity',
      '0.28'
    );
    const chart = tile.locator('svg[role="img"]');
    await chart.scrollIntoViewIfNeeded();
    const bounds = (await chart.boundingBox())!;
    // Physical pointer input on the fourth track, in the unchanged 230-unit viewBox.
    await page.mouse.click(bounds.x + (165 / 230) * bounds.width, bounds.y + bounds.height / 2);
    await expect(legend.nth(3)).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(bounds.x + 2, bounds.y + 2);
    await expect(legend.nth(3)).toHaveAttribute('aria-pressed', 'false');
    await page
      .getByRole('group', { name: /Switch language|Сменить язык/ })
      .getByRole('button', { name: 'RU', exact: true })
      .click();
    await expect(tile).toContainText('Кольца навыков катания');
    await expect(legend.nth(1)).toContainText('Контроль и закантовка');
    for (const [name, width, dark] of [
      ['desktop-light', 1440, false],
      ['mobile-light', 390, false],
      ['desktop-dark', 1440, true],
      ['mobile-dark', 390, true],
      ['narrow-light', 320, false],
      ['narrow-dark', 320, true],
      ['reference-desktop-light', 1334, false],
      ['reference-desktop-dark', 1334, true],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => {
        localStorage.setItem('theme', value ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', value);
        window.dispatchEvent(new Event('theme-change'));
      }, dark);
      await tile.scrollIntoViewIfNeeded();
      await tile.evaluate((el) =>
        window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 100))
      );
      expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      for (const button of await legend.all())
        expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*\bdark\b).*$/);
      if (width >= 1280) {
        expect(
          await tile
            .locator('.student-radar-content')
            .evaluate((el) => getComputedStyle(el).flexDirection)
        ).toBe('row');
      }
      await tile.screenshot({ path: info.outputPath(`${name}.png`) });
    }
    const developmentLink = tile.getByRole('link', {
      name: 'Перейти к развитию',
      exact: true,
    });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    let focusedByTab = false;
    for (let tabCount = 0; tabCount < 120; tabCount += 1) {
      await page.keyboard.press('Tab');
      if (await developmentLink.evaluate((element) => element === document.activeElement)) {
        focusedByTab = true;
        break;
      }
    }
    expect(focusedByTab).toBe(true);
    await expect(developmentLink).toBeFocused();
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cabinet\/development$/);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTimeOrigin);
    await expect(page.getByRole('tab', { name: 'Радар навыков' })).toBeVisible();
    await expect(page.getByText('Keep your shoulders quiet')).toBeVisible();
    await page.getByRole('tab', { name: 'Симулятор целей' }).click();
    const slider = page.getByRole('slider').first();
    const previous = await slider.inputValue();
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Сбросить симуляцию' })).toBeVisible();
    await page.getByRole('button', { name: 'Сбросить симуляцию' }).click();
    await expect(slider).toHaveValue(previous);
    expect((await refs[0].get()).data()!.skillScores).toEqual(scores);
    healthy();
  } finally {
    for (const original of originals) {
      if (original.exists) await original.ref.set(original.data()!);
      else await original.ref.delete();
    }
  }
});
