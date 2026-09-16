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

const BOOKING_AGGREGATE_PATH = /^bookings\/[^/]+$/;

export const ADMIN_LESSON_BOOKINGS_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminLessonBookingsRevisionCommitResult {
  readonly revision: AggregateRevision;
}

interface PendingRevisionBump {
  readonly currentRevision: number;
  readonly exists: boolean;
}

const pendingBumps = new WeakMap<CanonicalAtomicTransactionSession, PendingRevisionBump>();

export function adminLessonBookingsRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminLessonBookingsRevision());
}

export async function planAdminLessonBookingsRevisionBump(
  session: CanonicalAtomicTransactionSession
): Promise<void> {
  if (pendingBumps.has(session)) return;
  const documentPath = adminLessonBookingsRevisionPath();
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
    estimatedPayloadBytes: ADMIN_LESSON_BOOKINGS_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  pendingBumps.set(session, { currentRevision, exists: read.exists });
}

export function commitAdminLessonBookingsRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminLessonBookingsRevisionCommitResult | undefined {
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminLessonBookingsRevisionPath();
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
      event: 'admin_lesson_bookings_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
    })
  );
  return { revision: nextRevision };
}

export function adminLessonBookingsRevisionPayload(
  commit: AdminLessonBookingsRevisionCommitResult | undefined
): { readonly adminLessonBookingsRevision?: AggregateRevision } {
  if (!commit) return {};
  return { adminLessonBookingsRevision: commit.revision };
}

export function plannedMutationsAffectAdminLessonBookings(
  mutations: readonly { readonly path: string }[]
): boolean {
  return mutations.some((mutation) => {
    const path = mutation.path.startsWith('/') ? mutation.path.slice(1) : mutation.path;
    return BOOKING_AGGREGATE_PATH.test(path);
  });
}

export function mergeAdminLessonBookingsRevisionIntoResult<Kind extends CommandKind>(
  result: CommandResult<Kind>,
  commit: AdminLessonBookingsRevisionCommitResult | undefined
): CommandResult<Kind> {
  if (result.status !== 'success' || commit === undefined) return result;
  const extra = adminLessonBookingsRevisionPayload(commit);
  if (extra.adminLessonBookingsRevision === undefined) return result;
  const payload =
    result.payload === undefined
      ? extra
      : { ...(result.payload as Record<string, unknown>), ...extra };
  return { ...result, payload } as CommandResult<Kind>;
}
