import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_TILE_COLUMNS,
  DASHBOARD_TILE_SIZES,
  normalizeStudentDashboardLayout,
  type DashboardTileSize,
} from '../../src/features/settings/studentDashboardLayout';
import {
  resolveStudentDashboardDesktopLayout,
  STUDENT_DASHBOARD_LOOK_AHEAD,
} from '../../src/features/settings/studentDashboardDesktopLayout';

const keys = ['currentSessions', 'countdown', 'todayTasks', 'nextStep', 'nextSession'] as const;
function resolve(sizes: DashboardTileSize[], grow = sizes.map(() => true)) {
  const visible = keys.slice(0, sizes.length);
  const config = normalizeStudentDashboardLayout({
    version: 1,
    order: visible,
    tiles: Object.fromEntries(
      visible.map((key, index) => [key, { desktopSize: sizes[index], allowAutoGrow: grow[index] }])
    ),
  });
  return { config, visible, rows: resolveStudentDashboardDesktopLayout(config, visible) };
}
const spans = (rows: ReturnType<typeof resolveStudentDashboardDesktopLayout>) =>
  rows.map((row) => row.tiles.map((tile) => DASHBOARD_TILE_COLUMNS[tile.effectiveSize]));

describe('desktop smart dashboard packing', () => {
  it.each([
    [['large', 'small'], [[8, 4]]],
    [['medium', 'medium'], [[6, 6]]],
    [['small', 'small', 'small'], [[4, 4, 4]]],
  ] as [DashboardTileSize[], number[][]][])('preserves exact base fits %j', (sizes, expected) => {
    const { rows } = resolve(sizes);
    expect(spans(rows)).toEqual(expected);
    expect(rows.flatMap((row) => row.tiles).every((tile) => !tile.wasAutoGrown)).toBe(true);
  });
  it('provides the six accepted desktop combinations for Chromium verification', () => {
    const cases = [
      { name: '6+4-grow', sizes: ['medium', 'small'], grow: [false, true] },
      { name: '8+4', sizes: ['large', 'small'], grow: [true, true] },
      { name: '8+6+4', sizes: ['large', 'medium', 'small'], grow: [true, true, true] },
      { name: '4+4+4', sizes: ['small', 'small', 'small'], grow: [true, true, true] },
      { name: 'single8-grow', sizes: ['large'], grow: [true] },
      { name: 'single8-fixed', sizes: ['large'], grow: [false] },
    ].map((item) => ({
      name: item.name,
      ...resolve(item.sizes as DashboardTileSize[], item.grow),
    }));
    expect(cases.map((item) => spans(item.rows))).toEqual([
      [[6, 6]],
      [[8, 4]],
      [[8, 4], [8]],
      [[4, 4, 4]],
      [[12]],
      [[8]],
    ]);
    if (process.env.STUDENT_DASHBOARD_PACKING_DIR) {
      mkdirSync(process.env.STUDENT_DASHBOARD_PACKING_DIR, { recursive: true });
      writeFileSync(
        process.env.STUDENT_DASHBOARD_PACKING_DIR + '/cases.json',
        JSON.stringify(cases)
      );
    }
  });
  it('grows small once beside a fixed medium and leaves fixed gaps alone', () => {
    expect(spans(resolve(['medium', 'small'], [false, true]).rows)).toEqual([[6, 6]]);
    expect(spans(resolve(['medium', 'small'], [false, false]).rows)).toEqual([[6, 4]]);
  });
  it('uses only one size step even on a lone row, and full stays full', () => {
    expect(spans(resolve(['small']).rows)).toEqual([[6]]);
    expect(spans(resolve(['medium']).rows)).toEqual([[8]]);
    expect(spans(resolve(['large']).rows)).toEqual([[12]]);
    expect(spans(resolve(['large'], [false]).rows)).toEqual([[8]]);
    expect(spans(resolve(['full']).rows)).toEqual([[12]]);
  });
  it('packs a nearby small before a medium and preserves canonical order', () => {
    const { config, visible, rows } = resolve(['large', 'medium', 'small']);
    expect(spans(rows)).toEqual([[8, 4], [8]]);
    expect(rows.flatMap((row) => row.tiles).map((tile) => tile.key)).toEqual([
      keys[0],
      keys[2],
      keys[1],
    ]);
    expect(config.order.slice(0, 3)).toEqual(visible);
    expect(config.tiles.countdown.desktopSize).toBe('medium');
    expect(rows[0].tiles[1].sourceIndex).toBe(2);
    expect(rows[0].tiles[1].column).toBe(9);
    expect(rows[1].tiles[0].row).toBe(2);
  });
  it('prefers an exact base fit to growing an earlier small', () => {
    expect(spans(resolve(['medium', 'small', 'medium']).rows)[0]).toEqual([6, 6]);
    expect(resolve(['medium', 'small', 'medium']).rows[0].tiles[1].key).toBe(keys[2]);
  });
  it('does not take a tile beyond the bounded look-ahead', () => {
    expect(STUDENT_DASHBOARD_LOOK_AHEAD).toBe(2);
    const { rows } = resolve(['large', 'medium', 'medium', 'small'], [false, false, false, false]);
    expect(spans(rows)).toEqual([[8], [6, 6], [4]]);
  });
  it('removes hidden cards before packing, recomputes on return and never mutates config', () => {
    const { config, visible } = resolve(['large', 'medium', 'small']);
    const before = JSON.stringify(config);
    expect(spans(resolveStudentDashboardDesktopLayout(config, [keys[0], keys[2]]))).toEqual([
      [8, 4],
    ]);
    expect(spans(resolveStudentDashboardDesktopLayout(config, visible))).toEqual([[8, 4], [8]]);
    expect(JSON.stringify(config)).toBe(before);
    expect(resolveStudentDashboardDesktopLayout(config, [])).toEqual([]);
  });
  it('is deterministic and earlier equally good candidates win', () => {
    const { config, visible, rows } = resolve(['large', 'small', 'small']);
    expect(rows[0].tiles[1].key).toBe(keys[1]);
    for (let i = 0; i < 5; i++)
      expect(resolveStudentDashboardDesktopLayout(config, visible)).toEqual(rows);
  });
  it('never overflows, loses a card or grows a fixed card across all three-card size/permission combinations', () => {
    for (const a of DASHBOARD_TILE_SIZES)
      for (const b of DASHBOARD_TILE_SIZES)
        for (const c of DASHBOARD_TILE_SIZES) {
          for (let mask = 0; mask < 8; mask++) {
            const { rows, visible } = resolve(
              [a, b, c],
              [0, 1, 2].map((index) => Boolean(mask & (1 << index)))
            );
            const tiles = rows.flatMap((row) => row.tiles);
            expect(new Set(tiles.map((tile) => tile.key)).size).toBe(visible.length);
            for (const row of rows) expect(row.usedColumns).toBeLessThanOrEqual(12);
            for (const tile of tiles) {
              const steps =
                DASHBOARD_TILE_SIZES.indexOf(tile.effectiveSize) -
                DASHBOARD_TILE_SIZES.indexOf(tile.baseSize);
              expect(steps).toBeGreaterThanOrEqual(0);
              expect(steps).toBeLessThanOrEqual(tile.allowAutoGrow ? 1 : 0);
            }
          }
        }
  });
});
