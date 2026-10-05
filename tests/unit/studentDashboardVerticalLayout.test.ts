import { describe, expect, it } from 'vitest';
import {
  normalizeStudentDashboardLayout,
  DASHBOARD_TILE_COLUMNS,
  type DashboardTileSize,
  type StudentDashboardTileKey,
} from '../../src/features/settings/studentDashboardLayout';
import { resolveStudentDashboardDesktopLayout } from '../../src/features/settings/studentDashboardDesktopLayout';
import { compactStudentDashboardLanes } from '../../src/features/settings/studentDashboardVerticalLayout';
const keys: StudentDashboardTileKey[] = [
  'currentSessions',
  'countdown',
  'todayTasks',
  'nextStep',
  'nextSession',
  'todayAchievements',
];
function fixture(sizes: DashboardTileSize[], heights: number[], grow = sizes.map(() => false)) {
  const visible = keys.slice(0, sizes.length);
  const config = normalizeStudentDashboardLayout({
    version: 1,
    order: visible,
    tiles: Object.fromEntries(
      visible.map((key, index) => [key, { desktopSize: sizes[index], allowAutoGrow: grow[index] }])
    ),
  });
  const rows = resolveStudentDashboardDesktopLayout(config, visible);
  const measured = Object.fromEntries(visible.map((key, index) => [key, heights[index]]));
  return { config, rows, measured, result: compactStudentDashboardLanes(rows, measured) };
}
const position = (
  result: ReturnType<typeof compactStudentDashboardLanes>,
  key: StudentDashboardTileKey
) => result.placements.find((tile) => tile.key === key)!;
describe('controlled same-width vertical compaction', () => {
  it('stacks 4 below 4 and 8 below 8 with the standard gap', () => {
    const { result } = fixture(['small', 'large', 'small', 'large'], [100, 400, 90, 130]);
    expect(position(result, keys[2]).top).toBe(120);
    expect(position(result, keys[3]).top).toBe(420);
    expect(position(result, keys[2]).lane).toBe('1:small');
    expect(position(result, keys[3]).lane).toBe('5:large');
  });
  it('allows the right 6 lane to compact independently and reflects placement in reading order', () => {
    const { result } = fixture(['medium', 'medium', 'medium', 'medium'], [400, 100, 80, 110]);
    expect(position(result, keys[2]).top).toBe(420);
    expect(position(result, keys[3]).top).toBe(120);
    expect(result.placements.map((tile) => tile.key)).toEqual([keys[0], keys[1], keys[3], keys[2]]);
  });
  it('compacts three small lanes independently, retaining their horizontal slots', () => {
    const { result } = fixture(
      ['small', 'small', 'small', 'small', 'small', 'small'],
      [100, 300, 200, 90, 90, 90]
    );
    expect(keys.slice(3).map((key) => position(result, key).top)).toEqual([120, 320, 220]);
    expect(keys.slice(3).map((key) => position(result, key).column)).toEqual([1, 5, 9]);
  });
  it('does not reuse an overlapping lane of a different width', () => {
    const { result } = fixture(['small', 'large', 'medium', 'medium'], [100, 400, 90, 100]);
    expect(position(result, keys[2]).top).toBe(420);
    expect(position(result, keys[3]).top).toBe(420);
  });
  it('treats full-width cards as barriers and stacks consecutive full cards', () => {
    const { result } = fixture(['medium', 'medium', 'full', 'full'], [100, 300, 80, 100]);
    expect(position(result, keys[2]).top).toBe(320);
    expect(position(result, keys[3]).top).toBe(420);
    expect(position(result, keys[3]).lane).toBe('1:full');
  });
  it('uses the effective lane after growth, never the original base width', () => {
    const pair = fixture(['medium', 'small'], [100, 200], [false, true]).result;
    expect(position(pair, keys[1])).toMatchObject({
      baseSize: 'small',
      effectiveSize: 'medium',
      lane: '7:medium',
    });
  });
  it('reflows when height grows/shrinks or a visible card disappears and returns', () => {
    const { rows, measured, config } = fixture(
      ['medium', 'medium', 'medium', 'medium'],
      [100, 300, 90, 110]
    );
    const before = JSON.stringify(config);
    expect(
      position(compactStudentDashboardLanes(rows, { ...measured, [keys[0]]: 200 }), keys[2]).top
    ).toBe(220);
    expect(
      position(compactStudentDashboardLanes(rows, { ...measured, [keys[0]]: 60 }), keys[2]).top
    ).toBe(80);
    const visible = [keys[1], keys[2], keys[3]];
    const hidden = compactStudentDashboardLanes(
      resolveStudentDashboardDesktopLayout(config, visible),
      measured
    );
    expect(hidden.placements.map((tile) => tile.key)).not.toContain(keys[0]);
    expect(compactStudentDashboardLanes(rows, measured)).toEqual(
      compactStudentDashboardLanes(rows, measured)
    );
    expect(JSON.stringify(config)).toBe(before);
  });
  it('has deterministic ties and no overlap across mixed width transitions', () => {
    for (const a of ['small', 'medium', 'large', 'full'] as DashboardTileSize[]) {
      for (const b of ['small', 'medium', 'large', 'full'] as DashboardTileSize[]) {
        const { result, rows, measured } = fixture(
          [a, b, a, b, 'small', 'full'],
          [100, 340, 80, 190, 120, 90]
        );
        expect(compactStudentDashboardLanes(rows, measured)).toEqual(result);
        for (let i = 0; i < result.placements.length; i++)
          for (let j = i + 1; j < result.placements.length; j++) {
            const x = result.placements[i],
              y = result.placements[j];
            const overlapX =
              x.column < y.column + DASHBOARD_TILE_COLUMNS[y.effectiveSize] &&
              y.column < x.column + DASHBOARD_TILE_COLUMNS[x.effectiveSize];
            if (overlapX)
              expect(x.top + x.height + 20 <= y.top || y.top + y.height + 20 <= x.top).toBe(true);
          }
      }
    }
    expect(compactStudentDashboardLanes([], {}).height).toBe(0);
  });
});
