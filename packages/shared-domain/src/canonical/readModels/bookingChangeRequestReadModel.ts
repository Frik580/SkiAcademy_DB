import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
} from '../identifiers';
import {
  BookingChangeRequestTypeSchema,
  BookingChangeRequestResolutionSchema,
} from '../bookingOccurrenceProposalChange';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
} from '../primitives';
import {
  AdminBookingChangeRequestReadModelAuthorizedActionsSchema,
  BookingChangeRequestReadModelAuthorizedActionsSchema,
} from './readModelAuthorizedActions';

export const BOOKING_CHANGE_REQUEST_READ_SCOPES = [
  'account_open',
  'instructor_open',
  'admin_open',
  'admin_detail',
] as const;
export type BookingChangeRequestReadScope = (typeof BOOKING_CHANGE_REQUEST_READ_SCOPES)[number];

export const BookingChangeRequestReadScopeSchema = z.enum(BOOKING_CHANGE_REQUEST_READ_SCOPES);

export const BOOKING_CHANGE_REQUEST_ATTENTION_SOURCE_KIND = 'booking_change_request' as const;

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

export const BookingChangeRequestAttentionSourceRefSchema = z
  .object({
    sourceKind: z.literal(BOOKING_CHANGE_REQUEST_ATTENTION_SOURCE_KIND),
    bookingChangeRequestId: BookingChangeRequestIdSchema,
  })
  .strict();

export type BookingChangeRequestAttentionSourceRef = z.output<
  typeof BookingChangeRequestAttentionSourceRefSchema
>;

export const AdminBookingChangeRequestInboxItemSchema = z
  .object({
    sourceRef: BookingChangeRequestAttentionSourceRefSchema,
    requestId: BookingChangeRequestIdSchema,
    revision: AggregateRevisionSchema,
    bookingId: BookingIdSchema,
    bookingRevision: AggregateRevisionSchema,
    requestType: BookingChangeRequestTypeSchema,
    reason: z.string().trim().min(1).max(2_000),
    lifecycle: BookingChangeRequestReadModelLifecycleSchema,
    instructor: z
      .object({
        instructorId: InstructorIdSchema,
        displayName: z.string().trim().min(1).max(200),
      })
      .strict(),
    participants: z
      .array(
        z
          .object({
            participantId: ParticipantIdSchema,
            displayName: z.string().trim().min(1).max(200),
          })
          .strict()
      )
      .min(1)
      .max(16),
    occurrence: z
      .object({
        startsAt: CanonicalTimestampSchema,
        endsAt: CanonicalTimestampSchema,
        timeZone: IanaTimeZoneSchema,
      })
      .strict(),
    authorizedActions: AdminBookingChangeRequestReadModelAuthorizedActionsSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminBookingChangeRequestInboxItem = z.output<
  typeof AdminBookingChangeRequestInboxItemSchema
>;

export const AdminBookingChangeRequestDetailReadModelSchema =
  AdminBookingChangeRequestInboxItemSchema.extend({
    actionRequirement: z.literal('action_required'),
  }).strict();

export type AdminBookingChangeRequestDetailReadModel = z.output<
  typeof AdminBookingChangeRequestDetailReadModelSchema
>;

export const QueryBookingChangeRequestReadModelsInputSchema = z
  .object({
    scope: BookingChangeRequestReadScopeSchema,
    requestId: BookingChangeRequestIdSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === 'admin_detail') {
      if (!input.requestId) {
        context.addIssue({
          code: 'custom',
          path: ['requestId'],
          message: 'requestId is required for admin_detail scope',
        });
      }
    } else if (input.requestId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['requestId'],
        message: 'requestId is only allowed for admin_detail scope',
      });
    }
  });

export type QueryBookingChangeRequestReadModelsInput = z.output<
  typeof QueryBookingChangeRequestReadModelsInputSchema
>;

const BookingChangeRequestCollaborationReadModelsResultSchema = z
  .object({
    scope: z.enum(['account_open', 'instructor_open']),
    items: z.array(BookingChangeRequestReadModelSchema),
  })
  .strict();

const AdminBookingChangeRequestOpenReadModelsResultSchema = z
  .object({
    scope: z.literal('admin_open'),
    items: z.array(AdminBookingChangeRequestInboxItemSchema),
  })
  .strict();

const AdminBookingChangeRequestDetailReadModelsResultSchema = z
  .object({
    scope: z.literal('admin_detail'),
    item: AdminBookingChangeRequestDetailReadModelSchema.optional(),
  })
  .strict();

export const QueryBookingChangeRequestReadModelsResultSchema = z.discriminatedUnion('scope', [
  BookingChangeRequestCollaborationReadModelsResultSchema,
  AdminBookingChangeRequestOpenReadModelsResultSchema,
  AdminBookingChangeRequestDetailReadModelsResultSchema,
]);

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
