import type { CollectionReference, Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  DomainOutboxObligationSchema,
  OUTBOX_DELIVERY_MAX_SCAN,
  beginOutboxSend,
  claimOutboxDelivery,
  isPendingDeliveryDue,
  isStaleOutboxLease,
  parseStoredOutboxObligation,
  type DomainOutboxObligation,
} from '@ski-academy/shared-domain';
import { guestContactPath, parseGuestContact } from '../guestContact/guestContactStore';
import {
  EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH,
  parseEmailDeliverySettings,
} from './emailDeliverySettingsStore';
import { unconfiguredEmailDeliveryAdapter } from './outboxDeliveryAdapters';
import {
  deliverDueOutboxBatch,
  deliverOutboxObligation,
  guestContactSubjectForObligation,
  type InAppNotificationWrite,
  type OutboxDeliveryBatchResult,
  type OutboxDeliveryItemResult,
  type OutboxDeliveryStore,
} from './outboxDeliveryWorker';

const OUTBOX_COLLECTION = 'domain_outbox';
const NOTIFICATIONS_COLLECTION = 'notifications';
const NON_EMAIL_CHANNELS = ['in_app', 'sms', 'push'] as const;

function replaceDelivery(
  obligation: DomainOutboxObligation,
  delivery: DomainOutboxObligation['delivery']
): DomainOutboxObligation {
  return DomainOutboxObligationSchema.parse({ ...obligation, delivery });
}

function logInvalid(outboxId: string): void {
  console.log(
    JSON.stringify({
      event: 'outbox_delivery',
      outboxId,
      templateId: 'unparsed',
      channel: 'unknown',
      attemptCount: 0,
      resultClass: 'invalid',
    })
  );
}

async function listNonEmailCandidates(
  outbox: CollectionReference,
  now: Parameters<OutboxDeliveryStore['listCandidates']>[0],
  limit: number
): Promise<{ readonly obligations: readonly DomainOutboxObligation[]; readonly scanned: number }> {
  const selected = new Map<string, DomainOutboxObligation>();
  let scanned = 0;

  for (const channel of NON_EMAIL_CHANNELS) {
    if (selected.size >= limit || scanned >= OUTBOX_DELIVERY_MAX_SCAN) break;
    const remaining = Math.min(limit - selected.size, OUTBOX_DELIVERY_MAX_SCAN - scanned);
    const dueRetries = await outbox
      .where('delivery.status', '==', 'pending')
      .where('deliverySemantics', '==', 'transactional')
      .where('channel', '==', channel)
      .where('delivery.nextAttemptAt.seconds', '<=', now.seconds)
      .orderBy('delivery.nextAttemptAt.seconds', 'asc')
      .limit(remaining)
      .get();
    scanned += dueRetries.size;
    for (const doc of dueRetries.docs) {
      const parsed = parseStoredOutboxObligation(doc.data());
      if (!parsed) {
        logInvalid(doc.id);
        continue;
      }
      if (parsed.channel !== 'email' && isPendingDeliveryDue(parsed, now)) {
        selected.set(parsed.outboxId, parsed);
      }
    }
  }

  for (const channel of NON_EMAIL_CHANNELS) {
    let cursor: QueryDocumentSnapshot | undefined;
    while (selected.size < limit && scanned < OUTBOX_DELIVERY_MAX_SCAN) {
      const pageSize = Math.min(limit - selected.size, OUTBOX_DELIVERY_MAX_SCAN - scanned);
      let pending = outbox
        .where('delivery.status', '==', 'pending')
        .where('deliverySemantics', '==', 'transactional')
        .where('channel', '==', channel)
        .orderBy('createdAt.seconds', 'desc')
        .orderBy('createdAt.nanoseconds', 'desc')
        .limit(pageSize);
      if (cursor) pending = pending.startAfter(cursor);
      const page = await pending.get();
      if (page.empty) break;
      scanned += page.size;
      cursor = page.docs[page.docs.length - 1];
      for (const doc of page.docs) {
        const parsed = parseStoredOutboxObligation(doc.data());
        if (!parsed) {
          logInvalid(doc.id);
          continue;
        }
        if (
          parsed.channel !== 'email' &&
          isPendingDeliveryDue(parsed, now) &&
          !selected.has(parsed.outboxId)
        ) {
          selected.set(parsed.outboxId, parsed);
        }
        if (selected.size >= limit) break;
      }
      if (page.size < pageSize) break;
    }
  }

  for (const channel of NON_EMAIL_CHANNELS) {
    if (selected.size >= limit || scanned >= OUTBOX_DELIVERY_MAX_SCAN) break;
    const stale = await outbox
      .where('delivery.status', '==', 'leased')
      .where('deliverySemantics', '==', 'transactional')
      .where('channel', '==', channel)
      .where('delivery.leaseExpiresAt.seconds', '<=', now.seconds)
      .orderBy('delivery.leaseExpiresAt.seconds', 'asc')
      .limit(Math.min(limit - selected.size, OUTBOX_DELIVERY_MAX_SCAN - scanned))
      .get();
    scanned += stale.size;
    for (const doc of stale.docs) {
      const parsed = parseStoredOutboxObligation(doc.data());
      if (!parsed) {
        logInvalid(doc.id);
        continue;
      }
      if (
        parsed.channel !== 'email' &&
        isStaleOutboxLease(parsed, now) &&
        !selected.has(parsed.outboxId)
      ) {
        selected.set(parsed.outboxId, parsed);
      }
    }
  }

  return {
    obligations: [...selected.values()].slice(0, limit),
    scanned: Math.min(scanned, OUTBOX_DELIVERY_MAX_SCAN),
  };
}

