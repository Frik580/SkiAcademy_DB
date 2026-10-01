import type { Firestore } from 'firebase-admin/firestore';
import {
  OUTBOX_DEAD_LETTER_PAGE_LIMIT,
  documentMatchesReadScope,
  executionScopeFromReadScope,
  parseStoredOutboxObligation,
  projectOutboxDeadLetter,
  type CanonicalReadScope,
  type QueryOutboxDeadLetterReadModelResult,
} from '@ski-academy/shared-domain';

const OUTBOX_COLLECTION = 'domain_outbox';

export async function queryOutboxDeadLetterReadModel(
  firestore: Firestore,
  readScope: CanonicalReadScope
): Promise<QueryOutboxDeadLetterReadModelResult> {
  const executionScope = executionScopeFromReadScope(readScope);
  const snapshot = await firestore
    .collection(OUTBOX_COLLECTION)
    .where('delivery.status', '==', 'dead_letter')
    .orderBy('delivery.deadLetteredAt.seconds', 'desc')
    .limit(OUTBOX_DEAD_LETTER_PAGE_LIMIT)
    .get();

  const items = [];
  for (const doc of snapshot.docs) {
    if (!documentMatchesReadScope(executionScope, doc.data())) continue;
    const parsed = parseStoredOutboxObligation(doc.data());
    if (!parsed) continue;
    const signal = projectOutboxDeadLetter(parsed);
    if (signal) items.push(signal);
  }

  return {
    scope: 'outbox_dead_letters',
    items,
  };
}
