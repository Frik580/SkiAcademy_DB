import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  getDashboardColumnKeys,
  STUDENT_DASHBOARD_TILES,
  type StudentDashboardTileKey,
} from '../../../settings/studentDashboardLayout';
import { STUDENT_DASHBOARD_GRID_CLASSES } from './StudentDashboardTile';

const LEFT_TILES = getDashboardColumnKeys('left');
const RIGHT_TILES = getDashboardColumnKeys('right');
const tabletQuery = '(min-width: 768px)';
const desktopQuery = '(min-width: 1280px)';
type DashboardViewport = 'mobile' | 'tablet' | 'desktop';

const readViewport = (): DashboardViewport => {
  if (typeof window.matchMedia !== 'function') return 'mobile';
  if (window.matchMedia(desktopQuery).matches) return 'desktop';
  return window.matchMedia(tabletQuery).matches ? 'tablet' : 'mobile';
};
const subscribeViewport = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const tablet = window.matchMedia(tabletQuery);
  const desktop = window.matchMedia(desktopQuery);
  tablet.addEventListener('change', onChange);
  desktop.addEventListener('change', onChange);
  return () => {
    tablet.removeEventListener('change', onChange);
    desktop.removeEventListener('change', onChange);
  };
};

/** Stable portal hosts preserve card state when switching between mobile, tablet and desktop. */
export function StudentDashboardColumns({
  tiles,
  order,
}: {
  tiles: Readonly<Record<StudentDashboardTileKey, ReactNode>>;
  order: readonly StudentDashboardTileKey[];
}) {
  const viewport = useSyncExternalStore(subscribeViewport, readViewport, () => 'mobile');
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
    if (viewport === 'desktop') {
      place(
        leftRef.current!,
        order.filter((key) => STUDENT_DASHBOARD_TILES[key].desktopColumn === 'left')
      );
      place(
        rightRef.current!,
        order.filter((key) => STUDENT_DASHBOARD_TILES[key].desktopColumn === 'right')
      );
    } else {
      const visibleOrder = visibleIdentity.split('|').filter(Boolean) as StudentDashboardTileKey[];
      if (viewport === 'tablet') {
        // Independent equal-width stacks avoid Grid row gaps under shorter cards.
        place(
          leftRef.current!,
          visibleOrder.filter((_, index) => index % 2 === 0)
        );
        place(
          rightRef.current!,
          visibleOrder.filter((_, index) => index % 2 === 1)
        );
      } else {
        place(gridRef.current!, visibleOrder);
      }
    }
    if (
      focusedElement instanceof HTMLElement &&
      gridRef.current!.contains(focusedElement) &&
      document.activeElement !== focusedElement
    ) {
      focusedElement.focus({ preventScroll: true });
    }
  }, [hosts, viewport, visibleIdentity, order]);

  return (
    <div
      ref={gridRef}
      className={STUDENT_DASHBOARD_GRID_CLASSES}
      data-testid="student-dashboard-grid"
    >
      <div
        ref={leftRef}
        data-dashboard-column="left"
        className="contents min-w-0 md:col-span-1 md:flex md:flex-col md:gap-4 xl:gap-5"
      />
      <div
        ref={rightRef}
        data-dashboard-column="right"
        className="contents min-w-0 md:col-span-1 md:flex md:flex-col md:gap-4 xl:col-span-2 xl:gap-5"
      />
      {visibleKeys.map((key) => createPortal(tiles[key], hosts[key], key))}
    </div>
  );
}
