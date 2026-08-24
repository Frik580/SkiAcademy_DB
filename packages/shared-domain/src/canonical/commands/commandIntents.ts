import { z } from 'zod';
import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  PaymentIdSchema,
} from '../identifiers';
import type { CommandKind } from './commandKinds';

const bookingTargetIntent = z.object({ bookingId: BookingIdSchema }).strict();
const courseEnrollmentTargetIntent = z
  .object({ courseEnrollmentId: CourseEnrollmentIdSchema })
  .strict();
const bookingProposalTargetIntent = z.object({ bookingProposalId: BookingProposalIdSchema }).strict();
const bookingChangeRequestTargetIntent = z
  .object({ bookingChangeRequestId: BookingChangeRequestIdSchema })
  .strict();
const participantTargetIntent = z.object({ participantId: ParticipantIdSchema }).strict();
const paymentTargetIntent = z.object({ paymentId: PaymentIdSchema }).strict();
const courseDayTargetIntent = z.object({ courseDayId: CourseDayIdSchema }).strict();
const emptyIntent = z.object({}).strict();

export const CommandIntentSchemaByKind = {
  create_confirmed_booking: z
    .object({
      bookingId: BookingIdSchema,
      instructorId: InstructorIdSchema,
      participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    })
    .strict(),
  create_guest_booking_request: z
    .object({
      bookingId: BookingIdSchema,
      instructorId: InstructorIdSchema,
      participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    })
    .strict(),
  confirm_guest_booking: bookingTargetIntent,
  link_guest_booking_to_account: z
    .object({
      bookingId: BookingIdSchema,
      participantId: ParticipantIdSchema,
    })
    .strict(),
  request_booking_cancellation: bookingTargetIntent,
  withdraw_booking_cancellation_request: bookingTargetIntent,
  resolve_booking_cancellation: bookingTargetIntent,
  reschedule_booking: bookingTargetIntent,
  change_booking_instructor: bookingTargetIntent,
  change_booking_duration: bookingTargetIntent,
  change_booking_party: bookingTargetIntent,
  complete_booking: bookingTargetIntent,
  record_booking_no_show: bookingTargetIntent,
  create_course_enrollments: z
    .object({
      courseId: CourseIdSchema,
      participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    })
    .strict(),
  transfer_course_enrollment: courseEnrollmentTargetIntent,
  withdraw_course_enrollment: courseEnrollmentTargetIntent,
  request_course_enrollment_cancellation: courseEnrollmentTargetIntent,
  resolve_course_enrollment_cancellation: courseEnrollmentTargetIntent,
  create_booking_proposal: z
    .object({
      bookingProposalId: BookingProposalIdSchema,
      instructorId: InstructorIdSchema,
      participantId: ParticipantIdSchema,
    })
    .strict(),
  accept_booking_proposal: bookingProposalTargetIntent,
  cancel_booking_proposal: bookingProposalTargetIntent,
  expire_booking_proposal: bookingProposalTargetIntent,
  create_booking_change_request: z
    .object({
      bookingChangeRequestId: BookingChangeRequestIdSchema,
      bookingId: BookingIdSchema,
    })
    .strict(),
  withdraw_booking_change_request: bookingChangeRequestTargetIntent,
  resolve_booking_change_request: bookingChangeRequestTargetIntent,
  expire_guest_reservation: bookingTargetIntent,
  enforce_payment_start_gate: z
    .object({
      subjectKind: z.enum(['booking', 'course_enrollment']),
      subjectId: z.string().min(1).max(128),
    })
    .strict(),
  resolve_attendance_outcome: z
    .object({
      subjectKind: z.enum(['booking', 'course_enrollment']),
      subjectId: z.string().min(1).max(128),
    })
    .strict(),
  create_participant: z
    .object({
      participantId: ParticipantIdSchema,
      displayName: z.string().min(1).max(128),
    })
    .strict(),
  update_participant_profile: participantTargetIntent,
  assign_participant_management: z
    .object({
      participantManagementId: ParticipantManagementIdSchema,
      participantId: ParticipantIdSchema,
    })
    .strict(),
  revoke_participant_management: z
    .object({
      participantManagementId: ParticipantManagementIdSchema,
    })
    .strict(),
  create_instructor_relationship: z
    .object({
      instructorRelationshipId: InstructorRelationshipIdSchema,
      instructorId: InstructorIdSchema,
      participantId: ParticipantIdSchema,
    })
    .strict(),
  revoke_instructor_relationship: z
    .object({
      instructorRelationshipId: InstructorRelationshipIdSchema,
    })
    .strict(),
  block_participant: z
    .object({
      participantBlockId: ParticipantBlockIdSchema,
      participantId: ParticipantIdSchema,
      instructorId: InstructorIdSchema,
    })
    .strict(),
  unblock_participant: z
    .object({
      participantBlockId: ParticipantBlockIdSchema,
    })
    .strict(),
  record_provider_payment_event: paymentTargetIntent,
  record_manual_wallet_funding: emptyIntent,
  adjust_service_price: paymentTargetIntent,
  record_financial_correction: paymentTargetIntent,
  record_audit_correction: emptyIntent,
  create_course_day: z
    .object({
      courseDayId: CourseDayIdSchema,
      courseId: CourseIdSchema,
      instructorId: InstructorIdSchema,
    })
    .strict(),
  reassign_course_day_instructor: courseDayTargetIntent,
} satisfies Record<CommandKind, z.ZodType>;

export type CommandIntentForKind<Kind extends CommandKind> = z.output<
  (typeof CommandIntentSchemaByKind)[Kind]
>;

export type CommandIntentMap = {
  [Kind in CommandKind]: CommandIntentForKind<Kind>;
};

export function parseCommandIntent<Kind extends CommandKind>(
  kind: Kind,
  input: unknown
): z.ZodSafeParseResult<CommandIntentForKind<Kind>> {
  return CommandIntentSchemaByKind[kind].safeParse(input) as z.ZodSafeParseResult<
    CommandIntentForKind<Kind>
  >;
}
