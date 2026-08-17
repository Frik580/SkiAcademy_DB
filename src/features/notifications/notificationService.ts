import { db, deleteDoc, doc, writeBatch } from '../../infrastructure/firebase/firebase';
import { logger } from '../../lib/logger';
import type { DbNotification } from '../../lib/notificationText';

export async function deleteNotificationService(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    logger.error('Error deleting notification:', error);
    throw error;
  }
}

export async function clearNotificationsService(notifications: DbNotification[]): Promise<void> {
  if (notifications.length === 0) return;
  try {
    await Promise.all(
      notifications.map((notification) => deleteNotificationService(notification.id))
    );
  } catch (error) {
    logger.error('Error clearing notifications:', error);
    throw error;
  }
}

export async function markNotificationsAsReadService(
  notifications: DbNotification[]
): Promise<void> {
  const unreadNotifications = notifications.filter((notification) => !notification.isRead);
  if (unreadNotifications.length === 0) return;

  try {
    const batch = writeBatch(db);
    unreadNotifications.forEach((notification) => {
      batch.update(doc(db, 'notifications', notification.id), { isRead: true });
    });
    await batch.commit();
  } catch (error) {
    logger.error('Error marking notifications as read:', error);
    throw error;
  }
}
