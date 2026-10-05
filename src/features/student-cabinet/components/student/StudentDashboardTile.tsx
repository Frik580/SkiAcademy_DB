import { useContext, type ReactNode } from 'react';
import { StudentDashboardPlacementContext } from './studentDashboardPlacementContext';
import { DASHBOARD_TILE_COLUMNS } from '../../../settings/studentDashboardLayout';
import {
  DESKTOP_TILE_CLASSES,
  type DashboardTileSize,
  type StudentDashboardTileKey,
} from '../../../settings/studentDashboardLayout';

export const STUDENT_DASHBOARD_GRID_CLASSES =
  'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:gap-5 items-start';

/** Conditional blocks call this only after their existing visibility checks. */
export function StudentDashboardTile({
  tileKey,
  size,
  children,
}: {
  tileKey: StudentDashboardTileKey;
  size?: DashboardTileSize;
  children: ReactNode;
}) {
  const placement = useContext(StudentDashboardPlacementContext)?.get(tileKey);
  const tablet = placement && 'mode' in placement ? placement : undefined;
  const desktop = placement && 'effectiveSize' in placement ? placement : undefined;
  const effectiveSize = desktop?.effectiveSize ?? size;
  const compacted =
    placement && 'lane' in placement && !('mode' in placement) ? placement : undefined;
  if (!size) return <>{children}</>;
  return (
    <div
      data-dashboard-tile={tileKey}
      data-base-size={size}
      data-effective-size={effectiveSize}
      data-dashboard-lane={tablet?.lane ?? compacted?.lane}
      data-tablet-width={tablet?.width}
      style={
        tablet
          ? {
              gridColumn:
                tablet.width === 'full'
                  ? '1 / span 2'
                  : `${tablet.lane === 'left' ? 1 : 2} / span 1`,
              gridRow: 1,
              position: 'absolute',
              top: tablet.top,
            }
          : desktop
            ? {
                gridColumn: `${desktop.column} / span ${DASHBOARD_TILE_COLUMNS[desktop.effectiveSize]}`,
                gridRow: compacted ? 1 : desktop.row,
                ...(compacted ? { position: 'absolute' as const, top: compacted.top } : {}),
              }
            : undefined
      }
      className={`ui-card p-4 sm:p-5 min-w-0 w-full col-span-1 md:col-span-1 ${DESKTOP_TILE_CLASSES[effectiveSize!]}`}
    >
      {children}
    </div>
  );
}

/** Reserve two title lines so wrapping and participant badges keep the first baseline aligned. */
export function StudentDashboardTileHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header data-dashboard-header className="flex h-12 min-h-12 items-center gap-3">
      <h2
        data-dashboard-title
        title={title}
        className="h-10 min-w-0 flex-1 line-clamp-2 font-sans text-sm font-semibold leading-5 tracking-normal text-[var(--ink)]"
      >
        {title}
      </h2>
      {actions && <div className="min-w-0 max-w-[40%] shrink-0">{actions}</div>}
    </header>
  );
}

export function StudentDashboardTileBody({ children }: { children: ReactNode }) {
  return (
    <div data-dashboard-body className="mt-4 min-w-0">
      {children}
    </div>
  );
}
