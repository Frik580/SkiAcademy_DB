"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandIdempotencyRecordSchema = exports.StoredCommandResultSchema = exports.COMMAND_IDEMPOTENCY_COMPLETION_STATES = exports.COMMAND_IDEMPOTENCY_SCHEMA_VERSION = void 0;
exports.deriveCommandKey = deriveCommandKey;
exports.resolveCommandIdempotencyIdentity = resolveCommandIdempotencyIdentity;
exports.parseCommandIdempotencyRecord = parseCommandIdempotencyRecord;
exports.shouldPersistIdempotencyOutcome = shouldPersistIdempotencyOutcome;
exports.toStoredCommandResult = toStoredCommandResult;
exports.fromStoredCommandResult = fromStoredCommandResult;
const zod_1 = require("zod");
const commandActorScope_1 = require("./commandActorScope");
const commandFingerprint_1 = require("./commandFingerprint");
const commandEnvelope_1 = require("./commands/commandEnvelope");
const commandResults_1 = require("./commands/commandResults");
const deterministicIdentity_1 = require("./deterministicIdentity");
const errors_1 = require("./errors");
const identifiers_1 = require("./identifiers");
const paths_1 = require("./paths");
const primitives_1 = require("./primitives");
exports.COMMAND_IDEMPOTENCY_SCHEMA_VERSION = 'idempotency:v1';
exports.COMMAND_IDEMPOTENCY_COMPLETION_STATES = ['completed', 'rejected'];
const COMMAND_KEY_PREFIX = 'command-key:v1';
exports.StoredCommandResultSchema = zod_1.z.discriminatedUnion('status', [
    commandResults_1.CommandSuccessResultSchema,
    zod_1.z
        .object({
        status: zod_1.z.literal('error'),
        kind: commandEnvelope_1.CommandKindSchema,
        correlationId: identifiers_1.CorrelationIdSchema,
        error: errors_1.CommandErrorTransportSchema,
    })
        .strict(),
]);
exports.CommandIdempotencyRecordSchema = zod_1.z
    .object({
    schemaVersion: zod_1.z.literal(exports.COMMAND_IDEMPOTENCY_SCHEMA_VERSION),
    actorScope: zod_1.z.string().min(1),
    commandKind: commandEnvelope_1.CommandKindSchema,
    fingerprint: commandFingerprint_1.CommandFingerprintSchema,
    completionState: zod_1.z.enum(exports.COMMAND_IDEMPOTENCY_COMPLETION_STATES),
    result: exports.StoredCommandResultSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    decidedAt: primitives_1.CanonicalTimestampSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
})
    .strict();
function deriveCommandKey(actorScope, idempotencyKey) {
    return identifiers_1.CommandIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([COMMAND_KEY_PREFIX, actorScope, idempotencyKey]));
}
function resolveCommandIdempotencyIdentity(envelope) {
    const actorScope = (0, commandActorScope_1.encodeCommandActorScope)(envelope.context.actor);
    const commandKey = deriveCommandKey(actorScope, envelope.context.idempotencyKey);
    const fingerprint = (0, commandFingerprint_1.computeCommandFingerprintFromEnvelope)(envelope);
    return {
        commandKey,
        actorScope,
        fingerprint,
        recordPath: paths_1.canonicalPaths.commandIdempotency(commandKey),
    };
}
function parseCommandIdempotencyRecord(input) {
    return exports.CommandIdempotencyRecordSchema.safeParse(input);
}
function shouldPersistIdempotencyOutcome(result) {
    if (result.status === 'success') {
        return true;
    }
    return !result.error.retryable;
}
function toStoredCommandResult(result) {
    return exports.StoredCommandResultSchema.parse(result);
}
function fromStoredCommandResult(stored, kind) {
    if (stored.kind !== kind) {
        throw new Error('Stored command result kind does not match requested kind');
    }
    return stored;
}
