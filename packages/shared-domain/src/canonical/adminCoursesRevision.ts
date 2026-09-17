import { z } from 'zod';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_COURSES_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_COURSES_REVISION_DOCUMENT_ID = 'admin_courses' as const;

export const AdminCoursesRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminCoursesRevisionDocument = Readonly<
  z.output<typeof AdminCoursesRevisionDocumentSchema>
>;

export const AdminCoursesRevisionPayloadSchema = z
  .object({
    adminCoursesRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminCoursesRevisionPayload = Readonly<
  z.output<typeof AdminCoursesRevisionPayloadSchema>
>;
