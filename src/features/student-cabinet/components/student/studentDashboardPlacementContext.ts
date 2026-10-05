import type { CompactedDashboardPlacement } from '../../../settings/studentDashboardVerticalLayout';
import type { TabletTilePlacement } from '../../../settings/studentDashboardTabletLayout';
import { createContext } from 'react';
import type { ResolvedDashboardPlacement } from '../../../settings/studentDashboardDesktopLayout';
import type { StudentDashboardTileKey } from '../../../settings/studentDashboardLayout';

export const StudentDashboardPlacementContext = createContext<ReadonlyMap<
  StudentDashboardTileKey,
  ResolvedDashboardPlacement | CompactedDashboardPlacement | TabletTilePlacement
> | null>(null);
