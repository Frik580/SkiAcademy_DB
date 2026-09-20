import {
  AggregateRevisionSchema,
  canonicalPaths,
  type AggregateRevision,
  type CanonicalTimestamp,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { toTransactionPath } from './bookingStore';

const BOOKING_CHANGE_REQUEST_PATH = /^booking_change_requests\/[^/]+$/;

export const ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminBookingChangeRequestsRevisionCommitResult {
  readonly revision: AggregateRevision;
}

interface PendingRevisionBump {
  readonly currentRevision: number;
  readonly exists: boolean;
}

const pendingBumps = new WeakMap<CanonicalAtomicTransactionSession, PendingRevisionBump>();

function normalizeMutationPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function adminBookingChangeRequestsRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminBookingChangeRequestsRevision());
}

export async function planAdminBookingChangeRequestsRevisionBump(
  session: CanonicalAtomicTransactionSession
): Promise<void> {
  if (pendingBumps.has(session)) return;
  const documentPath = adminBookingChangeRequestsRevisionPath();
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'other' });
  const currentRevision =
    typeof read.data?.revision === 'number' && Number.isFinite(read.data.revision)
      ? read.data.revision
      : 0;
  session.plan.planMutation({
    path: documentPath,
    kind: read.exists ? 'update' : 'create',
    category: 'other',
    estimatedPayloadBytes: ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  pendingBumps.set(session, { currentRevision, exists: read.exists });
}

export function commitAdminBookingChangeRequestsRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminBookingChangeRequestsRevisionCommitResult | undefined {
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminBookingChangeRequestsRevisionPath();
  const payload = {
    revision: nextRevision,
    updatedAt: now,
  };
  if (pending.exists) {
    session.tx.update({ path: documentPath }, payload);
  } else {
    session.tx.create({ path: documentPath }, payload);
  }
  console.info(
    JSON.stringify({
      event: 'admin_booking_change_requests_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
    })
  );
  return { revision: nextRevision };
}

export function adminBookingChangeRequestsRevisionPayload(
  commit: AdminBookingChangeRequestsRevisionCommitResult | undefined
): { readonly adminBookingChangeRequestsRevision?: AggregateRevision } {
  if (!commit) return {};
  return { adminBookingChangeRequestsRevision: commit.revision };
}

export function plannedMutationsAffectAdminBookingChangeRequests(
  mutations: readonly { readonly path: string }[]
): boolean {
  return mutations.some((mutation) =>
    BOOKING_CHANGE_REQUEST_PATH.test(normalizeMutationPath(mutation.path))
  );
}

export function mergeAdminBookingChangeRequestsRevisionIntoResult<Kind extends CommandKind>(
  result: CommandResult<Kind>,
  commit: AdminBookingChangeRequestsRevisionCommitResult | undefined
): CommandResult<Kind> {
  if (result.status !== 'success' || commit === undefined) return result;
  const extra = adminBookingChangeRequestsRevisionPayload(commit);
  if (extra.adminBookingChangeRequestsRevision === undefined) return result;
  const payload =
    result.payload === undefined
      ? extra
      : { ...(result.payload as Record<string, unknown>), ...extra };
  return { ...result, payload } as CommandResult<Kind>;
}
