"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderEventReceiptSchema = exports.ProviderEventReceiptOutcomeSchema = exports.PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION = void 0;
exports.providerEventReceiptIdFromProviderEvent = providerEventReceiptIdFromProviderEvent;
exports.buildProviderEventReceipt = buildProviderEventReceipt;
exports.providerReceiptMatchesEvent = providerReceiptMatchesEvent;
exports.isProviderReceiptFresh = isProviderReceiptFresh;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const primitives_1 = require("./primitives");
const deterministicIdentity_1 = require("./deterministicIdentity");
exports.PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION = 'provider_receipt:v1';
exports.ProviderEventReceiptOutcomeSchema = zod_1.z.enum(['applied', 'rejected']);
exports.ProviderEventReceiptSchema = zod_1.z
    .object({
    schemaVersion: zod_1.z.literal(exports.PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION),
    receiptId: identifiers_1.ProviderEventReceiptIdSchema,
    providerKind: zod_1.z.string().trim().min(1).max(64),
    providerEventId: zod_1.z.string().trim().min(1).max(128),
    paymentId: identifiers_1.PaymentIdSchema.optional(),
    walletAccountId: zod_1.z.string().trim().min(1).max(128).optional(),
    commandId: identifiers_1.CommandIdSchema,
    monetaryEventIds: zod_1.z.array(identifiers_1.MonetaryEventIdSchema).max(32),
    outcome: exports.ProviderEventReceiptOutcomeSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
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
function providerEventReceiptIdFromProviderEvent(input) {
    return identifiers_1.ProviderEventReceiptIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([
        'provider_receipt:v1',
        input.providerKind.trim(),
        input.providerEventId.trim(),
    ]));
}
function buildProviderEventReceipt(input) {
    return exports.ProviderEventReceiptSchema.parse({
        schemaVersion: exports.PROVIDER_EVENT_RECEIPT_SCHEMA_VERSION,
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
function providerReceiptMatchesEvent(receipt, providerKind, providerEventId) {
    return (receipt.providerKind === providerKind.trim() && receipt.providerEventId === providerEventId.trim());
}
function isProviderReceiptFresh(receipt, recordedAt) {
    return (0, primitives_1.compareCanonicalTimestamps)(recordedAt, receipt.createdAt) >= 0;
}
