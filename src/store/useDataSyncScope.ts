import { useLocation } from 'react-router-dom';
import { useUiStore } from '../features/shell';

export function resolveDataSyncScope(pathname: string, hasReviewsInstructor: boolean) {
  const isAdminRoute = pathname === '/admin';
  const isInstructorRoute = pathname === '/instructor';
  const isCabinetRoute = pathname.startsWith('/cabinet');

  return {
    shouldSyncUsersList: isAdminRoute || isInstructorRoute,
    shouldSyncActivityLogs: isAdminRoute || isInstructorRoute || isCabinetRoute,
    shouldSyncReviews: isCabinetRoute || isInstructorRoute || hasReviewsInstructor,
    // History is read only in workspaces that render it; the home screen only needs hot data.
    shouldLoadBookingHistory: isAdminRoute || isInstructorRoute || isCabinetRoute,
  };
}

/** Route-scoped flags for lazy Firestore subscriptions. */
export function useDataSyncScope() {
  const location = useLocation();
  const reviewsInstructor = useUiStore((s) => s.reviewsInstructor);

  return resolveDataSyncScope(location.pathname, reviewsInstructor != null);
}
