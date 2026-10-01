import type { DomainOutboxObligation } from './auditOutbox';
import { OUTBOX_DELIVERY_MAX_ATTEMPTS } from './auditOutbox';
import {
  compareCanonicalTimestamps,
  timestampFromDate,
  type CanonicalTimestamp,
} from './primitives';

export const OUTBOX_DELIVERY_LEASE_MS = 4 * 60 * 1000;
export const OUTBOX_DELIVERY_BACKOFF_BASE_MS = 60 * 1000;
export const OUTBOX_DELIVERY_BACKOFF_CAP_MS = 60 * 60 * 1000;
export const OUTBOX_DELIVERY_CONFIG_DELAY_MS = 15 * 60 * 1000;
export const OUTBOX_DELIVERY_BATCH_LIMIT = 25;
export const OUTBOX_DELIVERY_MAX_SCAN = 100;
export const OUTBOX_PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED' as const;

/**
 * Recovery-only cadence. New jobs are delivered by the Firestore onCreate trigger.
 * A due retry can wait until the next recovery run, so the extra delay is at most this interval.
 */
export const OUTBOX_RECOVERY_INTERVAL_MINUTES = 30;

/**
 * Notification retention defaults to 14 days. Delivered outbox evidence is kept longer so an
 * operator can still correlate a job after the in-app notification is gone. Dead letters stay
 * longer because they are the operational failure record.
 */
export const OUTBOX_DELIVERED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const OUTBOX_DEAD_LETTER_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const OUTBOX_RETENTION_BATCH_LIMIT = 100;
export const OUTBOX_RETENTION_MAX_BATCHES = 5;
export const OUTBOX_DEAD_LETTER_PAGE_LIMIT = 25;

export type OutboxDeliveryResultClass =
  | 'sent'
  | 'retryable'
  | 'permanent'
  | 'not_configured';

export interface OutboxDeliveryAttemptResult {
  readonly resultClass: OutboxDeliveryResultClass;
  readonly errorCode?: string;
  readonly providerMessageId?: string;
}

export function outboxAttemptCount(delivery: DomainOutboxObligation['delivery']): number {
  switch (delivery.status) {
    case 'pending':
    case 'leased':
    case 'delivered':
    case 'dead_letter':
      return delivery.attemptCount ?? 0;
    case 'suppressed':
      return 0;
    default: {
      const unreachable: never = delivery;
      return unreachable;
    }
  }
}

export function addCanonicalTimestampMs(
  timestamp: CanonicalTimestamp,
  delayMs: number
): CanonicalTimestamp {
  const epochMs = timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000);
  return timestampFromDate(new Date(epochMs + delayMs));
}

export function isPendingDeliveryDue(
  obligation: DomainOutboxObligation,
  now: CanonicalTimestamp
): boolean {
  if (obligation.delivery.status !== 'pending') return false;
  if (obligation.deliverySemantics !== 'transactional') return false;
  const nextAttemptAt = obligation.delivery.nextAttemptAt;
  if (nextAttemptAt === undefined) return true;
  return compareCanonicalTimestamps(nextAttemptAt, now) <= 0;
}

export function isStaleOutboxLease(
  obligation: DomainOutboxObligation,
  now: CanonicalTimestamp
): boolean {
  if (obligation.delivery.status !== 'leased') return false;
  if (obligation.deliverySemantics !== 'transactional') return false;
  return compareCanonicalTimestamps(obligation.delivery.leaseExpiresAt, now) <= 0;
}

/**
 * Deterministic jitter in [0, 1) from the outbox id so retries spread without Math.random.
 * Not a secret and not a credential.
 */
