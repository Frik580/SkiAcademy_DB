import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminCoursesRevision } from './subscribeAdminCoursesRevision';

type AdminCoursesRevisionListener = () => void;

const listeners = new Set<AdminCoursesRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminCoursesRevision((nextRevision) => {
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
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: adminCoursesRevision,
  };
}

export function resetAdminCoursesRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
}
