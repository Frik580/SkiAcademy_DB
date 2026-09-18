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

const BOOKING_AGGREGATE_PATH = /^bookings\/[^/]+$/;
const AVAILABILITY_BLOCK_PATH = /^administrative_availability_blocks\/[^/]+$/;
const COURSE_DAY_PATH = /^courses\/[^/]+\/days\/[^/]+$/;

const PLANNER_IRRELEVANT_COMMAND_KINDS = new Set<CommandKind>([
  'record_booking_attendance',
  'finalize_booking_attendance',
  'record_course_day_attendance',
  'complete_booking',
  'record_booking_no_show',
  'resolve_attendance_outcome',
  'record_provider_payment_event',
  'pay_service_from_wallet_as_administrator',
  'record_manual_wallet_funding',
  'grant_starter_credit',
  'adjust_service_price',
  'record_financial_correction',
  'record_audit_correction',
  'save_participant_lesson_feedback',
  'set_participant_lesson_feedback_item_completion',
  'create_instructor_review',
  'update_participant_progress',
  'record_participant_achievements',
  'update_participant_profile',
  'update_account_contact_as_administrator',
]);

const PLANNER_CATALOG_COMMAND_KINDS = new Set<CommandKind>([
  'archive_course',
  'reactivate_course',
  'change_course_title',
]);

export const ADMIN_PLANNER_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminPlannerRevisionCommitResult {
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

export function adminPlannerRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminPlannerRevision());
}

export async function planAdminPlannerRevisionBump(
  session: CanonicalAtomicTransactionSession
): Promise<void> {
  if (pendingBumps.has(session)) return;
  const documentPath = adminPlannerRevisionPath();
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
    estimatedPayloadBytes: ADMIN_PLANNER_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  pendingBumps.set(session, { currentRevision, exists: read.exists });
}

export function commitAdminPlannerRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminPlannerRevisionCommitResult | undefined {
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminPlannerRevisionPath();
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
      event: 'admin_planner_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
    })
  );
  return { revision: nextRevision };
}

export function adminPlannerRevisionPayload(
  commit: AdminPlannerRevisionCommitResult | undefined
): { readonly adminPlannerRevision?: AggregateRevision } {
  if (!commit) return {};
  return { adminPlannerRevision: commit.revision };
}

export function plannedMutationsAffectAdminPlanner(
  mutations: readonly { readonly path: string }[],
  commandKind: CommandKind
): boolean {
  if (PLANNER_IRRELEVANT_COMMAND_KINDS.has(commandKind)) return false;
  if (PLANNER_CATALOG_COMMAND_KINDS.has(commandKind)) return true;
  return mutations.some((mutation) => {
    const path = normalizeMutationPath(mutation.path);
    return (
      BOOKING_AGGREGATE_PATH.test(path) ||
      AVAILABILITY_BLOCK_PATH.test(path) ||
      COURSE_DAY_PATH.test(path)
    );
  });
}

export function mergeAdminPlannerRevisionIntoResult<Kind extends CommandKind>(
  result: CommandResult<Kind>,
  commit: AdminPlannerRevisionCommitResult | undefined
): CommandResult<Kind> {
  if (result.status !== 'success' || commit === undefined) return result;
  const extra = adminPlannerRevisionPayload(commit);
  if (extra.adminPlannerRevision === undefined) return result;
  const payload =
    result.payload === undefined
      ? extra
      : { ...(result.payload as Record<string, unknown>), ...extra };
  return { ...result, payload } as CommandResult<Kind>;
}
