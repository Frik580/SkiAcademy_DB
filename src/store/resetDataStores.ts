import { useBookingsStore } from '../features/bookings/bookingsStore';
import { useBookingCollaborationStore } from '../features/booking-collaboration/bookingCollaborationStore';
import { useCoursesStore } from '../features/courses/coursesStore';
import { useNotificationsStore } from '../features/notifications/notificationsStore';
import { useParticipantProgressStore } from '../features/participant-progress/participantProgressStore';
import { useParticipantLessonFeedbackStore } from '../features/participant-lesson-feedback/participantLessonFeedbackStore';
import { useParticipantAchievementsStore } from '../features/participant-achievements/participantAchievementsStore';
import { useAccountParticipantLessonStatsStore } from '../features/lesson-bookings/accountParticipantLessonStatsStore';
import { useLessonBookingStore } from '../features/lesson-bookings/lessonBookingStore';
import { useManagedParticipantsStore } from '../features/lesson-bookings/managedParticipantsStore';
import { useCourseEnrollmentStore } from '../features/course-enrollments/courseEnrollmentStore';
import { useAccountCourseSessionStore } from '../features/course-enrollments/accountCourseSessionStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useCabinetProgressParticipantSelectionStore } from '../features/student-cabinet/cabinetProgressParticipantSelectionStore';
import { useWalletStore } from '../features/wallet/walletStore';
import { useInstructorCourseStore } from '../features/instructor-courses/instructorCourseStore';
import { QUERY_LIMITS } from '../shared';

/** Clears user-scoped cached data when an auth session ends or changes. */
export function resetUserScopedStores(): void {
  useBookingsStore.setState({
    bookings: [],
    bookingsLoaded: false,
    bookingsHasMore: false,
    bookingHistoryRequest: 0,
    bookingHistoryLoading: false,
    reviews: [],
    reviewBookingStates: [],
    ratingSummaries: {},
    reviewPaginationByInstructor: {},
    reviewSyncRequest: 0,
  });
  useProfileStore.setState({
    userProfile: null,
    profileLoading: false,
    profileLoadError: false,
    canonicalReadyAccountId: null,
    usersList: [],
    dismissedReviewIds: [],
    activityLogs: [],
    usersPageSize: QUERY_LIMITS.users,
    usersHasMore: false,
    activityLogsPageSize: QUERY_LIMITS.activityLogs,
    activityLogsHasMore: false,
  });
  useWalletStore.getState().resetCanonicalWallet();
  useWalletStore.getState().setWalletLedgerEntries([]);
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
  useManagedParticipantsStore.getState().reset();
  useCourseEnrollmentStore.getState().reset();
  useInstructorCourseStore.getState().reset();
  useAccountCourseSessionStore.getState().reset();
  useCabinetProgressParticipantSelectionStore.getState().reset();
  // Participant-access query cache is session-scoped; wipe on logout/account end.
  useBookingCollaborationStore.getState().reset();
}

/** Catalogues can contain authenticated TEST/workspace data. Invalidate them on
 * principal changes, independently of private account cache resets. */
export function resetAuthScopedCatalogues(): void {
  useCoursesStore.setState({ courses: [], publicCoursesStatus: 'loading' });
  useBookingsStore.setState({ instructors: [], instructorCatalogueStatus: 'loading' });
}
