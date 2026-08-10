import { Firestore } from 'firebase-admin/firestore';

const NOTIFICATIONS_COLLECTION = 'notifications';
const RETENTION_SETTINGS_DOC = 'settings/notification_retention';
const DEFAULT_RETENTION_DAYS = 14;
const BATCH_SIZE = 500;

export async function purgeExpiredNotifications(db: Firestore): Promise<number> {
  const settingsDoc = await db.doc(RETENTION_SETTINGS_DOC).get();
  const retentionDays =
    settingsDoc.exists && typeof settingsDoc.data()?.days === 'number'
      ? settingsDoc.data()!.days
      : DEFAULT_RETENTION_DAYS;

  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  let deleted = 0;

  while (true) {
    const snapshot = await db
      .collection(NOTIFICATIONS_COLLECTION)
      .where('timestamp', '<', cutoffIso)
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((notificationDoc) => batch.delete(notificationDoc.ref));
    await batch.commit();

    deleted += snapshot.size;
    if (snapshot.size < BATCH_SIZE) break;
  }

  return deleted;
}
