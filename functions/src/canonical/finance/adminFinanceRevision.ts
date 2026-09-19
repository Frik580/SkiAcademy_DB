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

const PAYMENT_PATH = /^payments\/[^/]+$/;
const MONETARY_EVENT_PATH = /^monetary_events\/[^/]+$/;
const WALLET_STATE_PATH = /^users\/[^/]+\/wallet\/state$/;

const FINANCE_IRRELEVANT_COMMAND_KINDS = new Set<CommandKind>([
  'record_booking_attendance',
  'finalize_booking_attendance',
  'record_course_day_attendance',
  'complete_booking',
  'record_booking_no_show',
  'resolve_attendance_outcome',
  'save_participant_lesson_feedback',
  'set_participant_lesson_feedback_item_completion',
  'create_instructor_review',
  'update_participant_progress',
  'record_participant_achievements',
  'update_participant_profile',
  'update_account_contact_as_administrator',
  'update_own_account_contact',
]);

export const ADMIN_FINANCE_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminFinanceRevisionCommitResult {
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

export function adminFinanceRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminFinanceRevision());
}

export async function planAdminFinanceRevisionBump(
  session: CanonicalAtomicTransactionSession
): Promise<void> {
  if (pendingBumps.has(session)) return;
  const documentPath = adminFinanceRevisionPath();
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
    estimatedPayloadBytes: ADMIN_FINANCE_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  pendingBumps.set(session, { currentRevision, exists: read.exists });
}

export function commitAdminFinanceRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminFinanceRevisionCommitResult | undefined {
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminFinanceRevisionPath();
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
      event: 'admin_finance_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
    })
  );
  return { revision: nextRevision };
}

export function adminFinanceRevisionPayload(
  commit: AdminFinanceRevisionCommitResult | undefined
): { readonly adminFinanceRevision?: AggregateRevision } {
  if (!commit) return {};
  return { adminFinanceRevision: commit.revision };
}

export function plannedMutationsAffectAdminFinance(
  mutations: readonly { readonly path: string }[],
  commandKind: CommandKind
): boolean {
  if (FINANCE_IRRELEVANT_COMMAND_KINDS.has(commandKind)) return false;
  return mutations.some((mutation) => {
    const path = normalizeMutationPath(mutation.path);
    return (
      PAYMENT_PATH.test(path) || MONETARY_EVENT_PATH.test(path) || WALLET_STATE_PATH.test(path)
    );
  });
}

export function mergeAdminFinanceRevisionIntoResult<Kind extends CommandKind>(
  result: CommandResult<Kind>,
  commit: AdminFinanceRevisionCommitResult | undefined
): CommandResult<Kind> {
  if (result.status !== 'success' || commit === undefined) return result;
  const extra = adminFinanceRevisionPayload(commit);
  if (extra.adminFinanceRevision === undefined) return result;
  const payload =
    result.payload === undefined
      ? extra
      : { ...(result.payload as Record<string, unknown>), ...extra };
  return { ...result, payload } as CommandResult<Kind>;
}
