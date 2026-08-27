import { z } from 'zod';
import {
  BookingProposalIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
} from '../identifiers';
import {
  BookingProposalCancellationReasonCodeSchema,
} from '../bookingOccurrenceProposalChange';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
} from '../primitives';
import {
  BookingProposalReadModelAuthorizedActionsSchema,
} from './readModelAuthorizedActions';

export const BOOKING_PROPOSAL_READ_SCOPES = ['account_open', 'instructor_open'] as const;
export type BookingProposalReadScope = (typeof BOOKING_PROPOSAL_READ_SCOPES)[number];

export const BookingProposalReadScopeSchema = z.enum(BOOKING_PROPOSAL_READ_SCOPES);

export const BookingProposalReadModelProposedServiceSchema = z
  .object({
    startsAt: CanonicalTimestampSchema,
    endsAt: CanonicalTimestampSchema,
    timeZone: IanaTimeZoneSchema,
    durationMinutes: z.number().finite().int().positive().max(24 * 60),
  })
  .strict();

export const BookingProposalReadModelLifecycleSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open') }).strict(),
  z
    .object({
      status: z.literal('accepted'),
      acceptedAt: CanonicalTimestampSchema,
      resultingBookingId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z.object({ status: z.literal('declined'), declinedAt: CanonicalTimestampSchema }).strict(),
  z.object({ status: z.literal('expired'), expiredAt: CanonicalTimestampSchema }).strict(),
  z.object({ status: z.literal('unavailable'), unavailableAt: CanonicalTimestampSchema }).strict(),
  z
    .object({
      status: z.literal('cancelled'),
      cancelledAt: CanonicalTimestampSchema,
      reasonCode: BookingProposalCancellationReasonCodeSchema,
    })
    .strict(),
]);

export const BookingProposalReadModelSchema = z
  .object({
    proposalId: BookingProposalIdSchema,
    revision: AggregateRevisionSchema,
    participantId: ParticipantIdSchema,
    instructorId: InstructorIdSchema,
    participantDisplayName: z.string().trim().min(1).max(200),
    instructorDisplayName: z.string().trim().min(1).max(200),
    proposedService: BookingProposalReadModelProposedServiceSchema,
    lifecycle: BookingProposalReadModelLifecycleSchema,
    authorizedActions: BookingProposalReadModelAuthorizedActionsSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type BookingProposalReadModel = z.output<typeof BookingProposalReadModelSchema>;

export const QueryBookingProposalReadModelsInputSchema = z
  .object({
    scope: BookingProposalReadScopeSchema,
  })
  .strict();

export type QueryBookingProposalReadModelsInput = z.output<
  typeof QueryBookingProposalReadModelsInputSchema
>;

export const QueryBookingProposalReadModelsResultSchema = z
  .object({
    scope: BookingProposalReadScopeSchema,
    items: z.array(BookingProposalReadModelSchema),
  })
  .strict();

export type QueryBookingProposalReadModelsResult = z.output<
  typeof QueryBookingProposalReadModelsResultSchema
>;

export const FORBIDDEN_BOOKING_PROPOSAL_READ_INPUT_KEYS = [
  'accountId',
  'instructorId',
  'participantId',
  'actorId',
] as const;

export function rejectSpoofedBookingProposalReadInput(input: Record<string, unknown>): void {
  for (const key of FORBIDDEN_BOOKING_PROPOSAL_READ_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}
