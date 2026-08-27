"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_ACTOR_KIND_CONSTRAINTS = exports.CommandContextSchema = exports.CommandCalendarInputSchema = exports.CommandTransportMetadataSchema = exports.IdempotencyKeySchema = exports.COMMAND_SOURCES = void 0;
exports.isSourceCompatibleWithActorKind = isSourceCompatibleWithActorKind;
const zod_1 = require("zod");
const auditOutbox_1 = require("../auditOutbox");
const identifiers_1 = require("../identifiers");
const primitives_1 = require("../primitives");
const actors_1 = require("./actors");
const capabilities_1 = require("./capabilities");
var auditOutbox_2 = require("../auditOutbox");
Object.defineProperty(exports, "COMMAND_SOURCES", { enumerable: true, get: function () { return auditOutbox_2.COMMAND_SOURCES; } });
exports.IdempotencyKeySchema = zod_1.z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,200}$/, 'idempotencyKey has an invalid format');
exports.CommandTransportMetadataSchema = zod_1.z
    .record(zod_1.z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), zod_1.z.string().max(256))
    .refine((value) => Object.keys(value).length <= 16, 'Transport metadata is bounded');
exports.CommandCalendarInputSchema = zod_1.z
    .object({
    localDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTime: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: zod_1.z
        .number()
        .finite()
        .int()
        .positive()
        .max(24 * 60),
})
    .strict();
exports.CommandContextSchema = zod_1.z
    .object({
    actor: actors_1.CommandActorSchema,
    exercisedCapability: zod_1.z.enum(capabilities_1.EXERCISED_CAPABILITIES),
    idempotencyKey: exports.IdempotencyKeySchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    causationId: identifiers_1.CausationIdSchema.optional(),
    expectedRevision: primitives_1.AggregateRevisionSchema.optional(),
    expectedParticipantManagementRevision: primitives_1.AggregateRevisionSchema.optional(),
    source: zod_1.z.enum(auditOutbox_1.COMMAND_SOURCES),
    transportMetadata: exports.CommandTransportMetadataSchema.optional(),
    calendarInput: exports.CommandCalendarInputSchema.optional(),
    timezone: primitives_1.IanaTimeZoneSchema.optional(),
})
    .strict();
exports.SOURCE_ACTOR_KIND_CONSTRAINTS = {
    client_callable: ['account'],
    admin_callable: ['account'],
    guest_callable: ['guest'],
    scheduler: ['system'],
    provider_callback: ['provider'],
    system_reconciliation: ['system'],
};
function isSourceCompatibleWithActorKind(source, actorKind) {
    return exports.SOURCE_ACTOR_KIND_CONSTRAINTS[source].includes(actorKind);
}
