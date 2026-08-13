import { useEffect } from 'react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import { logger } from '../../lib/logger';
import {
  isNotificationExpired,
  purgeExpiredNotificationsForUser,
} from '../../lib/notificationCleanup';
import { resolveNotificationText, type DbNotification } from '../../lib/notificationText';
import { useAuthStore } from '../authStore';
import { useUiStore } from '../uiStore';
import { notify, getLanguage } from '../storeContext';

export const useNotificationsSync = () => {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const notificationRetentionDays = useUiStore((s) => s.notificationRetentionDays);

  useEffect(() => {
    if (!firebaseUser) return;

    void purgeExpiredNotificationsForUser(db, firebaseUser.uid, notificationRetentionDays).catch(
      (error) => logger.error('Notification retention cleanup error:', error)
    );
  }, [firebaseUser, notificationRetentionDays]);

  useEffect(() => {
    if (!firebaseUser) {
      useAuthStore.getState().setDbNotifications([]);
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

        useAuthStore.getState().setDbNotifications(validNotifications);

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
