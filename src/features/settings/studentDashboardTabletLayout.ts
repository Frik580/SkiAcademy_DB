import type { StudentDashboardTileKey } from './studentDashboardLayout';

export const STUDENT_DASHBOARD_TABLET_GAP = 16;
export type TabletTileWidth = 'half' | 'full';
export interface TabletTileInput {
  key: StudentDashboardTileKey;
  width: TabletTileWidth;
}
export interface TabletTilePlacement extends TabletTileInput {
  mode: 'tablet';
  lane: 'left' | 'right' | 'full';
  top: number;
  height: number;
  sourceIndex: number;
}

/** Tablet widths follow the tablet contract, independently of desktop sizes or auto-grow. */
export function resolveStudentDashboardTabletLayout(
  tiles: readonly TabletTileInput[],
  heights: Readonly<Partial<Record<StudentDashboardTileKey, number>>>,
  gap = STUDENT_DASHBOARD_TABLET_GAP
) {
  // These are the next available tops, including the gap after occupied lanes.
  let left = 0;
  let right = 0;
  const placements: TabletTilePlacement[] = tiles.map((tile, sourceIndex) => {
    const lane = tile.width === 'full' ? 'full' : left <= right ? 'left' : 'right';
    const top = lane === 'full' ? Math.max(left, right) : lane === 'left' ? left : right;
    const height = Math.max(0, heights[tile.key] ?? 0);
    const next = top + height + gap;
    if (lane !== 'right') left = next;
    if (lane !== 'left') right = next;
    return { ...tile, mode: 'tablet', lane, top, height, sourceIndex };
  });
  placements.sort(
    (a, b) =>
      a.top - b.top ||
      Number(a.lane === 'right') - Number(b.lane === 'right') ||
      a.sourceIndex - b.sourceIndex
  );
  return {
    placements,
    height: Math.max(0, ...placements.map((tile) => tile.top + tile.height)),
  };
}
