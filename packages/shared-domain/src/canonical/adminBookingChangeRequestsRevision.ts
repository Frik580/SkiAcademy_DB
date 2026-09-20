import { z } from 'zod';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_DOCUMENT_ID =
  'admin_booking_change_requests' as const;

export const AdminBookingChangeRequestsRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminBookingChangeRequestsRevisionDocument = Readonly<
  z.output<typeof AdminBookingChangeRequestsRevisionDocumentSchema>
>;

export const AdminBookingChangeRequestsRevisionPayloadSchema = z
  .object({
    adminBookingChangeRequestsRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminBookingChangeRequestsRevisionPayload = Readonly<
  z.output<typeof AdminBookingChangeRequestsRevisionPayloadSchema>
>;
