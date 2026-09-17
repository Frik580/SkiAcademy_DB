import { z } from 'zod';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_PLANNER_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_PLANNER_REVISION_DOCUMENT_ID = 'admin_planner' as const;

export const AdminPlannerRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminPlannerRevisionDocument = Readonly<
  z.output<typeof AdminPlannerRevisionDocumentSchema>
>;

export const AdminPlannerRevisionPayloadSchema = z
  .object({
    adminPlannerRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminPlannerRevisionPayload = Readonly<
  z.output<typeof AdminPlannerRevisionPayloadSchema>
>;
