import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminBookingChangeRequestsRevision } from './subscribeAdminBookingChangeRequestsRevision';

type AdminBookingChangeRequestsRevisionListener = () => void;

const listeners = new Set<AdminBookingChangeRequestsRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminBookingChangeRequestsRevision((nextRevision) => {
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

export function registerAdminBookingChangeRequestsRevisionListener(
  listener: AdminBookingChangeRequestsRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminBookingChangeRequestsRevisionFromCommand(
  adminBookingChangeRequestsRevision: number | undefined
): void {
  if (adminBookingChangeRequestsRevision === undefined) return;
  if (
    lastNotifiedRevision !== undefined &&
    adminBookingChangeRequestsRevision <= lastNotifiedRevision
  )
    return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(
      revisionState.lastRevision ?? adminBookingChangeRequestsRevision,
      adminBookingChangeRequestsRevision
    ),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminBookingChangeRequestsRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminBookingChangeRequestsRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
