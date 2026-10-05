import {
  DASHBOARD_TILE_COLUMNS,
  DASHBOARD_TILE_SIZES,
  type DashboardTileSize,
  type StudentDashboardLayout,
  type StudentDashboardTileKey,
} from './studentDashboardLayout';

/** Only the next two remaining visible tiles may fill an anchor's row. */
export const STUDENT_DASHBOARD_LOOK_AHEAD = 2;

export interface ResolvedDashboardPlacement {
  key: StudentDashboardTileKey;
  baseSize: DashboardTileSize;
  effectiveSize: DashboardTileSize;
  allowAutoGrow: boolean;
  wasAutoGrown: boolean;
  sourceIndex: number;
  row: number;
  column: number;
}

export interface ResolvedDashboardRow {
  tiles: ResolvedDashboardPlacement[];
  usedColumns: number;
}

export function getNextDashboardTileSize(size: DashboardTileSize): DashboardTileSize {
  return DASHBOARD_TILE_SIZES[Math.min(DASHBOARD_TILE_SIZES.indexOf(size) + 1, 3)];
}

/** Bounded base-size packing first; growth never displaces a base-size exact fit. */
export function resolveStudentDashboardDesktopLayout(
  layout: StudentDashboardLayout,
  visibleKeys: readonly StudentDashboardTileKey[]
): ResolvedDashboardRow[] {
  const visible = new Set(visibleKeys);
  const pending = layout.order.flatMap((key, sourceIndex) =>
    visible.has(key)
      ? [
          {
            key,
            baseSize: layout.tiles[key].desktopSize,
            sourceIndex,
            allowAutoGrow: layout.tiles[key].allowAutoGrow,
          },
        ]
      : []
  );
  const rows: ResolvedDashboardRow[] = [];
  while (pending.length) {
    const anchor = pending.shift()!;
    const candidates = pending.slice(0, STUDENT_DASHBOARD_LOOK_AHEAD);
    let chosen: typeof pending = [];
    let used = DASHBOARD_TILE_COLUMNS[anchor.baseSize];
    // Enumerating in source order makes earlier candidates win equally good fits.
    const combinations = [
      candidates.slice(0, 2),
      candidates.slice(0, 1),
      candidates.slice(1, 2),
      [],
    ];
    for (const combination of combinations) {
      const total =
        DASHBOARD_TILE_COLUMNS[anchor.baseSize] +
        combination.reduce((sum, tile) => sum + DASHBOARD_TILE_COLUMNS[tile.baseSize], 0);
      if (total <= 12 && total > used) {
        chosen = combination;
        used = total;
      }
    }
    const baseRow = [anchor, ...chosen];
    for (const tile of chosen) pending.splice(pending.indexOf(tile), 1);

    let effectiveSizes = baseRow.map((tile) => tile.baseSize);
    // At most three cards fit a row, so at most eight one-step growth choices.
    for (let mask = 1; mask < 1 << baseRow.length; mask++) {
      const sizes = baseRow.map((tile, index) =>
        tile.allowAutoGrow && mask & (1 << index)
          ? getNextDashboardTileSize(tile.baseSize)
          : tile.baseSize
      );
      const total = sizes.reduce((sum, size) => sum + DASHBOARD_TILE_COLUMNS[size], 0);
      if (total <= 12 && total > used) {
        effectiveSizes = sizes;
        used = total;
      }
    }
    let column = 1;
    const tiles = baseRow.map((tile, index): ResolvedDashboardPlacement => {
      const effectiveSize = effectiveSizes[index];
      const placement = {
        ...tile,
        effectiveSize,
        wasAutoGrown: effectiveSize !== tile.baseSize,
        row: rows.length + 1,
        column,
      };
      column += DASHBOARD_TILE_COLUMNS[effectiveSize];
      return placement;
    });
    rows.push({ tiles, usedColumns: used });
  }
  return rows;
}
