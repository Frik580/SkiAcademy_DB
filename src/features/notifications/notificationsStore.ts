import { create } from 'zustand';
import type { DbNotification } from '../../lib/notificationText';
import type { NotificationsState } from './types';
import { QUERY_LIMITS } from '../../lib/queryLimits';

export const useNotificationsStore = create<NotificationsState>((set) => ({
  dbNotifications: [],
  notificationsPageSize: QUERY_LIMITS.notifications,
  notificationsHasMore: false,

  setDbNotifications: (notifications: DbNotification[]) => {
    set({ dbNotifications: notifications });
  },
  setNotificationsHasMore: (notificationsHasMore) => set({ notificationsHasMore }),
  loadMoreNotifications: () =>
    set((state) => ({
      notificationsPageSize: state.notificationsPageSize + QUERY_LIMITS.notifications,
    })),
  resetNotificationsPagination: () =>
    set({ notificationsPageSize: QUERY_LIMITS.notifications, notificationsHasMore: false }),
}));
