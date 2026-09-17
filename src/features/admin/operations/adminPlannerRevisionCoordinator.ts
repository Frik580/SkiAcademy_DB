import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminPlannerRevision } from './subscribeAdminPlannerRevision';

type AdminPlannerRevisionListener = () => void;

const listeners = new Set<AdminPlannerRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminPlannerRevision((nextRevision) => {
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

export function registerAdminPlannerRevisionListener(
  listener: AdminPlannerRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminPlannerRevisionFromCommand(
  adminPlannerRevision: number | undefined
): void {
  if (adminPlannerRevision === undefined) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: adminPlannerRevision,
  };
}

export function resetAdminPlannerRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
}
