import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getNotificationRetentionMs } from './notificationConfig';
import { logger } from '../../shared/logger';

const CLEANUP_BATCH_SIZE = 200;

export function getNotificationTimestampMs(timestamp: unknown): number | null {
  if (timestamp == null) return null;

  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    const ms = new Date(timestamp).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  if (
    typeof timestamp === 'object' &&
    'toDate' in timestamp &&
    typeof (timestamp as { toDate: () => Date }).toDate === 'function'
  ) {
    const ms = (timestamp as { toDate: () => Date }).toDate().getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

export function isNotificationExpired(
  timestamp: unknown,
  retentionDays: number,
  now = Date.now()
): boolean {
  const time = getNotificationTimestampMs(timestamp);
  if (time == null) return false;
  return now - time > getNotificationRetentionMs(retentionDays);
}

export async function purgeExpiredNotificationsForUser(
  db: Firestore,
  userId: string,
  retentionDays: number
): Promise<number> {
  const retentionMs = getNotificationRetentionMs(retentionDays);
  const cutoffIso = new Date(Date.now() - retentionMs).toISOString();
  let deleted = 0;

  while (true) {
    const expiredQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('timestamp', '<', cutoffIso),
      orderBy('timestamp', 'asc'),
      limit(CLEANUP_BATCH_SIZE)
    );

    const snapshot = await getDocs(expiredQuery);
    if (snapshot.empty) break;

    await Promise.all(
      snapshot.docs.map((notificationDoc) =>
        deleteDoc(doc(db, 'notifications', notificationDoc.id)).catch((err) =>
          logger.error('Failed to auto-delete expired notification:', err)
        )
      )
    );

    deleted += snapshot.docs.length;
    if (snapshot.docs.length < CLEANUP_BATCH_SIZE) break;
  }

  return deleted;
}
