import { z } from 'zod';

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
