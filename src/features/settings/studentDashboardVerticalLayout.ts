import {
  DASHBOARD_TILE_COLUMNS,
  type DashboardTileSize,
  type StudentDashboardTileKey,
} from './studentDashboardLayout';
import type {
  ResolvedDashboardPlacement,
  ResolvedDashboardRow,
} from './studentDashboardDesktopLayout';

export const STUDENT_DASHBOARD_DESKTOP_GAP = 20;
export interface DashboardLane {
  effectiveSize: DashboardTileSize;
  startColumn: number;
  span: number;
  bottom: number;
}
export interface CompactedDashboardPlacement extends ResolvedDashboardPlacement {
  lane: string;
  top: number;
  height: number;
}

/** Preserve horizontal lanes; overlapping incompatible widths start below the previous frontier. */
export function compactStudentDashboardLanes(
  rows: readonly ResolvedDashboardRow[],
  heights: Readonly<Partial<Record<StudentDashboardTileKey, number>>>,
  gap = STUDENT_DASHBOARD_DESKTOP_GAP
) {
  let lanes: DashboardLane[] = [];
  const placements: CompactedDashboardPlacement[] = [];
  for (const row of rows) {
    const barrier = lanes.length ? Math.max(...lanes.map((lane) => lane.bottom)) + gap : 0;
    const previous = [...lanes];
    for (const tile of row.tiles) {
      const span = DASHBOARD_TILE_COLUMNS[tile.effectiveSize];
      const overlapping = previous.filter(
        (lane) =>
          lane.startColumn < tile.column + span && tile.column < lane.startColumn + lane.span
      );
      const compatible =
        overlapping.length === 1 &&
        overlapping[0].effectiveSize === tile.effectiveSize &&
        overlapping[0].startColumn === tile.column;
      const top = compatible ? overlapping[0].bottom + gap : barrier;
      const height = Math.max(0, heights[tile.key] ?? 0);
      placements.push({ ...tile, lane: `${tile.column}:${tile.effectiveSize}`, top, height });
      lanes = lanes.filter(
        (lane) =>
          lane.startColumn >= tile.column + span || tile.column >= lane.startColumn + lane.span
      );
      lanes.push({
        effectiveSize: tile.effectiveSize,
        startColumn: tile.column,
        span,
        bottom: top + height,
      });
    }
  }
  // Keyboard/reading order follows visual top-to-bottom, then left-to-right.
  placements.sort((a, b) => a.top - b.top || a.column - b.column || a.sourceIndex - b.sourceIndex);
  return {
    placements,
    lanes: lanes.sort((a, b) => a.startColumn - b.startColumn),
    height: Math.max(0, ...placements.map((tile) => tile.top + tile.height)),
  };
}
