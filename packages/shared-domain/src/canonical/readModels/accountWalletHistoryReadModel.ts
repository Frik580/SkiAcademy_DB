import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';

export const AccountWalletHistoryInputSchema = z
  .object({
    cursor: z.string().min(1).max(4096).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export const AccountWalletOperationSchema = z
  .object({
    id: z.string(),
    amount: z.number().finite(),
    balanceAfter: z.number().finite().optional(),
    currency: z.enum(['KZT', 'USD']),
    createdAt: z.string().datetime(),
    type: z.enum([
      'top_up',
      'starter_credit',
      'lesson_payment',
      'course_payment',
      'refund',
      'admin_adjustment',
      'guest_payment',
    ]),
    subjectName: z.string().optional(),
    bookingId: z.string().optional(),
    source: z.enum(['monetary_event', 'ledger']),
  })
  .strict();

export const AccountWalletHistoryResultSchema = z
  .object({
    operations: z.array(AccountWalletOperationSchema).max(30),
    nextCursor: z.string().optional(),
  })
  .strict();

export type AccountWalletOperation = z.infer<typeof AccountWalletOperationSchema>;
export type AccountWalletHistoryResult = z.infer<typeof AccountWalletHistoryResultSchema>;
