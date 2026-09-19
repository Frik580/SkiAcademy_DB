import { z } from 'zod';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_PEOPLE_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_PEOPLE_REVISION_DOCUMENT_ID = 'admin_people' as const;

export const AdminPeopleRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminPeopleRevisionDocument = Readonly<
  z.output<typeof AdminPeopleRevisionDocumentSchema>
>;

export const AdminPeopleRevisionPayloadSchema = z
  .object({
    adminPeopleRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminPeopleRevisionPayload = Readonly<
  z.output<typeof AdminPeopleRevisionPayloadSchema>
>;
