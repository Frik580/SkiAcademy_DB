import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { StudentDashboardTileKey } from '../../../settings/studentDashboardLayout';

/** One observer owns all outer shells; coalesce notifications and ignore unchanged heights. */
export function useStudentDashboardTileHeights(
  gridRef: RefObject<HTMLDivElement>,
  enabled: boolean,
  layoutIdentity: string
) {
  const [heights, setHeights] = useState<Partial<Record<StudentDashboardTileKey, number>>>({});
  const latest = useRef(heights);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!enabled || !grid) {
      latest.current = {};
      setHeights((previous) => (Object.keys(previous).length ? {} : previous));
      return;
    }
    const shells = [...grid.querySelectorAll<HTMLElement>('[data-dashboard-tile]')];
    let frame = 0;
    const measure = () => {
      const next = Object.fromEntries(
        shells.map((shell) => [shell.dataset.dashboardTile, shell.getBoundingClientRect().height])
      ) as Partial<Record<StudentDashboardTileKey, number>>;
      const previous = latest.current;
      const changed =
        Object.keys(next).length !== Object.keys(previous).length ||
        shells.some((shell) => {
          const key = shell.dataset.dashboardTile as StudentDashboardTileKey;
          return Math.abs((previous[key] ?? -1) - next[key]!) > 0.5;
        });
      if (changed) {
        latest.current = next;
        setHeights(next);
      }
    };
    measure(); // Settle before paint; initial render remains a usable ordinary grid.
    const observer = new ResizeObserver(() => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    });
    shells.forEach((shell) => observer.observe(shell));
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [gridRef, enabled, layoutIdentity]);
  return heights;
}
