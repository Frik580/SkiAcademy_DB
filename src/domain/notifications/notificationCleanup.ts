import { getScopedDocumentPage } from '../../lib/canonical/scopedClientDocuments';
import { deleteDoc, doc, type Firestore } from 'firebase/firestore';
import { getNotificationRetentionMs } from './notificationConfig';
import { logger } from '../../shared';
import { notificationEligibleForUserPurge } from '@ski-academy/shared-domain/canonical/testSideEffectPolicy';

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
  let cursor: string | null = null;

  while (true) {
    const page = await getScopedDocumentPage(
      {
        collection: 'notifications',
        take: CLEANUP_BATCH_SIZE,
        where: [
          { field: 'userId', op: '==', value: userId },
          { field: 'timestamp', op: '<', value: cutoffIso },
        ],
        order: [{ field: 'timestamp', direction: 'asc' }],
      },
      cursor
    );
    cursor = page.cursor;
    const snapshot = { docs: page.docs.map((item) => ({ id: item.id, data: () => item.data })) };
    if (!snapshot.docs.length) break;

    await Promise.all(
      snapshot.docs
        .filter((notificationDoc) =>
          notificationEligibleForUserPurge(notificationDoc.data(), userId)
        )
        .map((notificationDoc) =>
          deleteDoc(doc(db, 'notifications', notificationDoc.id)).catch((err) =>
            logger.error('Failed to auto-delete expired notification:', err)
          )
        )
    );

    deleted += snapshot.docs.length;
    if (!cursor) break;
  }

  return deleted;
}
