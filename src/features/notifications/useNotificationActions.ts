import { useCallback } from 'react';
import { useNotificationsStore } from './notificationsStore';
import {
  clearNotificationsService,
  deleteNotificationService,
  markNotificationsAsReadService,
} from './notificationService';

/** Notification use-cases composed at the feature boundary. */
export function useNotificationActions() {
  const dbNotifications = useNotificationsStore((state) => state.dbNotifications);

  const handleDeleteNotification = useCallback(async (id: string) => {
    await deleteNotificationService(id);
  }, []);

  const handleClearNotifications = useCallback(async () => {
    await clearNotificationsService(dbNotifications);
  }, [dbNotifications]);

  const handleMarkNotificationsAsRead = useCallback(async () => {
    await markNotificationsAsReadService(dbNotifications);
  }, [dbNotifications]);

  return {
    handleDeleteNotification,
    handleClearNotifications,
    handleMarkNotificationsAsRead,
  };
}
