import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminPeopleRevision } from './subscribeAdminPeopleRevision';

type AdminPeopleRevisionListener = () => void;

const listeners = new Set<AdminPeopleRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
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
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: adminPeopleRevision,
  };
}

export function resetAdminPeopleRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
}
