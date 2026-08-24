"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledIdempotencySubjectIdSchema = void 0;
exports.buildScheduledCommandIdempotencyKey = buildScheduledCommandIdempotencyKey;
exports.buildProviderCallbackIdempotencyKey = buildProviderCallbackIdempotencyKey;
const zod_1 = require("zod");
const commandContext_1 = require("./commands/commandContext");
const SCHEDULED_IDEMPOTENCY_KEY_PREFIX = 'sched';
const PERSONAL_DATA_PATTERNS = [/@/, /\b\+?\d[\d\s().-]{7,}\d\b/];
exports.ScheduledIdempotencySubjectIdSchema = zod_1.z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
function buildScopedIdempotencyKey(parts) {
    const candidate = [SCHEDULED_IDEMPOTENCY_KEY_PREFIX, ...parts].join(':');
    const parsed = commandContext_1.IdempotencyKeySchema.safeParse(candidate);
    if (!parsed.success) {
        throw new Error('Scheduled idempotency key exceeds canonical bounds');
    }
    return parsed.data;
}
function assertOpaqueIdempotencyMaterial(fieldName, value) {
    for (const pattern of PERSONAL_DATA_PATTERNS) {
        if (pattern.test(value)) {
            throw new Error(`${fieldName} must not contain personal data`);
        }
    }
    const parsed = exports.ScheduledIdempotencySubjectIdSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`${fieldName} must use opaque identifiers`);
    }
}
function buildScheduledCommandIdempotencyKey(input) {
    assertOpaqueIdempotencyMaterial('subjectId', input.subjectId);
    if (input.occurrenceId !== undefined) {
        assertOpaqueIdempotencyMaterial('occurrenceId', input.occurrenceId);
    }
    const parts = [input.systemActorId, input.commandKind, input.subjectId];
    if (input.occurrenceId !== undefined) {
        parts.push(input.occurrenceId);
    }
    return buildScopedIdempotencyKey(parts);
}
function buildProviderCallbackIdempotencyKey(providerEventId) {
    const normalized = providerEventId.trim();
    if (!normalized) {
        throw new Error('Provider event id is required for callback idempotency');
    }
    assertOpaqueIdempotencyMaterial('providerEventId', normalized);
    return buildScopedIdempotencyKey(['provider', normalized]);
}
