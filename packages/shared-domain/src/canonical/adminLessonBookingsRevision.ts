import { z } from 'zod';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_LESSON_BOOKINGS_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_LESSON_BOOKINGS_REVISION_DOCUMENT_ID = 'admin_lesson_bookings' as const;

export const AdminLessonBookingsRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminLessonBookingsRevisionDocument = Readonly<
  z.output<typeof AdminLessonBookingsRevisionDocumentSchema>
>;

export const AdminLessonBookingsRevisionPayloadSchema = z
  .object({
    adminLessonBookingsRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminLessonBookingsRevisionPayload = Readonly<
  z.output<typeof AdminLessonBookingsRevisionPayloadSchema>
>;
