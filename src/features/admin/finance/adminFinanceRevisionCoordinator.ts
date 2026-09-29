import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminFinanceRevision } from './subscribeAdminFinanceRevision';

type AdminFinanceRevisionListener = () => void;

const listeners = new Set<AdminFinanceRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminFinanceRevision((nextRevision) => {
    const reduced = reduceAdminRealtimeRevisionSignal(revisionState, nextRevision);
    revisionState = {
      initialized: reduced.initialized,
      lastRevision: reduced.lastRevision,
    };
    if (!reduced.shouldRefresh) return;
    lastNotifiedRevision = Math.max(lastNotifiedRevision ?? nextRevision, nextRevision);
    for (const listener of listeners) {
      listener();
    }
  });
}

function teardownRevisionSubscriptionIfIdle(): void {
  if (listeners.size > 0 || !unsubscribeRevision) return;
  unsubscribeRevision();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}

export function registerAdminFinanceRevisionListener(
  listener: AdminFinanceRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminFinanceRevisionFromCommand(
  adminFinanceRevision: number | undefined
): void {
  if (adminFinanceRevision === undefined) return;
  if (lastNotifiedRevision !== undefined && adminFinanceRevision <= lastNotifiedRevision) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(
      revisionState.lastRevision ?? adminFinanceRevision,
      adminFinanceRevision
    ),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminFinanceRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminFinanceRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
