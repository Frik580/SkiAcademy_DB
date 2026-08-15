import type { DbNotification } from '../../lib/notificationText';

export interface NotificationsState {
  dbNotifications: DbNotification[];
  setDbNotifications: (notifications: DbNotification[]) => void;
  handleDeleteNotification: (id: string) => Promise<void>;
  handleClearNotifications: () => Promise<void>;
  handleMarkNotificationsAsRead: () => Promise<void>;
}
