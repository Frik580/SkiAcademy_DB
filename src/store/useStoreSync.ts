import { useLocation } from 'react-router-dom';
import { useSessionSync } from '../features/auth/sync/useSessionSync';
import { useCanonicalAccountProvisioningSync } from '../features/auth/sync/useCanonicalAccountProvisioningSync';
import { useSettingsSync } from '../features/settings/sync/useSettingsSync';
import { useBookingsSync } from '../features/bookings/sync/useBookingsSync';
import { useLessonBookingReadSync } from '../features/lesson-bookings/useLessonBookingReadSync';
import { useAccountParticipantLessonStatsSync } from '../features/lesson-bookings/useAccountParticipantLessonStatsSync';
import {
  useCourseCatalogReadSync,
  useCourseEnrollmentReadSync,
} from '../features/course-enrollments/useCourseEnrollmentReadSync';
import { useBookingCollaborationReadSync } from '../features/booking-collaboration/useBookingCollaborationReadSync';
import { useCoursesSync } from '../features/courses/sync/useCoursesSync';
import { useNotificationsSync } from '../features/notifications/sync/useNotificationsSync';
import { useWalletSync } from '../features/wallet/sync/useWalletSync';
import { useProfileActivitySync } from '../features/profile/sync/useProfileActivitySync';
import { useCurrentUserProfileSync } from '../features/profile/sync/useCurrentUserProfileSync';
import { useUsersSync } from '../features/profile/sync/useUsersSync';
import { useParticipantProgressSync } from '../features/participant-progress';
import { shouldSyncAccountCourseEnrollments } from './accountCourseEnrollmentSync';
import {
  shouldSyncAccountLessonBookings,
  shouldSyncAccountLessonHistory,
  shouldSyncAccountParticipantLessonStats,
} from './accountLessonBookingSync';
import { useAuthStore } from '../features/auth/authStore';
import { useProfileStore } from '../features/profile/profileStore';

export const useStoreSync = () => {
  const location = useLocation();
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  // Hydrate account lesson bookings on `/` and `/cabinet*` for any signed-in
  // account. Do not gate on role/instructorId — that left Arsenii-style admin /
  // dual-role accounts with an empty lesson store and no
  // queryLessonBookingReadModels request after legacy bookings sync was cut off.
  const isCustomerCanonicalLessonPath = shouldSyncAccountLessonBookings({
    pathname: location.pathname,
    accountId: firebaseUser?.uid,
  });
  const isCustomerCanonicalLessonHistoryPath = shouldSyncAccountLessonHistory({
    pathname: location.pathname,
    accountId: firebaseUser?.uid,
  });
  const isParticipantLessonStatsPath = shouldSyncAccountParticipantLessonStats({
    pathname: location.pathname,
    accountId: firebaseUser?.uid,
  });
  // Hydrate account course enrollments on `/` and `/cabinet*` for any signed-in
  // account. Do not gate on role/instructorId — that left Arsenii-style admin /
  // dual-role accounts with an empty enrollment store and an active enroll CTA.
  const isCustomerCanonicalCoursePath = shouldSyncAccountCourseEnrollments({
    pathname: location.pathname,
    accountId: firebaseUser?.uid,
  });
  const isPublicCatalogPath = location.pathname === '/' || location.pathname.startsWith('/cabinet');
  const isInstructorCollaborationPath =
    location.pathname === '/instructor' && Boolean(userProfile?.instructorId);

  useSessionSync();
  useCurrentUserProfileSync();
  useCanonicalAccountProvisioningSync();
  useUsersSync();
  useSettingsSync();
  useBookingsSync();
  useLessonBookingReadSync(
    isCustomerCanonicalLessonPath,
    firebaseUser?.uid,
    isCustomerCanonicalLessonHistoryPath
  );
  useAccountParticipantLessonStatsSync(isParticipantLessonStatsPath, firebaseUser?.uid);
  useCourseEnrollmentReadSync(isCustomerCanonicalCoursePath, firebaseUser?.uid);
  useCourseCatalogReadSync(isPublicCatalogPath);
  useBookingCollaborationReadSync({
    customerEnabled: isCustomerCanonicalLessonPath,
    instructorEnabled: isInstructorCollaborationPath,
    accountId: firebaseUser?.uid,
    instructorId: userProfile?.instructorId,
  });
  useCoursesSync();
  useNotificationsSync();
  useWalletSync();
  useProfileActivitySync();
  useParticipantProgressSync();
};
