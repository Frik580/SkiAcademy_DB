import { useSyncExternalStore } from 'react';

const desktopQuery = '(min-width: 1280px)';
const tabletQuery = '(min-width: 768px)';
export type StudentDashboardViewport = 'mobile' | 'tablet' | 'desktop';
const readViewport = (): StudentDashboardViewport => {
  if (typeof window.matchMedia !== 'function') return 'mobile';
  if (window.matchMedia(desktopQuery).matches) return 'desktop';
  return window.matchMedia(tabletQuery).matches ? 'tablet' : 'mobile';
};
const subscribe = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const queries = [desktopQuery, tabletQuery].map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
};

export function useStudentDashboardViewport() {
  return useSyncExternalStore(subscribe, readViewport, () => 'mobile' as const);
}

/** Retained for callers that need only the desktop presentation flag. */
export function useStudentDashboardDesktop() {
  return useStudentDashboardViewport() === 'desktop';
}
