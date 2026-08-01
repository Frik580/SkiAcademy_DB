import { db, doc, setDoc } from './firebase';
import { logger } from './logger';
import type { BilingualNotificationContent } from './notificationText';

export type NotificationType = 'info' | 'warning' | 'success';

export const createNotificationForUser = async (
  userId: string,
  content: BilingualNotificationContent,
  type: NotificationType = 'info'
): Promise<void> => {
  if (userId.startsWith('system_block_')) return;

  const notification = {
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
