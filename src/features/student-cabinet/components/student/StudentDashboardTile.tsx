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

/** Titles may wrap without clipping, including longer localized labels. */
export function StudentDashboardTileHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header data-dashboard-header className="flex min-h-12 flex-wrap items-start gap-3">
      <h2
        data-dashboard-title
        title={title}
        className="min-w-0 flex-1 break-words type-card-title text-[var(--ink)]"
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
