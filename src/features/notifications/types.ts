import type { DbNotification } from '../../domain/notifications/notificationText';

export interface NotificationsState {
  dbNotifications: DbNotification[];
  notificationsPageSize: number;
  notificationsHasMore: boolean;
  setDbNotifications: (notifications: DbNotification[]) => void;
  setNotificationsHasMore: (hasMore: boolean) => void;
  loadMoreNotifications: () => void;
  resetNotificationsPagination: () => void;
}
