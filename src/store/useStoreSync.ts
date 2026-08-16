import { useAuthSync } from './sync/useAuthSync';
import { useSettingsSync } from './sync/useSettingsSync';
import { useBookingsSync } from '../features/bookings/sync/useBookingsSync';
import { useCoursesSync } from './sync/useCoursesSync';
import { useNotificationsSync } from '../features/notifications/sync/useNotificationsSync';
import { useActivityAndWalletSync } from './sync/useActivityAndWalletSync';
import { useWalletSync } from '../features/wallet/sync/useWalletSync';

export const useStoreSync = () => {
  useAuthSync();
  useSettingsSync();
  useBookingsSync();
  useCoursesSync();
  useNotificationsSync();
  useWalletSync();
  useActivityAndWalletSync();
};
