import { db, doc, setDoc } from './firebase';

export const createNotificationForUser = async (
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' = 'info'
): Promise<void> => {
  if (userId.startsWith('system_block_')) return;
  const notification = {
    userId,
    title,
    message,
    type,
    timestamp: new Date().toISOString(),
    isRead: false,
  };
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), notification);
  } catch (e) {
    console.error('Failed to create notification:', e);
  }
};
