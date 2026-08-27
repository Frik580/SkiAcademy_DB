import { z } from 'zod';
import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
} from '../identifiers';
import {
  BookingChangeRequestTypeSchema,
  BookingChangeRequestResolutionSchema,
} from '../bookingOccurrenceProposalChange';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';
import { BookingChangeRequestReadModelAuthorizedActionsSchema } from './readModelAuthorizedActions';

export const BOOKING_CHANGE_REQUEST_READ_SCOPES = ['account_open', 'instructor_open'] as const;
export type BookingChangeRequestReadScope = (typeof BOOKING_CHANGE_REQUEST_READ_SCOPES)[number];

export const BookingChangeRequestReadScopeSchema = z.enum(BOOKING_CHANGE_REQUEST_READ_SCOPES);

export const BookingChangeRequestReadModelLifecycleSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open') }).strict(),
  z
    .object({
      status: z.literal('resolved'),
      resolvedAt: CanonicalTimestampSchema,
      resolution: BookingChangeRequestResolutionSchema,
    })
    .strict(),
  z.object({ status: z.literal('cancelled'), cancelledAt: CanonicalTimestampSchema }).strict(),
]);

export const BookingChangeRequestReadModelSchema = z
  .object({
    requestId: BookingChangeRequestIdSchema,
    revision: AggregateRevisionSchema,
    bookingId: BookingIdSchema,
    requestType: BookingChangeRequestTypeSchema,
    reason: z.string().trim().min(1).max(2_000),
    lifecycle: BookingChangeRequestReadModelLifecycleSchema,
    authorizedActions: BookingChangeRequestReadModelAuthorizedActionsSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type BookingChangeRequestReadModel = z.output<typeof BookingChangeRequestReadModelSchema>;

export const QueryBookingChangeRequestReadModelsInputSchema = z
  .object({
    scope: BookingChangeRequestReadScopeSchema,
  })
  .strict();

export type QueryBookingChangeRequestReadModelsInput = z.output<
  typeof QueryBookingChangeRequestReadModelsInputSchema
>;

export const QueryBookingChangeRequestReadModelsResultSchema = z
  .object({
    scope: BookingChangeRequestReadScopeSchema,
    items: z.array(BookingChangeRequestReadModelSchema),
  })
  .strict();

export type QueryBookingChangeRequestReadModelsResult = z.output<
  typeof QueryBookingChangeRequestReadModelsResultSchema
>;

export const FORBIDDEN_BOOKING_CHANGE_REQUEST_READ_INPUT_KEYS = [
  'accountId',
  'instructorId',
  'bookingId',
  'actorId',
] as const;

export function rejectSpoofedBookingChangeRequestReadInput(input: Record<string, unknown>): void {
  for (const key of FORBIDDEN_BOOKING_CHANGE_REQUEST_READ_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}
