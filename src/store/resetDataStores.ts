import { useBookingsStore } from '../features/bookings/bookingsStore';
import { useBookingCollaborationStore } from '../features/booking-collaboration/bookingCollaborationStore';
import { useCoursesStore } from '../features/courses/coursesStore';
import { useNotificationsStore } from '../features/notifications/notificationsStore';
import { useParticipantProgressStore } from '../features/participant-progress/participantProgressStore';
import { useParticipantLessonFeedbackStore } from '../features/participant-lesson-feedback/participantLessonFeedbackStore';
import { useParticipantAchievementsStore } from '../features/participant-achievements/participantAchievementsStore';
import { useAccountParticipantLessonStatsStore } from '../features/lesson-bookings/accountParticipantLessonStatsStore';
import { useLessonBookingStore } from '../features/lesson-bookings/lessonBookingStore';
import { useCourseEnrollmentStore } from '../features/course-enrollments/courseEnrollmentStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useCabinetProgressParticipantSelectionStore } from '../features/student-cabinet/cabinetProgressParticipantSelectionStore';
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
    instructors: [],
    reviews: [],
    reviewBookingStates: [],
    ratingSummaries: {},
    reviewPaginationByInstructor: {},
    reviewSyncRequest: 0,
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
    canonicalBalanceKzt: null,
    canonicalWalletExists: false,
    canonicalWalletLoaded: false,
  });
  useNotificationsStore.setState({
    dbNotifications: [],
    notificationsPageSize: QUERY_LIMITS.notifications,
    notificationsHasMore: false,
  });
  useParticipantProgressStore.getState().clear();
  useParticipantLessonFeedbackStore.getState().clear();
  useParticipantAchievementsStore.getState().clear();
  useAccountParticipantLessonStatsStore.getState().reset();
  useLessonBookingStore.getState().reset();
  useCourseEnrollmentStore.getState().clearScopedEnrollments();
  useCabinetProgressParticipantSelectionStore.getState().reset();
  // Participant-access query cache is session-scoped; wipe on logout/account end.
  useBookingCollaborationStore.getState().reset();
}
