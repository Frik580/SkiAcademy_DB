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
    create_guest_booking_request: [
        'booking_lifecycle_changed',
        'payment_state_changed',
        'resource_claim_changed',
        'outbox_obligation_created',
    ],
    confirm_guest_booking: ['booking_lifecycle_changed', 'outbox_obligation_created'],
    link_guest_booking_to_account: ['participant_access_changed', 'outbox_obligation_created'],
    request_booking_cancellation: [
        'booking_lifecycle_changed',
        'payment_state_changed',
        'resource_claim_changed',
        'admin_issue_opened',
        'outbox_obligation_created',
    ],
    withdraw_booking_cancellation_request: ['booking_lifecycle_changed', 'outbox_obligation_created'],
    resolve_booking_cancellation: [
        'booking_lifecycle_changed',
        'payment_state_changed',
        'resource_claim_changed',
        'admin_issue_opened',
        'outbox_obligation_created',
    ],
    expire_guest_reservation: ['booking_lifecycle_changed', 'resource_claim_changed'],
    enforce_payment_start_gate: ['admin_issue_opened'],
    record_manual_wallet_funding: ['wallet_balance_changed', 'financial_correction_recorded'],
    record_provider_payment_event: ['payment_state_changed'],
    adjust_service_price: ['payment_state_changed', 'wallet_balance_changed'],
    create_participant: ['participant_access_changed'],
    update_participant_profile: ['participant_access_changed'],
    assign_participant_management: ['participant_access_changed'],
    revoke_participant_management: ['participant_access_changed'],
    create_instructor_relationship: ['participant_access_changed'],
    revoke_instructor_relationship: ['participant_access_changed'],
    block_participant: ['participant_access_changed'],
    unblock_participant: ['participant_access_changed'],
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