export function outboxBackoffJitterUnit(outboxId: string): number {
  let hash = 0;
  for (let index = 0; index < outboxId.length; index += 1) {
    hash = (hash * 33 + outboxId.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

export function outboxBackoffDelayMs(attemptCount: number, outboxId: string): number {
  const exponent = Math.max(0, attemptCount - 1);
  const uncapped = OUTBOX_DELIVERY_BACKOFF_BASE_MS * 2 ** Math.min(exponent, 16);
  const base = Math.min(uncapped, OUTBOX_DELIVERY_BACKOFF_CAP_MS);
  const jitter = outboxBackoffJitterUnit(outboxId) * 0.2;
  return Math.round(base * (1 + jitter));
}

export function claimOutboxDelivery(input: {
  readonly obligation: DomainOutboxObligation;
  readonly now: CanonicalTimestamp;
  readonly leaseToken: string;
  readonly leaseMs?: number;
}): DomainOutboxObligation['delivery'] | undefined {
  const { obligation, now, leaseToken } = input;
  const due = isPendingDeliveryDue(obligation, now);
  const stale = isStaleOutboxLease(obligation, now);
  if (!due && !stale) return undefined;
  return {
    status: 'leased',
    leasedAt: now,
    leaseExpiresAt: addCanonicalTimestampMs(now, input.leaseMs ?? OUTBOX_DELIVERY_LEASE_MS),
    attemptCount: outboxAttemptCount(obligation.delivery),
    leaseToken,
    ...(obligation.delivery.status === 'pending' && obligation.delivery.lastErrorCode !== undefined
      ? { lastErrorCode: obligation.delivery.lastErrorCode }
      : {}),
  };
}

export function beginOutboxSend(input: {
  readonly obligation: DomainOutboxObligation;
  readonly leaseToken: string;
  readonly now: CanonicalTimestamp;
}):
  | { readonly status: 'begun'; readonly delivery: DomainOutboxObligation['delivery'] }
  | { readonly status: 'exhausted'; readonly delivery: DomainOutboxObligation['delivery'] }
  | { readonly status: 'lost' } {
  const { obligation, leaseToken, now } = input;
  if (obligation.delivery.status !== 'leased' || obligation.delivery.leaseToken !== leaseToken) {
    return { status: 'lost' };
  }
  const completed = outboxAttemptCount(obligation.delivery);
  if (completed >= OUTBOX_DELIVERY_MAX_ATTEMPTS) {
    return {
      status: 'exhausted',
      delivery: {
        status: 'dead_letter',
        deadLetteredAt: now,
        lastErrorCode: 'RETRY_EXHAUSTED',
        attemptCount: completed,
      },
    };
  }
  return {
    status: 'begun',
    delivery: {
      ...obligation.delivery,
      attemptCount: completed + 1,
    },
  };
}

export function applyOutboxDeliveryResult(input: {
  readonly obligation: DomainOutboxObligation;
  readonly leaseToken: string;
  readonly now: CanonicalTimestamp;
  readonly result: OutboxDeliveryAttemptResult;
}): DomainOutboxObligation['delivery'] | undefined {
  const { obligation, leaseToken, now, result } = input;
  if (obligation.delivery.status !== 'leased' || obligation.delivery.leaseToken !== leaseToken) {
    return undefined;
  }
  const attemptCount = outboxAttemptCount(obligation.delivery);

  if (result.resultClass === 'not_configured') {
    return {
      status: 'pending',
      attemptCount,
      nextAttemptAt: addCanonicalTimestampMs(now, OUTBOX_DELIVERY_CONFIG_DELAY_MS),
      lastErrorCode: OUTBOX_PROVIDER_NOT_CONFIGURED,
    };
  }

  if (result.resultClass === 'sent') {
    const providerMessageId = result.providerMessageId?.slice(0, 128);
    return {
      status: 'delivered',
      deliveredAt: now,
      attemptCount,
      ...(providerMessageId ? { providerMessageId } : {}),
    };
  }

  const errorCode = (result.errorCode ?? 'DELIVERY_FAILED').slice(0, 64);
  if (result.resultClass === 'permanent' || attemptCount >= OUTBOX_DELIVERY_MAX_ATTEMPTS) {
    return {
      status: 'dead_letter',
      deadLetteredAt: now,
      lastErrorCode: result.resultClass === 'permanent' ? errorCode : 'RETRY_EXHAUSTED',
      attemptCount,
    };
  }

  return {
    status: 'pending',
    attemptCount,
    nextAttemptAt: addCanonicalTimestampMs(now, outboxBackoffDelayMs(attemptCount, obligation.outboxId)),
    lastErrorCode: errorCode,
  };
}

export function selectOutboxDeliveryCandidates(
  obligations: readonly DomainOutboxObligation[],
  now: CanonicalTimestamp,
  limit: number
): { readonly selected: readonly DomainOutboxObligation[]; readonly scanned: number } {
  const ordered = [...obligations].sort((left, right) =>
    compareCanonicalTimestamps(right.createdAt, left.createdAt)
  );
  const selected: DomainOutboxObligation[] = [];
  let scanned = 0;
  const boundedLimit = Math.max(0, Math.min(limit, OUTBOX_DELIVERY_BATCH_LIMIT));
  for (const obligation of ordered) {
    if (selected.length >= boundedLimit || scanned >= OUTBOX_DELIVERY_MAX_SCAN) break;
    scanned += 1;
    if (isPendingDeliveryDue(obligation, now) || isStaleOutboxLease(obligation, now)) {
      selected.push(obligation);
    }
  }
  return { selected, scanned };
}

export function suppressOutboxDelivery(input: {
  readonly obligation: DomainOutboxObligation;
  readonly leaseToken: string;
  readonly now: CanonicalTimestamp;
  readonly suppressionReason: string;
}): DomainOutboxObligation['delivery'] | undefined {
  if (
    input.obligation.delivery.status !== 'leased' ||
    input.obligation.delivery.leaseToken !== input.leaseToken
  ) {
    return undefined;
  }
  return {
    status: 'suppressed',
    suppressedAt: input.now,
    suppressionReason: input.suppressionReason.slice(0, 64),
  };
}

/** Terminal rows only. Pending, leased, and suppressed work is never eligible. */
export function isOutboxRetentionEligible(
  obligation: DomainOutboxObligation,
  now: CanonicalTimestamp
): boolean {
  if (obligation.delivery.status === 'delivered') {
    const cutoff = addCanonicalTimestampMs(now, -OUTBOX_DELIVERED_RETENTION_MS);
    return compareCanonicalTimestamps(obligation.delivery.deliveredAt, cutoff) <= 0;
  }
  if (obligation.delivery.status === 'dead_letter') {
    const cutoff = addCanonicalTimestampMs(now, -OUTBOX_DEAD_LETTER_RETENTION_MS);
    return compareCanonicalTimestamps(obligation.delivery.deadLetteredAt, cutoff) <= 0;
  }
  return false;
}
