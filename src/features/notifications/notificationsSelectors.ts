import { useNotificationsStore } from './notificationsStore';

/**
 * Selects all database notifications.
 */
export const selectDbNotifications = (state: ReturnType<typeof useNotificationsStore.getState>) =>
  state.dbNotifications;

/**
 * Selects the count of unread notifications.
 */
export const selectUnreadNotificationCount = (
  state: ReturnType<typeof useNotificationsStore.getState>
) => state.dbNotifications.filter((n) => !n.isRead).length;

/**
 * Selects the latest notification.
 */
export const selectLatestNotification = (
  state: ReturnType<typeof useNotificationsStore.getState>
) => state.dbNotifications[0] ?? null;

/**
 * Helper hook for getting all notifications.
 */
export const useDbNotifications = () => useNotificationsStore((s) => s.dbNotifications);

/**
 * Helper hook for getting unread notification count.
 */
export const useUnreadNotificationCount = () =>
  useNotificationsStore((s) => s.dbNotifications.filter((n) => !n.isRead).length);
