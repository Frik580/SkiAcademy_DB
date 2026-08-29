import { useLocation } from 'react-router-dom';
import { useSessionSync } from '../features/auth/sync/useSessionSync';
import { useSettingsSync } from '../features/settings/sync/useSettingsSync';
import { useBookingsSync } from '../features/bookings/sync/useBookingsSync';
import { useLessonBookingReadSync } from '../features/lesson-bookings/useLessonBookingReadSync';
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
import { useDataSyncScope } from './useDataSyncScope';
import { useAuthStore } from '../features/auth/authStore';
import { useProfileStore } from '../features/profile/profileStore';

export const useStoreSync = () => {
  const location = useLocation();
  const { shouldUseCanonicalLessonBookings, shouldUseCanonicalCourseEnrollments } =
    useDataSyncScope();
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  const isCustomerCanonicalLessonPath =
    shouldUseCanonicalLessonBookings && userProfile?.role === 'user' && !userProfile?.instructorId;
  const isCustomerCanonicalCoursePath =
    shouldUseCanonicalCourseEnrollments &&
    userProfile?.role === 'user' &&
    !userProfile?.instructorId;
  const isPublicCatalogPath = location.pathname === '/' || location.pathname.startsWith('/cabinet');
  const isInstructorCollaborationPath =
    location.pathname === '/instructor' && Boolean(userProfile?.instructorId);

  useSessionSync();
  useCurrentUserProfileSync();
  useUsersSync();
  useSettingsSync();
  useBookingsSync();
  useLessonBookingReadSync(isCustomerCanonicalLessonPath, firebaseUser?.uid);
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
};