export function createFirestoreOutboxDeliveryStore(db: Firestore): OutboxDeliveryStore {
  const outbox = db.collection(OUTBOX_COLLECTION);

  return {
    async readEmailDeliveryEnabled() {
      const snapshot = await db.doc(EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH).get();
      const settings = parseEmailDeliverySettings(
        snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
      );
      return settings?.emailDeliveryEnabled === true;
    },

    async listCandidates(now, limit, candidateQuery) {
      const excludeEmail = candidateQuery?.excludeChannels?.includes('email') === true;
      if (excludeEmail) {
        return listNonEmailCandidates(outbox, now, limit);
      }
      const selected = new Map<string, DomainOutboxObligation>();
      let scanned = 0;

      const dueRetries = await outbox
        .where('delivery.status', '==', 'pending')
        .where('deliverySemantics', '==', 'transactional')
        .where('delivery.nextAttemptAt.seconds', '<=', now.seconds)
        .orderBy('delivery.nextAttemptAt.seconds', 'asc')
        .limit(Math.min(limit, OUTBOX_DELIVERY_MAX_SCAN))
        .get();
      scanned += dueRetries.size;
      for (const doc of dueRetries.docs) {
        const parsed = parseStoredOutboxObligation(doc.data());
        if (!parsed) {
          logInvalid(doc.id);
          continue;
        }
        if (isPendingDeliveryDue(parsed, now)) selected.set(parsed.outboxId, parsed);
      }

      let cursor: QueryDocumentSnapshot | undefined;
      while (selected.size < limit && scanned < OUTBOX_DELIVERY_MAX_SCAN) {
        const pageSize = Math.min(limit, OUTBOX_DELIVERY_MAX_SCAN - scanned);
        let query = outbox
          .where('delivery.status', '==', 'pending')
          .where('deliverySemantics', '==', 'transactional')
          .orderBy('createdAt.seconds', 'desc')
          .orderBy('createdAt.nanoseconds', 'desc')
          .limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        if (page.empty) break;
        scanned += page.size;
        cursor = page.docs[page.docs.length - 1];
        for (const doc of page.docs) {
          const parsed = parseStoredOutboxObligation(doc.data());
          if (!parsed) {
            logInvalid(doc.id);
            continue;
          }
          if (isPendingDeliveryDue(parsed, now)) selected.set(parsed.outboxId, parsed);
          if (selected.size >= limit) break;
        }
        if (page.size < pageSize) break;
      }

      if (selected.size < limit && scanned < OUTBOX_DELIVERY_MAX_SCAN) {
        const stale = await outbox
          .where('delivery.status', '==', 'leased')
          .where('deliverySemantics', '==', 'transactional')
          .where('delivery.leaseExpiresAt.seconds', '<=', now.seconds)
          .orderBy('delivery.leaseExpiresAt.seconds', 'asc')
          .limit(Math.min(limit - selected.size, OUTBOX_DELIVERY_MAX_SCAN - scanned))
          .get();
        scanned += stale.size;
        for (const doc of stale.docs) {
          const parsed = parseStoredOutboxObligation(doc.data());
          if (!parsed) {
            logInvalid(doc.id);
            continue;
          }
          if (isStaleOutboxLease(parsed, now) && !selected.has(parsed.outboxId)) {
            selected.set(parsed.outboxId, parsed);
          }
        }
      }

      return {
        obligations: [...selected.values()].slice(0, limit),
        scanned: Math.min(scanned, OUTBOX_DELIVERY_MAX_SCAN),
      };
    },

    async claim(outboxId, now, leaseToken, candidateQuery) {
      const ref = outbox.doc(outboxId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { status: 'missing' as const };
        const parsed = parseStoredOutboxObligation(snap.data());
        if (!parsed) return { status: 'invalid' as const };
        if (candidateQuery?.excludeChannels?.includes(parsed.channel)) {
          return { status: 'ineligible' as const };
        }
        const delivery = claimOutboxDelivery({ obligation: parsed, now, leaseToken });
        if (!delivery) return { status: 'lost' as const };
        const obligation = replaceDelivery(parsed, delivery);
        tx.update(ref, { delivery: obligation.delivery });
        return { status: 'claimed' as const, obligation };
      });
    },

    async beginSend(outboxId, leaseToken, now) {
      const ref = outbox.doc(outboxId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const parsed = snap.exists ? parseStoredOutboxObligation(snap.data()) : undefined;
        if (!parsed) return { status: 'lost' as const };
        const decision = beginOutboxSend({ obligation: parsed, leaseToken, now });
        if (decision.status === 'lost') return { status: 'lost' as const };
        const obligation = replaceDelivery(parsed, decision.delivery);
        tx.update(ref, { delivery: obligation.delivery });
        if (decision.status === 'exhausted') return { status: 'exhausted' as const };
        return { status: 'begun' as const, obligation };
      });
    },

    async finish(outboxId, leaseToken, delivery) {
      const ref = outbox.doc(outboxId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const parsed = snap.exists ? parseStoredOutboxObligation(snap.data()) : undefined;
        if (!parsed || parsed.delivery.status !== 'leased' || parsed.delivery.leaseToken !== leaseToken) {
          return 'lost' as const;
        }
        const obligation = replaceDelivery(parsed, delivery);
        tx.update(ref, { delivery: obligation.delivery });
        return 'committed' as const;
      });
    },

    async putInAppNotificationIfAbsent(notification: InAppNotificationWrite) {
      const ref = db.collection(NOTIFICATIONS_COLLECTION).doc(notification.notificationId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return 'exists' as const;
        tx.set(ref, notification);
        return 'created' as const;
      });
    },

    async readGuestEmail(obligation) {
      const contact = await readGuestContact(db, obligation);
      const email = contact?.email?.trim();
      return email && email.length > 0 ? email : undefined;
    },

    async readGuestNotificationLocale(obligation) {
      const contact = await readGuestContact(db, obligation);
      return contact?.notificationLocale;
    },
  };
}

