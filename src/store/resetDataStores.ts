import { useBookingsStore } from '../features/bookings/bookingsStore';
import { useCoursesStore } from '../features/courses/coursesStore';
import { useNotificationsStore } from '../features/notifications/notificationsStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useWalletStore } from '../features/wallet/walletStore';
import { QUERY_LIMITS } from '../shared';

/** Clears user-scoped cached data when an auth session ends or changes. */
export function resetUserScopedStores(): void {
  useBookingsStore.setState({
    bookings: [],
    bookingsLoaded: false,
    bookingsHasMore: false,
    bookingHistoryRequest: 0,
    bookingHistoryLoading: false,
    deletedCompletedStats: { revenue: 0, count: 0 },
    instructors: [],
    reviews: [],
  });
  useCoursesStore.setState({ courses: [] });
  useProfileStore.setState({
    userProfile: null,
    profileLoading: false,
    usersList: [],
    dismissedReviewIds: [],
    activityLogs: [],
    usersPageSize: QUERY_LIMITS.users,
    usersHasMore: false,
    activityLogsPageSize: QUERY_LIMITS.activityLogs,
    activityLogsHasMore: false,
  });
  useWalletStore.setState({
    walletLedgerEntries: [],
    walletLedgerPageSize: QUERY_LIMITS.walletLedger,
    walletLedgerHasMore: false,
    optimisticBalanceDelta: 0,
  });
  useNotificationsStore.setState({
    dbNotifications: [],
    notificationsPageSize: QUERY_LIMITS.notifications,
    notificationsHasMore: false,
  });
}
