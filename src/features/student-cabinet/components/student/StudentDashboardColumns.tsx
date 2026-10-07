import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { type StudentDashboardTileKey } from '../../../settings/studentDashboardLayout';
import { STUDENT_DASHBOARD_GRID_CLASSES } from './StudentDashboardTile';

const LEFT_TILES: readonly StudentDashboardTileKey[] = [
  'currentSessions',
  'countdown',
  'nextStep',
  'skillRadar',
  'needsAttention',
  'instructorRecommendations',
  'weather',
];
const RIGHT_TILES: readonly StudentDashboardTileKey[] = [
  'todayTasks',
  'nextSession',
  'todayAchievements',
];
const desktopQuery = '(min-width: 1280px)';
const readDesktop = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(desktopQuery).matches;
const subscribeDesktop = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Stable portal hosts preserve card state while both DOM and visual order change at xl. */
export function StudentDashboardColumns({
  tiles,
  order,
}: {
  tiles: Readonly<Record<StudentDashboardTileKey, ReactNode>>;
  order: readonly StudentDashboardTileKey[];
}) {
  const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false);
  const gridRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [hosts] = useState(
    () =>
      Object.fromEntries(
        [...LEFT_TILES, ...RIGHT_TILES].map((key) => {
          const host = document.createElement('div');
          host.dataset.dashboardItem = key;
          host.className = 'min-w-0 w-full';
          return [key, host];
        })
      ) as Record<StudentDashboardTileKey, HTMLDivElement>
  );
  const visibleKeys = order.filter((key) => tiles[key] !== null);
  const visibleIdentity = visibleKeys.join('|');

  useLayoutEffect(() => {
    // React owns each host's portal children; only their stable containers are moved.
    const focusedElement = document.activeElement;
    const visible = new Set(visibleIdentity.split('|'));
    for (const key of [...LEFT_TILES, ...RIGHT_TILES]) {
      if (!visible.has(key)) hosts[key].remove();
    }
    const place = (parent: HTMLDivElement, keys: readonly StudentDashboardTileKey[]) => {
      const children = keys.filter((key) => visible.has(key)).map((key) => hosts[key]);
      children.forEach((host, index) => {
        const next = parent.querySelectorAll(':scope > [data-dashboard-item]')[index];
        if (next !== host) parent.insertBefore(host, next ?? null);
      });
    };
    if (isDesktop) {
      place(leftRef.current!, LEFT_TILES);
      place(rightRef.current!, RIGHT_TILES);
    } else {
      place(
        gridRef.current!,
        visibleIdentity.split('|').filter(Boolean) as StudentDashboardTileKey[]
      );
    }
    if (
      focusedElement instanceof HTMLElement &&
      gridRef.current!.contains(focusedElement) &&
      document.activeElement !== focusedElement
    ) {
      focusedElement.focus({ preventScroll: true });
    }
  }, [hosts, isDesktop, visibleIdentity]);

  return (
    <div
      ref={gridRef}
      className={STUDENT_DASHBOARD_GRID_CLASSES}
      data-testid="student-dashboard-grid"
    >
      <div
        ref={leftRef}
        data-dashboard-column="left"
        className="contents xl:col-span-1 xl:flex xl:flex-col xl:gap-5 min-w-0"
      />
      <div
        ref={rightRef}
        data-dashboard-column="right"
        className="contents xl:col-span-2 xl:flex xl:flex-col xl:gap-5 min-w-0"
      />
      {visibleKeys.map((key) => createPortal(tiles[key], hosts[key], key))}
    </div>
  );
}
