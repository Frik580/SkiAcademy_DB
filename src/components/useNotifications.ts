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
import { useNotifications as useNotificationHub } from './PushNotificationHub';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { logger } from '../lib/logger';

interface DbNotification {
  id: string;
  userId: string;
  timestamp: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  isRead?: boolean;
}

export const useNotifications = (firebaseUser: User | null) => {
  const { addNotification } = useNotificationHub();
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
        const notifications = snapshot.docs.map(
          (notificationDoc) =>
            ({
              id: notificationDoc.id,
              ...notificationDoc.data(),
            }) as DbNotification
        );
        notifications.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setDbNotifications(notifications);

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const notification = change.doc.data() as Omit<DbNotification, 'id'>;
          if (Date.now() - new Date(notification.timestamp).getTime() < 15000) {
            addNotification(notification.type || 'info', notification.title, notification.message);
          }
        });
      },
      (error) => logger.error('Notifications sync error:', error)
    );
  }, [addNotification, firebaseUser]);

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
    handleClearNotifications,
    handleMarkNotificationsAsRead,
  };
};
