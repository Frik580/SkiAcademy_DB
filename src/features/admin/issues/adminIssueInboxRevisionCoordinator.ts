import { reduceAdminRealtimeRevisionSignal } from '@ski-academy/shared-domain';
import { subscribeAdminIssueInboxRevision } from './subscribeAdminIssueInboxRevision';

type AdminIssueInboxRevisionListener = () => void;

const listeners = new Set<AdminIssueInboxRevisionListener>();
let revisionState: { initialized: boolean; lastRevision?: number } = { initialized: false };
// Snapshot baselines and globally delivered invalidations are separate facts.
let lastNotifiedRevision: number | undefined;
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
  if (lastNotifiedRevision !== undefined && adminIssueInboxRevision <= lastNotifiedRevision) return;
  revisionState = {
    initialized: revisionState.initialized,
    lastRevision: Math.max(
      revisionState.lastRevision ?? adminIssueInboxRevision,
      adminIssueInboxRevision
    ),
  };
  if (listeners.size === 0) return;
  lastNotifiedRevision = adminIssueInboxRevision;
  for (const listener of listeners) {
    listener();
  }
}

export function resetAdminIssueInboxRevisionCoordinatorForTests(): void {
  listeners.clear();
  unsubscribeRevision?.();
  unsubscribeRevision = undefined;
  revisionState = { initialized: false };
  lastNotifiedRevision = undefined;
}
