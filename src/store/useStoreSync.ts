import { useSessionSync } from '../features/auth/sync/useSessionSync';
import { useSettingsSync } from '../features/settings/sync/useSettingsSync';
import { useBookingsSync } from '../features/bookings/sync/useBookingsSync';
import { useLessonBookingReadSync } from '../features/lesson-bookings/useLessonBookingReadSync';
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
  const { shouldUseCanonicalLessonBookings } = useDataSyncScope();
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  const isCustomerCanonicalLessonPath =
    shouldUseCanonicalLessonBookings && userProfile?.role === 'user' && !userProfile?.instructorId;

  useSessionSync();
  useCurrentUserProfileSync();
  useUsersSync();
  useSettingsSync();
  useBookingsSync();
  useLessonBookingReadSync(isCustomerCanonicalLessonPath, firebaseUser?.uid);
  useCoursesSync();
  useNotificationsSync();
  useWalletSync();
  useProfileActivitySync();
};
