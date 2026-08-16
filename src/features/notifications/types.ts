import type { DbNotification } from '../../lib/notificationText';

export interface NotificationsState {
  dbNotifications: DbNotification[];
  notificationsPageSize: number;
  notificationsHasMore: boolean;
  setDbNotifications: (notifications: DbNotification[]) => void;
  setNotificationsHasMore: (hasMore: boolean) => void;
  loadMoreNotifications: () => void;
  resetNotificationsPagination: () => void;
}
