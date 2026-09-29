import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminLessonBookingsRevision } from './subscribeAdminLessonBookingsRevision';

type AdminLessonBookingsRevisionListener = () => void;

const listeners = new Set<AdminLessonBookingsRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminLessonBookingsRevision((nextRevision) => {
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

export function registerAdminLessonBookingsRevisionListener(
  listener: AdminLessonBookingsRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminLessonBookingsRevisionFromCommand(
  adminLessonBookingsRevision: number | undefined
): void {
  if (adminLessonBookingsRevision === undefined) return;
  if (lastNotifiedRevision !== undefined && adminLessonBookingsRevision <= lastNotifiedRevision)
    return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(
      revisionState.lastRevision ?? adminLessonBookingsRevision,
      adminLessonBookingsRevision
    ),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminLessonBookingsRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminLessonBookingsRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
