"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandSuccessResultSchema = void 0;
exports.commandSuccessResult = commandSuccessResult;
exports.commandErrorResult = commandErrorResult;
const zod_1 = require("zod");
const identifiers_1 = require("../identifiers");
const commandEnvelope_1 = require("./commandEnvelope");
const commandResultPayloads_1 = require("./commandResultPayloads");
exports.CommandSuccessResultSchema = zod_1.z
    .object({
    status: zod_1.z.literal('success'),
    kind: commandEnvelope_1.CommandKindSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    payload: zod_1.z.unknown().optional(),
})
    .strict();
function commandSuccessResult(kind, correlationId, payload) {
    if (payload === undefined) {
        return { status: 'success', kind, correlationId };
    }
    return {
        status: 'success',
        kind,
        correlationId,
        payload: commandResultPayloads_1.CommandResultPayloadSchemaByKind[kind].parse(payload),
    };
}
function commandErrorResult(kind, correlationId, error) {
    return { status: 'error', kind, correlationId, error };
}
