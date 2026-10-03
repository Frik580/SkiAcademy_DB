import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminCoursesRevision } from './subscribeAdminCoursesRevision';

type AdminCoursesRevisionListener = () => void;

const listeners = new Set<AdminCoursesRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminCoursesRevision((nextRevision) => {
    // The list query can finish before the first snapshot. Reconcile a nonzero
    // baseline once so a mutation in that window cannot leave the list stale.
    const shouldReconcileInitialSnapshot =
      !revisionState.initialized &&
      nextRevision > 0 &&
      (lastNotifiedRevision === undefined || nextRevision > lastNotifiedRevision);
    const reduced = reduceAdminRealtimeRevisionSignal(revisionState, nextRevision);
    revisionState = {
      initialized: reduced.initialized,
      lastRevision: reduced.lastRevision,
    };
    if (!reduced.shouldRefresh && !shouldReconcileInitialSnapshot) return;
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

export function registerAdminCoursesRevisionListener(
  listener: AdminCoursesRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminCoursesRevisionFromCommand(
  adminCoursesRevision: number | undefined
): void {
  if (adminCoursesRevision === undefined) return;
  if (lastNotifiedRevision !== undefined && adminCoursesRevision <= lastNotifiedRevision) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(
      revisionState.lastRevision ?? adminCoursesRevision,
      adminCoursesRevision
    ),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminCoursesRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminCoursesRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
