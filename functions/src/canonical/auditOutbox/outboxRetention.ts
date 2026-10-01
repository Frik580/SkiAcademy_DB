import type { Firestore } from 'firebase-admin/firestore';
import {
  OUTBOX_DEAD_LETTER_RETENTION_MS,
  OUTBOX_DELIVERED_RETENTION_MS,
  OUTBOX_RETENTION_BATCH_LIMIT,
  OUTBOX_RETENTION_MAX_BATCHES,
  isOutboxRetentionEligible,
  parseStoredOutboxObligation,
  timestampFromDate,
  type CanonicalTimestamp,
} from '@ski-academy/shared-domain';

const OUTBOX_COLLECTION = 'domain_outbox';

export interface OutboxRetentionResult {
  readonly deliveredDeleted: number;
  readonly deadLetterDeleted: number;
}

async function purgeTerminalStatus(
  db: Firestore,
  status: 'delivered' | 'dead_letter',
  timestampField: 'delivery.deliveredAt.seconds' | 'delivery.deadLetteredAt.seconds',
  retentionMs: number,
  now: CanonicalTimestamp
): Promise<number> {
  const cutoff = timestampFromDate(new Date(now.seconds * 1000 + Math.floor(now.nanoseconds / 1_000_000) - retentionMs));
  let deleted = 0;

  for (let batchIndex = 0; batchIndex < OUTBOX_RETENTION_MAX_BATCHES; batchIndex += 1) {
    const snapshot = await db
      .collection(OUTBOX_COLLECTION)
      .where('delivery.status', '==', status)
      .where(timestampField, '<=', cutoff.seconds)
      .orderBy(timestampField, 'asc')
      .limit(OUTBOX_RETENTION_BATCH_LIMIT)
      .get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let matched = 0;
    for (const doc of snapshot.docs) {
      const parsed = parseStoredOutboxObligation(doc.data());
      if (!parsed || !isOutboxRetentionEligible(parsed, now)) continue;
      batch.delete(doc.ref);
      matched += 1;
    }
    if (matched === 0) break;
    await batch.commit();
    deleted += matched;
    if (snapshot.size < OUTBOX_RETENTION_BATCH_LIMIT) break;
  }

  return deleted;
}

export async function purgeTerminalDomainOutbox(
  db: Firestore,
  now: Date = new Date()
): Promise<OutboxRetentionResult> {
  const nowTimestamp = timestampFromDate(now);
  const deliveredDeleted = await purgeTerminalStatus(
    db,
    'delivered',
    'delivery.deliveredAt.seconds',
    OUTBOX_DELIVERED_RETENTION_MS,
    nowTimestamp
  );
  const deadLetterDeleted = await purgeTerminalStatus(
    db,
    'dead_letter',
    'delivery.deadLetteredAt.seconds',
    OUTBOX_DEAD_LETTER_RETENTION_MS,
    nowTimestamp
  );
  return { deliveredDeleted, deadLetterDeleted };
}
