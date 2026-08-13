import { useAuthSync } from './sync/useAuthSync';
import { useSettingsSync } from './sync/useSettingsSync';
import { useBookingsSync } from './sync/useBookingsSync';
import { useCoursesSync } from './sync/useCoursesSync';
import { useNotificationsSync } from './sync/useNotificationsSync';
import { useActivityAndWalletSync } from './sync/useActivityAndWalletSync';

export const useStoreSync = () => {
  useAuthSync();
  useSettingsSync();
  useBookingsSync();
  useCoursesSync();
  useNotificationsSync();
  useActivityAndWalletSync();
};
