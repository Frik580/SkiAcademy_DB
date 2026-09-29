import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminPlannerRevision } from './subscribeAdminPlannerRevision';

type AdminPlannerRevisionListener = () => void;

const listeners = new Set<AdminPlannerRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
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
  if (lastNotifiedRevision !== undefined && adminPlannerRevision <= lastNotifiedRevision) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(
      revisionState.lastRevision ?? adminPlannerRevision,
      adminPlannerRevision
    ),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminPlannerRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminPlannerRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