async function readGuestContact(db: Firestore, obligation: DomainOutboxObligation) {
  const subject = guestContactSubjectForObligation(obligation);
  if (!subject) return undefined;
  const snap = await db.doc(guestContactPath(subject)).get();
  if (!snap.exists) return undefined;
  return parseGuestContact(snap.data());
}

export async function deliverExactDomainOutbox(
  db: Firestore,
  outboxId: string,
  now: Date = new Date()
): Promise<OutboxDeliveryItemResult> {
  return deliverOutboxObligation({
    store: createFirestoreOutboxDeliveryStore(db),
    email: unconfiguredEmailDeliveryAdapter,
    outboxId,
    now,
  });
}

/** Firestore onCreate entry. A failed attempt is retried by the platform; a claim skip is terminal for this event. */
export async function deliverCreatedDomainOutbox(
  db: Firestore,
  outboxId: string,
  now: Date = new Date()
): Promise<void> {
  const result = await deliverExactDomainOutbox(db, outboxId, now);
  if (result === 'failed') {
    throw new Error('outbox_exact_delivery_failed');
  }
}

export async function deliverDueDomainOutbox(
  db: Firestore,
  now: Date = new Date()
): Promise<OutboxDeliveryBatchResult> {
  return deliverDueOutboxBatch({
    store: createFirestoreOutboxDeliveryStore(db),
    email: unconfiguredEmailDeliveryAdapter,
    now,
  });
}
