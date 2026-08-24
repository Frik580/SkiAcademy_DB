import { z } from 'zod';
import { CommandIdSchema, type AccountId, type MonetaryEventId, type PaymentId, type ProviderEventReceiptId } from './identifiers';
import { CanonicalTimestampSchema } from './primitives';
export declare const PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION: "provider_receipt:v1";
export declare const ProviderEventReceiptOutcomeSchema: z.ZodEnum<{
    rejected: "rejected";
    applied: "applied";
}>;
export declare const ProviderEventReceiptSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"provider_receipt:v1">;
    receiptId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"provider_event_receipt">, string>>;
    providerKind: z.ZodString;
    providerEventId: z.ZodString;
    paymentId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"payment">, string>>>;
    walletAccountId: z.ZodOptional<z.ZodString>;
    commandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    monetaryEventIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"monetary_event">, string>>>;
    outcome: z.ZodEnum<{
        rejected: "rejected";
        applied: "applied";
    }>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type ProviderEventReceipt = Readonly<z.output<typeof ProviderEventReceiptSchema>>;
export declare function providerEventReceiptIdFromProviderEvent(input: {
    readonly providerKind: string;
    readonly providerEventId: string;
}): ProviderEventReceiptId;
export declare function buildProviderEventReceipt(input: {
    readonly providerKind: string;
    readonly providerEventId: string;
    readonly paymentId?: PaymentId;
    readonly walletAccountId?: AccountId;
    readonly commandId: z.output<typeof CommandIdSchema>;
    readonly monetaryEventIds: readonly MonetaryEventId[];
    readonly outcome: z.output<typeof ProviderEventReceiptOutcomeSchema>;
    readonly createdAt: z.output<typeof CanonicalTimestampSchema>;
}): ProviderEventReceipt;
export declare function providerReceiptMatchesEvent(receipt: Pick<ProviderEventReceipt, 'providerKind' | 'providerEventId'>, providerKind: string, providerEventId: string): boolean;
export declare function isProviderReceiptFresh(receipt: Pick<ProviderEventReceipt, 'createdAt'>, recordedAt: z.output<typeof CanonicalTimestampSchema>): boolean;
