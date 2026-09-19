import {
  AggregateRevisionSchema,
  canonicalPaths,
  type AggregateRevision,
  type CanonicalTimestamp,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { toTransactionPath } from '../bookings/bookingStore';

const ACCOUNT_PATH = /^users\/[^/]+$/;
const PARTICIPANT_PATH = /^participants\/[^/]+$/;
const INSTRUCTOR_PATH = /^instructors\/[^/]+$/;
const PARTICIPANT_MANAGEMENT_PATH = /^participant_management\/[^/]+$/;
const PARTICIPANT_MANAGEMENT_ACTIVE_OWNER_PATH = /^participant_management_active_owner\/[^/]+$/;
const INSTRUCTOR_RELATIONSHIP_PATH = /^instructor_relationships\/[^/]+$/;
const PARTICIPANT_BLOCK_PATH = /^participant_blocks\/[^/]+$/;

export const ADMIN_PEOPLE_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminPeopleRevisionCommitResult {
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

export function adminPeopleRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminPeopleRevision());
}

export async function planAdminPeopleRevisionBump(
  session: CanonicalAtomicTransactionSession
): Promise<void> {
  if (pendingBumps.has(session)) return;
  const documentPath = adminPeopleRevisionPath();
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
    estimatedPayloadBytes: ADMIN_PEOPLE_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  pendingBumps.set(session, { currentRevision, exists: read.exists });
}

export function commitAdminPeopleRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminPeopleRevisionCommitResult | undefined {
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminPeopleRevisionPath();
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
      event: 'admin_people_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
    })
  );
  return { revision: nextRevision };
}

export function adminPeopleRevisionPayload(
  commit: AdminPeopleRevisionCommitResult | undefined
): { readonly adminPeopleRevision?: AggregateRevision } {
  if (!commit) return {};
  return { adminPeopleRevision: commit.revision };
}

export function plannedMutationsAffectAdminPeople(
  mutations: readonly { readonly path: string }[],
  _commandKind: CommandKind
): boolean {
  return mutations.some((mutation) => {
    const path = normalizeMutationPath(mutation.path);
    return (
      ACCOUNT_PATH.test(path) ||
      PARTICIPANT_PATH.test(path) ||
      INSTRUCTOR_PATH.test(path) ||
      PARTICIPANT_MANAGEMENT_PATH.test(path) ||
      PARTICIPANT_MANAGEMENT_ACTIVE_OWNER_PATH.test(path) ||
      INSTRUCTOR_RELATIONSHIP_PATH.test(path) ||
      PARTICIPANT_BLOCK_PATH.test(path)
    );
  });
}

export function mergeAdminPeopleRevisionIntoResult<Kind extends CommandKind>(
  result: CommandResult<Kind>,
  commit: AdminPeopleRevisionCommitResult | undefined
): CommandResult<Kind> {
  if (result.status !== 'success' || commit === undefined) return result;
  const extra = adminPeopleRevisionPayload(commit);
  if (extra.adminPeopleRevision === undefined) return result;
  const payload =
    result.payload === undefined
      ? extra
      : { ...(result.payload as Record<string, unknown>), ...extra };
  return { ...result, payload } as CommandResult<Kind>;
}
