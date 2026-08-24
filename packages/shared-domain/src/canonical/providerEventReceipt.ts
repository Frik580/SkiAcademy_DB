import { z } from 'zod';
import {
  CommandIdSchema,
  MonetaryEventIdSchema,
  PaymentIdSchema,
  ProviderEventReceiptIdSchema,
  type AccountId,
  type MonetaryEventId,
  type PaymentId,
  type ProviderEventReceiptId,
} from './identifiers';
import { CanonicalTimestampSchema, compareCanonicalTimestamps } from './primitives';
import { canonicalDeterministicHash } from './deterministicIdentity';

export const PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION = 'provider_receipt:v1' as const;

export const ProviderEventReceiptOutcomeSchema = z.enum(['applied', 'rejected']);

export const ProviderEventReceiptSchema = z
  .object({
    schemaVersion: z.literal(PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION),
    receiptId: ProviderEventReceiptIdSchema,
    providerKind: z.string().trim().min(1).max(64),
    providerEventId: z.string().trim().min(1).max(128),
    paymentId: PaymentIdSchema.optional(),
    walletAccountId: z.string().trim().min(1).max(128).optional(),
    commandId: CommandIdSchema,
    monetaryEventIds: z.array(MonetaryEventIdSchema).max(32),
    outcome: ProviderEventReceiptOutcomeSchema,
    createdAt: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    const expectedId = providerEventReceiptIdFromProviderEvent({
      providerKind: receipt.providerKind,
      providerEventId: receipt.providerEventId,
    });
    if (receipt.receiptId !== expectedId) {
      context.addIssue({
        code: 'custom',
        path: ['receiptId'],
        message: 'receiptId must match deterministic provider event identity',
      });
    }
  });

export type ProviderEventReceipt = Readonly<z.output<typeof ProviderEventReceiptSchema>>;

export function providerEventReceiptIdFromProviderEvent(input: {
  readonly providerKind: string;
  readonly providerEventId: string;
}): ProviderEventReceiptId {
  return ProviderEventReceiptIdSchema.parse(
    canonicalDeterministicHash([
      'provider_receipt:v1',
      input.providerKind.trim(),
      input.providerEventId.trim(),
    ])
  );
}

export function buildProviderEventReceipt(input: {
  readonly providerKind: string;
  readonly providerEventId: string;
  readonly paymentId?: PaymentId;
  readonly walletAccountId?: AccountId;
  readonly commandId: z.output<typeof CommandIdSchema>;
  readonly monetaryEventIds: readonly MonetaryEventId[];
  readonly outcome: z.output<typeof ProviderEventReceiptOutcomeSchema>;
  readonly createdAt: z.output<typeof CanonicalTimestampSchema>;
}): ProviderEventReceipt {
  return ProviderEventReceiptSchema.parse({
    schemaVersion: PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION,
    receiptId: providerEventReceiptIdFromProviderEvent({
      providerKind: input.providerKind,
      providerEventId: input.providerEventId,
    }),
    providerKind: input.providerKind,
    providerEventId: input.providerEventId,
    ...(input.paymentId === undefined ? {} : { paymentId: input.paymentId }),
    ...(input.walletAccountId === undefined ? {} : { walletAccountId: input.walletAccountId }),
    commandId: input.commandId,
    monetaryEventIds: [...input.monetaryEventIds],
    outcome: input.outcome,
    createdAt: input.createdAt,
  });
}

export function providerReceiptMatchesEvent(
  receipt: Pick<ProviderEventReceipt, 'providerKind' | 'providerEventId'>,
  providerKind: string,
  providerEventId: string
): boolean {
  return (
    receipt.providerKind === providerKind.trim() && receipt.providerEventId === providerEventId.trim()
  );
}

export function isProviderReceiptFresh(
  receipt: Pick<ProviderEventReceipt, 'createdAt'>,
  recordedAt: z.output<typeof CanonicalTimestampSchema>
): boolean {
  return compareCanonicalTimestamps(recordedAt, receipt.createdAt) >= 0;
}
