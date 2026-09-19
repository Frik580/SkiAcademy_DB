import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminIssueInboxRevision } from './subscribeAdminIssueInboxRevision';

type AdminIssueInboxRevisionListener = () => void;

const listeners = new Set<AdminIssueInboxRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
let unsubscribeRevision: (() => void) | undefined;

function ensureRevisionSubscription(): void {
  if (unsubscribeRevision) return;
  unsubscribeRevision = subscribeAdminIssueInboxRevision((nextRevision) => {
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

export function registerAdminIssueInboxRevisionListener(
  listener: AdminIssueInboxRevisionListener
): () => void {
  listeners.add(listener);
  ensureRevisionSubscription();
  return () => {
    listeners.delete(listener);
    teardownRevisionSubscriptionIfIdle();
  };
}

export function registerAdminIssueInboxRevisionFromCommand(
  adminIssueInboxRevision: number | undefined
): void {
  if (adminIssueInboxRevision === undefined) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: adminIssueInboxRevision,
  };
}

export function resetAdminIssueInboxRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
}
