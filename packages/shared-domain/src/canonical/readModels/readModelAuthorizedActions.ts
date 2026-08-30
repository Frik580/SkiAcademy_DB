import { z } from 'zod';
import { AttendanceIdSchema } from '../identifiers';

export const LessonBookingReadModelAuthorizedActionsSchema = z
  .object({
    canRequestCancellation: z.boolean(),
    canWithdrawCancellation: z.boolean(),
    canReschedule: z.boolean(),
  })
  .strict();

export type LessonBookingReadModelAuthorizedActions = z.output<
  typeof LessonBookingReadModelAuthorizedActionsSchema
>;

export const BookingProposalReadModelAuthorizedActionsSchema = z
  .object({
    canAccept: z.boolean(),
    canDecline: z.boolean(),
    canWithdraw: z.boolean(),
  })
  .strict();

export type BookingProposalReadModelAuthorizedActions = z.output<
  typeof BookingProposalReadModelAuthorizedActionsSchema
>;

export const BookingChangeRequestReadModelAuthorizedActionsSchema = z
  .object({
    canWithdraw: z.boolean(),
  })
  .strict();

export type BookingChangeRequestReadModelAuthorizedActions = z.output<
  typeof BookingChangeRequestReadModelAuthorizedActionsSchema
>;

export const ParticipantInstructorAccessReadModelAuthorizedActionsSchema = z
  .object({
    canCreateRelationship: z.boolean(),
    canRevokeRelationship: z.boolean(),
    canBlock: z.boolean(),
    canUnblock: z.boolean(),
  })
  .strict();

export type ParticipantInstructorAccessReadModelAuthorizedActions = z.output<
  typeof ParticipantInstructorAccessReadModelAuthorizedActionsSchema
>;

export const CourseEnrollmentReadModelAuthorizedActionsSchema = z
  .object({
    canWithdraw: z.boolean(),
    canRequestCancellation: z.boolean(),
  })
  .strict();

export type CourseEnrollmentReadModelAuthorizedActions = z.output<
  typeof CourseEnrollmentReadModelAuthorizedActionsSchema
>;

export const InstructorCourseEnrollmentRosterAuthorizedActionsSchema = z
  .object({
    canRecordAttendance: z.boolean(),
  })
  .strict();

export type InstructorCourseEnrollmentRosterAuthorizedActions = z.output<
  typeof InstructorCourseEnrollmentRosterAuthorizedActionsSchema
>;

export const CourseAttendanceReadModelAuthorizedActionsSchema = z
  .object({
    canRecordAttendance: z.boolean(),
  })
  .strict();

export type CourseAttendanceReadModelAuthorizedActions = z.output<
  typeof CourseAttendanceReadModelAuthorizedActionsSchema
>;

export const ADMIN_ISSUE_READ_MODEL_ACTION_KINDS = [
  'record_attendance',
  'fund_payment',
  'resolve_cancellation',
  'reconcile_subject',
  'correct_finance',
  'correct_attendance_outcome',
] as const;

export const AdminIssueReadModelActionKindSchema = z.enum(ADMIN_ISSUE_READ_MODEL_ACTION_KINDS);

export const AdminIssueReadModelRequiredRevisionsSchema = z
  .object({
    issueRevision: z.number().int().positive(),
    subjectRevision: z.number().int().positive().optional(),
    paymentRevision: z.number().int().positive().optional(),
    attendanceRevisions: z
      .array(
        z
          .object({
            attendanceId: AttendanceIdSchema,
            revision: z.number().int().positive(),
          })
          .strict()
      )
      .max(64),
  })
  .strict();

export const AdminIssueReadModelAuthorizedActionSchema = z
  .object({
    kind: AdminIssueReadModelActionKindSchema,
    availability: z.literal('deferred'),
    requiredRevisions: AdminIssueReadModelRequiredRevisionsSchema,
  })
  .strict();

export const AdminIssueReadModelAuthorizedActionsSchema = z
  .object({
    canResolveDirectly: z.literal(false),
    actions: z.array(AdminIssueReadModelAuthorizedActionSchema).max(3),
    unavailableReason: z.literal('missing_required_context').optional(),
  })
  .strict();

export type AdminIssueReadModelAuthorizedActions = z.output<
  typeof AdminIssueReadModelAuthorizedActionsSchema
>;
