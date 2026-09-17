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

const COURSE_AGGREGATE_PATH = /^courses\/[^/]+$/;
const COURSE_DAY_PATH = /^courses\/[^/]+\/days\/[^/]+$/;
const COURSE_ENROLLMENT_PATH = /^course_enrollments\/[^/]+$/;
const COURSE_CATALOG_CONTENT_PATH = /^course_catalog_content\/[^/]+$/;

const COURSES_IRRELEVANT_COMMAND_KINDS = new Set<CommandKind>([
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
]);

export const ADMIN_COURSES_REVISION_PLANNING_ESTIMATES = {
  documentBytes: 256,
} as const;

export interface AdminCoursesRevisionCommitResult {
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

export function adminCoursesRevisionPath(): string {
  return toTransactionPath(canonicalPaths.adminCoursesRevision());
}

export async function planAdminCoursesRevisionBump(
  session: CanonicalAtomicTransactionSession
): Promise<void> {
  if (pendingBumps.has(session)) return;
  const documentPath = adminCoursesRevisionPath();
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
    estimatedPayloadBytes: ADMIN_COURSES_REVISION_PLANNING_ESTIMATES.documentBytes,
  });
  pendingBumps.set(session, { currentRevision, exists: read.exists });
}

export function commitAdminCoursesRevisionBump(
  session: CanonicalAtomicTransactionSession,
  now: CanonicalTimestamp
): AdminCoursesRevisionCommitResult | undefined {
  const pending = pendingBumps.get(session);
  if (!pending) return undefined;
  pendingBumps.delete(session);
  const nextRevision = AggregateRevisionSchema.parse(pending.currentRevision + 1);
  const documentPath = adminCoursesRevisionPath();
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
      event: 'admin_courses_revision_bumped',
      previousRevision: pending.currentRevision,
      nextRevision,
    })
  );
  return { revision: nextRevision };
}

export function adminCoursesRevisionPayload(
  commit: AdminCoursesRevisionCommitResult | undefined
): { readonly adminCoursesRevision?: AggregateRevision } {
  if (!commit) return {};
  return { adminCoursesRevision: commit.revision };
}

export function plannedMutationsAffectAdminCourses(
  mutations: readonly { readonly path: string }[],
  commandKind: CommandKind
): boolean {
  if (COURSES_IRRELEVANT_COMMAND_KINDS.has(commandKind)) return false;
  return mutations.some((mutation) => {
    const path = normalizeMutationPath(mutation.path);
    return (
      COURSE_AGGREGATE_PATH.test(path) ||
      COURSE_DAY_PATH.test(path) ||
      COURSE_ENROLLMENT_PATH.test(path) ||
      COURSE_CATALOG_CONTENT_PATH.test(path)
    );
  });
}

export function mergeAdminCoursesRevisionIntoResult<Kind extends CommandKind>(
  result: CommandResult<Kind>,
  commit: AdminCoursesRevisionCommitResult | undefined
): CommandResult<Kind> {
  if (result.status !== 'success' || commit === undefined) return result;
  const extra = adminCoursesRevisionPayload(commit);
  if (extra.adminCoursesRevision === undefined) return result;
  const payload =
    result.payload === undefined
      ? extra
      : { ...(result.payload as Record<string, unknown>), ...extra };
  return { ...result, payload } as CommandResult<Kind>;
}
