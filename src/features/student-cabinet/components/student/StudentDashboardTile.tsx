import { type ReactNode } from 'react';
import {
  type DashboardTileSize,
  type StudentDashboardTileKey,
} from '../../../settings/studentDashboardLayout';

export const STUDENT_DASHBOARD_GRID_CLASSES =
  'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5 items-start';

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
  if (!size) return <>{children}</>;
  return (
    <div
      data-dashboard-tile={tileKey}
      data-base-size={size}
      className="sc-dashboard-card ui-card p-4 sm:p-5 min-w-0 w-full"
    >
      {children}
    </div>
  );
}

/** Reserve two title lines; the Home foundation allows extra lines without clipping. */
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
