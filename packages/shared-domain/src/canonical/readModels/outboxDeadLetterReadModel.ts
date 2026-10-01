import { z } from 'zod';
import {
  OUTBOX_DELIVERY_CHANNELS,
  OUTBOX_DELIVERY_MAX_ATTEMPTS,
  type DomainOutboxObligation,
} from '../auditOutbox';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { DomainOutboxIdSchema } from '../identifiers';
import { CanonicalTimestampSchema } from '../primitives';
import { OUTBOX_DEAD_LETTER_PAGE_LIMIT } from '../outboxDeliveryLifecycle';

export const QueryOutboxDeadLetterReadModelInputSchema = z
  .object({
    scope: z.literal('outbox_dead_letters'),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryOutboxDeadLetterReadModelInput = z.output<
  typeof QueryOutboxDeadLetterReadModelInputSchema
>;

/**
 * Operator signal for one terminal outbox failure.
 * Identity is the outbox id, so a repeated worker run cannot create a second signal.
 * Recipient addresses, message bodies, tokens, and credentials are not part of this contract.
 */
export const OutboxDeadLetterSignalSchema = z
  .object({
    outboxId: DomainOutboxIdSchema,
    templateId: z.string().min(1).max(64),
    channel: z.enum(OUTBOX_DELIVERY_CHANNELS),
    attemptCount: z.number().int().min(0).max(OUTBOX_DELIVERY_MAX_ATTEMPTS),
    errorCode: z.string().min(1).max(64),
    createdAt: CanonicalTimestampSchema,
    deadLetteredAt: CanonicalTimestampSchema,
  })
  .strict();

export type OutboxDeadLetterSignal = z.output<typeof OutboxDeadLetterSignalSchema>;

export const QueryOutboxDeadLetterReadModelResultSchema = z
  .object({
    scope: z.literal('outbox_dead_letters'),
    items: z.array(OutboxDeadLetterSignalSchema).max(OUTBOX_DEAD_LETTER_PAGE_LIMIT),
  })
  .strict();

export type QueryOutboxDeadLetterReadModelResult = z.output<
  typeof QueryOutboxDeadLetterReadModelResultSchema
>;

export function projectOutboxDeadLetter(
  obligation: DomainOutboxObligation
): OutboxDeadLetterSignal | undefined {
  if (obligation.delivery.status !== 'dead_letter') return undefined;
  return OutboxDeadLetterSignalSchema.parse({
    outboxId: obligation.outboxId,
    templateId: obligation.templateId,
    channel: obligation.channel,
    attemptCount: obligation.delivery.attemptCount ?? 0,
    errorCode: obligation.delivery.lastErrorCode,
    createdAt: obligation.createdAt,
    deadLetteredAt: obligation.delivery.deadLetteredAt,
  });
}
