import { z } from 'zod';
import type { AdminIssueLifecycleStatus } from './courseEnrollmentAttendanceAdminIssue';
import { AdminIssueIdSchema } from './identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_ISSUE_INBOX_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_ISSUE_INBOX_REVISION_DOCUMENT_ID = 'admin_issue_inbox' as const;

export const ADMIN_ISSUE_INBOX_REVISION_REASONS = [
  'created',
  'resolved',
  'reopened',
  'presentation_changed',
] as const;

export type AdminIssueInboxRevisionReason = (typeof ADMIN_ISSUE_INBOX_REVISION_REASONS)[number];
export const AdminIssueInboxRevisionReasonSchema = z.enum(ADMIN_ISSUE_INBOX_REVISION_REASONS);

export const AdminIssueInboxRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminIssueInboxRevisionDocument = Readonly<
  z.output<typeof AdminIssueInboxRevisionDocumentSchema>
>;

export const AttendanceAdminIssueResultPayloadSchema = z
  .object({
    resolvedAdminIssueIds: z.array(AdminIssueIdSchema).max(32),
    openedAdminIssueIds: z.array(AdminIssueIdSchema).max(32).optional(),
    adminIssueInboxRevision: AggregateRevisionSchema.optional(),
    adminLessonBookingsRevision: AggregateRevisionSchema.optional(),
    adminPlannerRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AttendanceAdminIssueResultPayload = Readonly<
  z.output<typeof AttendanceAdminIssueResultPayloadSchema>
>;

export function adminIssueInboxRevisionReason(input: {
  readonly previousStatus?: AdminIssueLifecycleStatus;
  readonly nextStatus: AdminIssueLifecycleStatus;
}): AdminIssueInboxRevisionReason | undefined {
  if (input.previousStatus === undefined && input.nextStatus === 'open') {
    return 'created';
  }
  if (
    input.previousStatus !== undefined &&
    input.previousStatus !== 'open' &&
    input.nextStatus === 'open'
  ) {
    return 'reopened';
  }
  if (input.previousStatus === 'open' && input.nextStatus !== 'open') {
    return 'resolved';
  }
  return undefined;
}

export function reduceAdminIssueInboxRevisionSignal(
  state: Readonly<{ initialized: boolean; lastRevision?: number }>,
  nextRevision: number
): Readonly<{ initialized: true; lastRevision: number; shouldRefresh: boolean }> {
  if (!state.initialized) {
    if (state.lastRevision !== undefined && nextRevision > state.lastRevision) {
      return { initialized: true, lastRevision: nextRevision, shouldRefresh: true };
    }
    return {
      initialized: true,
      lastRevision: state.lastRevision ?? nextRevision,
      shouldRefresh: false,
    };
  }
  if (state.lastRevision === nextRevision) {
    return { initialized: true, lastRevision: nextRevision, shouldRefresh: false };
  }
  return { initialized: true, lastRevision: nextRevision, shouldRefresh: true };
}
