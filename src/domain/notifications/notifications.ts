import { db, doc, setDoc } from '../../infrastructure/firebase';
import { logger } from '../../shared';
import type { BilingualNotificationContent } from './notificationText';
import { TEST_NOTIFICATION_CLIENT_REACHABILITY } from '@ski-academy/shared-domain';

export type NotificationType = 'info' | 'warning' | 'success';
export { TEST_NOTIFICATION_CLIENT_REACHABILITY };

/**
 * Direct client notification writes remain LIVE-only.
 * TEST in-app notifications are domain/server-only until Firestore Rules (T42B-8).
 * Reachability: {@link TEST_NOTIFICATION_CLIENT_REACHABILITY}.
 */
export const createNotificationForUser = async (
  userId: string,
  content: BilingualNotificationContent,
  type: NotificationType = 'info'
): Promise<void> => {
  if (userId.startsWith('system_block_')) return;

  const notification = {
    dataScope: 'live' as const,
    userId,
    titleEn: content.titleEn,
    titleRu: content.titleRu,
    messageEn: content.messageEn,
    messageRu: content.messageRu,
    type,
    timestamp: new Date().toISOString(),
    isRead: false,
  };

  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), notification);
  } catch (e) {
    logger.error('Failed to create notification:', e);
  }
};
