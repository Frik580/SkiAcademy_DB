"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceClaimGuardBucketIdentityInputSchema = exports.ResourceClaimIdentityInputSchema = void 0;
exports.canonicalDeterministicHash = canonicalDeterministicHash;
exports.assertNoPersonalDataInDeterministicIdentityInput = assertNoPersonalDataInDeterministicIdentityInput;
exports.validateDeterministicIdentityInputs = validateDeterministicIdentityInputs;
exports.activityLogIdFromCommandId = activityLogIdFromCommandId;
exports.domainOutboxIdFromCommand = domainOutboxIdFromCommand;
exports.monetaryEventIdFromCommandEffect = monetaryEventIdFromCommandEffect;
exports.resourceClaimIdFromIdentity = resourceClaimIdFromIdentity;
exports.resourceClaimGuardBucketKeyFromIdentity = resourceClaimGuardBucketKeyFromIdentity;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const DETERMINISTIC_ID_PART_SEPARATOR = '\u001f';
const PERSONAL_DATA_PATTERNS = [
    /@/,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b\+?\d[\d\s().-]{7,}\d\b/,
    /\b\d{3}-\d{2}-\d{4}\b/,
];
function canonicalDeterministicHash(parts) {
    const payload = parts.join(DETERMINISTIC_ID_PART_SEPARATOR);
    return (0, node_crypto_1.createHash)('sha256').update(payload, 'utf8').digest('hex');
}
function assertNoPersonalDataInDeterministicIdentityInput(value, path) {
    for (const pattern of PERSONAL_DATA_PATTERNS) {
        if (pattern.test(value)) {
            throw new Error(`Deterministic identity input at ${path.join('.')} must not contain personal data`);
        }
    }
}
function validateDeterministicIdentityInputs(inputs, context) {
    for (const [key, value] of Object.entries(inputs)) {
        for (const pattern of PERSONAL_DATA_PATTERNS) {
            if (pattern.test(value)) {
                context.addIssue({
                    code: 'custom',
                    path: [key],
                    message: 'Deterministic identity inputs must not contain personal data',
                });
            }
        }
    }
}
function activityLogIdFromCommandId(commandId) {
    return identifiers_1.ActivityLogIdSchema.parse(canonicalDeterministicHash(['audit:v1', commandId]));
}
function domainOutboxIdFromCommand(commandId, deliveryEffectOrdinal) {
    return identifiers_1.DomainOutboxIdSchema.parse(canonicalDeterministicHash(['outbox:v1', commandId, String(deliveryEffectOrdinal)]));
}
function monetaryEventIdFromCommandEffect(commandId, effectOrdinal) {
    return identifiers_1.MonetaryEventIdSchema.parse(canonicalDeterministicHash(['monetary:v1', commandId, String(effectOrdinal)]));
}
exports.ResourceClaimIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal('claim:v1'),
    claimKind: zod_1.z.string().min(1).max(64),
    resourceKind: zod_1.z.string().min(1).max(64),
    resourceId: zod_1.z.string().min(1).max(128),
    ownerKind: zod_1.z.string().min(1).max(64),
    ownerId: zod_1.z.string().min(1).max(128),
    occurrenceId: zod_1.z.string().min(1).max(128),
})
    .strict()
    .superRefine((input, context) => {
    validateDeterministicIdentityInputs({
        claimKind: input.claimKind,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        ownerKind: input.ownerKind,
        ownerId: input.ownerId,
        occurrenceId: input.occurrenceId,
    }, context);
});
function resourceClaimIdFromIdentity(input) {
    const parsed = exports.ResourceClaimIdentityInputSchema.parse(input);
    return identifiers_1.ResourceClaimIdSchema.parse(canonicalDeterministicHash([
        parsed.strategyVersion,
        parsed.claimKind,
        parsed.resourceKind,
        parsed.resourceId,
        parsed.ownerKind,
        parsed.ownerId,
        parsed.occurrenceId,
    ]));
}
exports.ResourceClaimGuardBucketIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal('guard:v1'),
    resourceKind: zod_1.z.string().min(1).max(64),
    resourceId: zod_1.z.string().min(1).max(128),
    bucketStartSeconds: zod_1.z.number().finite().int().nonnegative(),
})
    .strict()
    .superRefine((input, context) => {
    validateDeterministicIdentityInputs({
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
    }, context);
});
function resourceClaimGuardBucketKeyFromIdentity(input) {
    const parsed = exports.ResourceClaimGuardBucketIdentityInputSchema.parse(input);
    return canonicalDeterministicHash([
        parsed.strategyVersion,
        parsed.resourceKind,
        parsed.resourceId,
        String(parsed.bucketStartSeconds),
    ]);
}
