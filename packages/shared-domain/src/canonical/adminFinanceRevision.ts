import { z } from 'zod';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const ADMIN_FINANCE_REVISION_COLLECTION = 'admin_runtime' as const;
export const ADMIN_FINANCE_REVISION_DOCUMENT_ID = 'admin_finance' as const;

export const AdminFinanceRevisionDocumentSchema = z
  .object({
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminFinanceRevisionDocument = Readonly<
  z.output<typeof AdminFinanceRevisionDocumentSchema>
>;

export const AdminFinanceRevisionPayloadSchema = z
  .object({
    adminFinanceRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminFinanceRevisionPayload = Readonly<
  z.output<typeof AdminFinanceRevisionPayloadSchema>
>;
