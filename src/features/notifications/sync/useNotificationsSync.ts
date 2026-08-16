import { useEffect } from 'react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../../lib/firebase';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { logger } from '../../../lib/logger';
import {
  isNotificationExpired,
  purgeExpiredNotificationsForUser,
} from '../../../lib/notificationCleanup';
import { resolveNotificationText, type DbNotification } from '../../../lib/notificationText';
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
      limit(QUERY_LIMITS.notifications)
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const validNotifications = snapshot.docs
          .map(
            (notificationDoc) =>
              ({ id: notificationDoc.id, ...notificationDoc.data() }) as DbNotification
          )
          .filter(
            (notification) =>
              !isNotificationExpired(notification.timestamp, notificationRetentionDays)
          );

        useNotificationsStore.getState().setDbNotifications(validNotifications);

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
  }, [firebaseUser, notificationRetentionDays]);
};
