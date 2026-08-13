import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  db,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from '../lib/firebase';
import { useNotifications as useNotificationHub } from '../components/PushNotificationHub';
import { useLanguage } from '../lib/LanguageContext';
import { resolveNotificationText, type DbNotification } from '../lib/notificationText';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { logger } from '../lib/logger';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  getNotificationRetentionMs,
} from '../lib/notificationConfig';

export type { DbNotification } from '../lib/notificationText';

export const TWO_WEEKS_MS = getNotificationRetentionMs(DEFAULT_NOTIFICATION_RETENTION_DAYS);

export const useNotifications = (
  firebaseUser: User | null,
  retentionDays: number = DEFAULT_NOTIFICATION_RETENTION_DAYS
) => {
  const { addNotification } = useNotificationHub();
  const { language } = useLanguage();
  const [dbNotifications, setDbNotifications] = useState<DbNotification[]>([]);

  const unreadNotificationCount = dbNotifications.filter(
    (notification) => !notification.isRead
  ).length;

  useEffect(() => {
    if (!firebaseUser) {
      setDbNotifications([]);
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
        const now = Date.now();
        const allNotifications = snapshot.docs.map(
          (notificationDoc) =>
            ({
              id: notificationDoc.id,
              ...notificationDoc.data(),
            }) as DbNotification
        );

        const retentionMs = getNotificationRetentionMs(retentionDays);

        const expiredNotifications = allNotifications.filter((n) => {
          const time = new Date(n.timestamp).getTime();
          return !isNaN(time) && now - time > retentionMs;
        });

        if (expiredNotifications.length > 0) {
          expiredNotifications.forEach((expired) => {
            deleteDoc(doc(db, 'notifications', expired.id)).catch((err) =>
              logger.error('Failed to auto-delete expired notification:', err)
            );
          });
        }

        const validNotifications = allNotifications.filter((n) => {
          const time = new Date(n.timestamp).getTime();
          return isNaN(time) || now - time <= retentionMs;
        });

        validNotifications.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setDbNotifications(validNotifications);

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const notification = change.doc.data() as Omit<DbNotification, 'id'>;
          if (Date.now() - new Date(notification.timestamp).getTime() < 15000) {
            const { title, message } = resolveNotificationText(notification, language);
            addNotification(notification.type || 'info', title, message);
          }
        });
      },
      (error) => logger.error('Notifications sync error:', error)
    );
  }, [addNotification, firebaseUser, language, retentionDays]);

  const handleDeleteNotification = async (id: string) => {
    if (!firebaseUser) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      logger.error('Failed to delete notification:', error);
    }
  };

  const handleClearNotifications = async () => {
    if (!firebaseUser || dbNotifications.length === 0) return;
    await Promise.all(
      dbNotifications.map((notification) => deleteDoc(doc(db, 'notifications', notification.id)))
    );
  };

  const handleMarkNotificationsAsRead = async () => {
    if (!firebaseUser) return;

    const unreadNotifications = dbNotifications.filter((notification) => !notification.isRead);
    if (unreadNotifications.length === 0) return;

    const batch = writeBatch(db);
    unreadNotifications.forEach((notification) => {
      batch.update(doc(db, 'notifications', notification.id), { isRead: true });
    });
    await batch.commit();
  };

  return {
    dbNotifications,
    unreadNotificationCount,
    handleDeleteNotification,
    handleClearNotifications,
    handleMarkNotificationsAsRead,
  };
};
