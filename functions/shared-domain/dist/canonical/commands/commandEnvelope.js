"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandEnvelopeSchema = exports.CommandKindSchema = void 0;
exports.parseCommandEnvelope = parseCommandEnvelope;
const zod_1 = require("zod");
const commandKinds_1 = require("./commandKinds");
const commandContext_1 = require("./commandContext");
const commandIntents_1 = require("./commandIntents");
const forbiddenFields_1 = require("./forbiddenFields");
exports.CommandKindSchema = zod_1.z.enum(commandKinds_1.COMMAND_KINDS);
function envelopeSchemaForKind(kind) {
    return zod_1.z
        .object({
        kind: zod_1.z.literal(kind),
        context: commandContext_1.CommandContextSchema,
        intent: commandIntents_1.CommandIntentSchemaByKind[kind],
    })
        .strict();
}
const envelopeSchemas = commandKinds_1.COMMAND_KINDS.map((kind) => envelopeSchemaForKind(kind));
exports.CommandEnvelopeSchema = zod_1.z.discriminatedUnion('kind', envelopeSchemas);
function parseCommandEnvelope(input) {
    if ((0, forbiddenFields_1.containsForbiddenAuthoritativeFields)(input)) {
        return {
            success: false,
            error: new zod_1.z.ZodError([
                {
                    code: 'custom',
                    path: ['intent'],
                    message: 'Intent contains forbidden authoritative fields',
                },
            ]),
        };
    }
    return exports.CommandEnvelopeSchema.safeParse(input);
}
