import { describe, expect, it } from 'vitest';
import {
  resolveStudentDashboardTabletLayout,
  type TabletTileInput,
} from '../../src/features/settings/studentDashboardTabletLayout';
import { DEFAULT_STUDENT_DASHBOARD_LAYOUT } from '../../src/features/settings/studentDashboardLayout';

const keys = DEFAULT_STUDENT_DASHBOARD_LAYOUT.order;
function resolve(heights: number[], fullIndex = -1) {
  const tiles: TabletTileInput[] = heights.map((_, i) => ({
    key: keys[i],
    width: i === fullIndex ? 'full' : 'half',
  }));
  const measured = Object.fromEntries(heights.map((height, i) => [keys[i], height]));
  return resolveStudentDashboardTabletLayout(tiles, measured);
}
describe('tablet independent lanes', () => {
  it('places the next tile immediately below the shorter left lane', () => {
    expect(resolve([200, 500, 200]).placements.map(({ lane, top }) => [lane, top])).toEqual([
      ['left', 0],
      ['right', 0],
      ['left', 216],
    ]);
  });
  it('uses the shorter right lane when the left tile is taller', () => {
    expect(resolve([500, 200, 200]).placements[2]).toMatchObject({ lane: 'right', top: 216 });
  });
  it('breaks ties to the left and recalculates the shortest lane for every source tile', () => {
    expect(resolve([200, 200, 100]).placements[2]).toMatchObject({ lane: 'left', top: 216 });
    expect(
      resolve([200, 400, 200, 200, 300]).placements.map(({ lane, top }) => [lane, top])
    ).toEqual([
      ['left', 0],
      ['right', 0],
      ['left', 216],
      ['right', 416],
      ['left', 432],
    ]);
  });
  it('synchronizes both lanes around a full-width barrier with the normal gap', () => {
    const layout = resolve([200, 500, 100, 200, 200], 2);
    expect(layout.placements[2]).toMatchObject({ width: 'full', lane: 'full', top: 516 });
    expect(layout.placements.slice(3).map(({ lane, top }) => [lane, top])).toEqual([
      ['left', 632],
      ['right', 632],
    ]);
    expect(layout.height).toBe(832);
    expect(resolve([100], 0).height).toBe(100);
  });
  it('reassigns lanes after a hidden tile, returning deterministically without mutating inputs', () => {
    const tiles: TabletTileInput[] = keys.slice(0, 4).map((key) => ({ key, width: 'half' }));
    const heights = { [keys[0]]: 200, [keys[1]]: 500, [keys[2]]: 200, [keys[3]]: 200 };
    const saved = JSON.stringify({ tiles, heights });
    const initial = resolveStudentDashboardTabletLayout(tiles, heights);
    const hidden = resolveStudentDashboardTabletLayout(
      tiles.filter((t) => t.key !== keys[1]),
      heights
    );
    expect(hidden.placements.map((p) => p.key)).not.toContain(keys[1]);
    expect(hidden.placements[1]).toMatchObject({ key: keys[2], lane: 'right', top: 0 });
    expect(resolveStudentDashboardTabletLayout(tiles, heights)).toEqual(initial);
    expect(JSON.stringify({ tiles, heights })).toBe(saved);
  });
  it('reflows following tiles when a measured height grows and shrinks', () => {
    expect(resolve([500, 200, 100]).placements[2]).toMatchObject({ lane: 'right', top: 216 });
    expect(resolve([500, 600, 100]).placements[2]).toMatchObject({ lane: 'left', top: 516 });
    expect(resolve([500, 150, 100]).placements[2]).toMatchObject({ lane: 'right', top: 166 });
  });
  it('keeps geometry separated and the parent height correct for varied measured heights', () => {
    for (let seed = 0; seed < 32; seed++) {
      const heights = keys.map((_, i) => ((seed * 137 + i * 283) % 1200) + 1);
      const result = resolve(heights, seed % keys.length);
      for (let i = 0; i < result.placements.length; i++) {
        const a = result.placements[i];
        expect(a.top + a.height).toBeLessThanOrEqual(result.height);
        for (const b of result.placements.slice(i + 1)) {
          if (a.lane === 'full' || b.lane === 'full' || a.lane === b.lane) {
            expect(a.top + a.height + 16 <= b.top || b.top + b.height + 16 <= a.top).toBe(true);
          }
        }
      }
      expect(result).toEqual(resolve(heights, seed % keys.length));
    }
    expect(resolveStudentDashboardTabletLayout([], {})).toEqual({ placements: [], height: 0 });
  });
});
