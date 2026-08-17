import { useEffect } from 'react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import {
  isNotificationExpired,
  purgeExpiredNotificationsForUser,
} from '../../../domain/notifications';
import { resolveNotificationText, type DbNotification } from '../../../domain/notifications';
import { toNotification } from '../../../infrastructure/firebase';
import { useAuthStore } from '../../auth/authStore';
import { useSettingsStore } from '../../settings/settingsStore';
import { notify, getLanguage } from '../../../store/storeContext';
import { useNotificationsStore } from '../notificationsStore';

/**
 * Synchronizes notifications from Firestore collection.
 * This hook subscribes to the notifications collection for the current user
 * and handles cleanup of expired notifications.
 */
export const useNotificationsSync = () => {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const notificationRetentionDays = useSettingsStore((s) => s.notificationRetentionDays);
  const notificationsPageSize = useNotificationsStore((s) => s.notificationsPageSize);

  useEffect(() => {
    useNotificationsStore.getState().resetNotificationsPagination();
  }, [firebaseUser?.uid]);

  // Cleanup expired notifications periodically
  useEffect(() => {
    if (!firebaseUser) return;

    void purgeExpiredNotificationsForUser(db, firebaseUser.uid, notificationRetentionDays).catch(
      (error) => logger.error('Notification retention cleanup error:', error)
    );
  }, [firebaseUser, notificationRetentionDays]);

  // Subscribe to notifications collection
  useEffect(() => {
    if (!firebaseUser) {
      useNotificationsStore.getState().setDbNotifications([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', firebaseUser.uid),
      orderBy('timestamp', 'desc'),
      limit(notificationsPageSize + 1)
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const validNotifications = snapshot.docs
          .slice(0, notificationsPageSize)
          .map((notificationDoc) => toNotification(notificationDoc.id, notificationDoc.data()))
          .filter(
            (notification) =>
              !isNotificationExpired(notification.timestamp, notificationRetentionDays)
          );

        useNotificationsStore.getState().setDbNotifications(validNotifications);
        useNotificationsStore
          .getState()
          .setNotificationsHasMore(snapshot.docs.length > notificationsPageSize);

        // Show toast for newly added notifications
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const notification = change.doc.data() as Omit<DbNotification, 'id'>;
          if (Date.now() - new Date(notification.timestamp).getTime() < 15000) {
            const { title, message } = resolveNotificationText(notification, getLanguage());
            notify(notification.type || 'info', title, message);
          }
        });
      },
      (error) => logger.error('Notifications sync error:', error)
    );
  }, [firebaseUser, notificationRetentionDays, notificationsPageSize]);
};
