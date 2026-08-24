"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT_EFFECT_REGISTRY_VERSION = void 0;
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
const DEFAULT_ALLOWED_EFFECTS = [
    'payment_state_changed',
    'wallet_balance_changed',
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'resource_claim_changed',
    'attendance_recorded',
    'admin_issue_opened',
    'admin_issue_resolved',
    'participant_access_changed',
    'audit_correction_recorded',
    'financial_correction_recorded',
    'outbox_obligation_created',
];
function allowedAuditEffectsForCommand(commandKind) {
    return COMMAND_KIND_ALLOWED_EFFECTS[commandKind] ?? DEFAULT_ALLOWED_EFFECTS;
}
function validateAuditEffectsForCommand(correlationId, commandKind, effects) {
    const allowed = new Set(allowedAuditEffectsForCommand(commandKind));
    for (const effect of effects) {
        if (!allowed.has(effect.kind)) {
            throw new errors_1.CanonicalCommandError('validation', {
                correlationId,
                details: { reason: 'unsupported', field: 'effects.kind' },
            });
        }
    }
}
