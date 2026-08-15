import { create } from 'zustand';
import { db, deleteDoc, doc, writeBatch } from '../../lib/firebase';
import type { DbNotification } from '../../lib/notificationText';
import { logger } from '../../lib/logger';
import type { NotificationsState } from './types';

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  dbNotifications: [],

  setDbNotifications: (notifications: DbNotification[]) => {
    set({ dbNotifications: notifications });
  },

  handleDeleteNotification: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      logger.error('Error deleting notification:', err);
      throw err;
    }
  },

  handleClearNotifications: async () => {
    const { dbNotifications } = get();
    if (dbNotifications.length === 0) return;

    try {
      await Promise.all(
        dbNotifications.map((notification) => deleteDoc(doc(db, 'notifications', notification.id)))
      );
    } catch (err) {
      logger.error('Error clearing notifications:', err);
      throw err;
    }
  },

  handleMarkNotificationsAsRead: async () => {
    const { dbNotifications } = get();
    const unreadNotifications = dbNotifications.filter((notification) => !notification.isRead);
    if (unreadNotifications.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadNotifications.forEach((notification) => {
        batch.update(doc(db, 'notifications', notification.id), { isRead: true });
      });
      await batch.commit();
    } catch (err) {
      logger.error('Error marking notifications as read:', err);
      throw err;
    }
  },
}));
