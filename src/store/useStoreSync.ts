import { useSessionSync } from '../features/auth/sync/useSessionSync';
import { useSettingsSync } from '../features/settings/sync/useSettingsSync';
import { useBookingsSync } from '../features/bookings/sync/useBookingsSync';
import { useCoursesSync } from '../features/courses/sync/useCoursesSync';
import { useNotificationsSync } from '../features/notifications/sync/useNotificationsSync';
import { useWalletSync } from '../features/wallet/sync/useWalletSync';
import { useProfileActivitySync } from '../features/profile/sync/useProfileActivitySync';
import { useAchievementsSync } from '../features/profile/sync/useAchievementsSync';
import { useCurrentUserProfileSync } from '../features/profile/sync/useCurrentUserProfileSync';
import { useUsersSync } from '../features/profile/sync/useUsersSync';
import { useAvailabilityMigrationSync } from '../features/admin/sync/useAvailabilityMigrationSync';

export const useStoreSync = () => {
  useSessionSync();
  useCurrentUserProfileSync();
  useUsersSync();
  useSettingsSync();
  useBookingsSync();
  useCoursesSync();
  useNotificationsSync();
  useWalletSync();
  useProfileActivitySync();
  useAchievementsSync();
  useAvailabilityMigrationSync();
};
