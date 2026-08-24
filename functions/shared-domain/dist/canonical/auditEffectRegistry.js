"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT_EFFECT_REGISTRY_VERSION = void 0;
exports.hasAuditEffectRegistryEntry = hasAuditEffectRegistryEntry;
exports.allowedAuditEffectsForCommand = allowedAuditEffectsForCommand;
exports.validateAuditEffectsForCommand = validateAuditEffectsForCommand;
const errors_1 = require("./errors");
exports.AUDIT_EFFECT_REGISTRY_VERSION = 'effect:v1';
const COMMAND_KIND_ALLOWED_EFFECTS = {
    complete_booking: ['booking_lifecycle_changed'],
    create_confirmed_booking: [
        'booking_lifecycle_changed',
        'payment_state_changed',
        'resource_claim_changed',
        'outbox_obligation_created',
    ],
    record_manual_wallet_funding: ['wallet_balance_changed', 'financial_correction_recorded'],
};
function hasAuditEffectRegistryEntry(commandKind) {
    return COMMAND_KIND_ALLOWED_EFFECTS[commandKind] !== undefined;
}
function allowedAuditEffectsForCommand(commandKind) {
    const allowed = COMMAND_KIND_ALLOWED_EFFECTS[commandKind];
    if (allowed === undefined) {
        return [];
    }
    return allowed;
}
function validateAuditEffectsForCommand(correlationId, commandKind, effects) {
    const allowedForKind = COMMAND_KIND_ALLOWED_EFFECTS[commandKind];
    if (allowedForKind === undefined) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'unsupported', field: 'effects.kind' },
        });
    }
    const allowed = new Set(allowedForKind);
    for (const effect of effects) {
        if (!allowed.has(effect.kind)) {
            throw new errors_1.CanonicalCommandError('validation', {
                correlationId,
                details: { reason: 'unsupported', field: 'effects.kind' },
            });
        }
    }
}
