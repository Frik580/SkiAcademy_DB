import type { DbNotification } from '../../lib/notificationText';

export interface NotificationsState {
  dbNotifications: DbNotification[];
  setDbNotifications: (notifications: DbNotification[]) => void;
}
