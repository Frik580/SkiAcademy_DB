import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminPeopleRevision } from './subscribeAdminPeopleRevision';

type AdminPeopleRevisionListener = () => void;

const listeners = new Set<AdminPeopleRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminPeopleRevision((nextRevision) => {
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

export function registerAdminPeopleRevisionListener(
  listener: AdminPeopleRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminPeopleRevisionFromCommand(
  adminPeopleRevision: number | undefined
): void {
  if (adminPeopleRevision === undefined) return;
  if (lastNotifiedRevision !== undefined && adminPeopleRevision <= lastNotifiedRevision) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(revisionState.lastRevision ?? adminPeopleRevision, adminPeopleRevision),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminPeopleRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminPeopleRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
