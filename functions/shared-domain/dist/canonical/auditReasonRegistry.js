"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT_REASON_CODES = exports.AUDIT_REASON_REGISTRY_VERSION = void 0;
exports.hasAuditReasonRegistryEntry = hasAuditReasonRegistryEntry;
exports.isAuditExplanationRequired = isAuditExplanationRequired;
exports.validateAuditReason = validateAuditReason;
const errors_1 = require("./errors");
exports.AUDIT_REASON_REGISTRY_VERSION = 'reason:v1';
exports.AUDIT_REASON_CODES = [
    'self_service_booking',
    'self_service_completion',
    'scheduled_system_action',
    'provider_callback_processed',
    'manual_override',
    'manual_financial_correction',
    'attendance_correction',
    'admin_issue_dismissal',
    'audit_correction',
    'participant_management',
    'participant_access_control',
    'other',
];
const GLOBAL_REASON_CODES = new Set(exports.AUDIT_REASON_CODES);
const COMMAND_KIND_REASON_CODES = {
    complete_booking: ['self_service_completion', 'scheduled_system_action', 'other'],
    create_confirmed_booking: ['self_service_booking', 'manual_override', 'other'],
    enforce_payment_start_gate: ['scheduled_system_action', 'manual_override'],
    record_manual_wallet_funding: ['manual_financial_correction', 'manual_override', 'other'],
    record_provider_payment_event: ['provider_callback_processed', 'manual_override', 'other'],
    adjust_service_price: ['manual_override', 'other'],
    create_participant: ['participant_management', 'other'],
    update_participant_profile: ['participant_management', 'other'],
    assign_participant_management: ['participant_management', 'other'],
    revoke_participant_management: ['participant_management', 'other'],
    create_instructor_relationship: ['participant_management', 'manual_override', 'other'],
    revoke_instructor_relationship: ['participant_management', 'manual_override', 'other'],
    block_participant: ['participant_access_control', 'other'],
    unblock_participant: ['participant_access_control', 'other'],
};
function hasAuditReasonRegistryEntry(commandKind) {
    return COMMAND_KIND_REASON_CODES[commandKind] !== undefined;
}
const EXPLANATION_REQUIRED_REASON_CODES = new Set([
    'manual_override',
    'manual_financial_correction',
    'attendance_correction',
    'admin_issue_dismissal',
    'audit_correction',
    'other',
]);
function isAuditExplanationRequired(reasonCode) {
    if (EXPLANATION_REQUIRED_REASON_CODES.has(reasonCode)) {
        return true;
    }
    if (reasonCode === 'other') {
        return true;
    }
    return false;
}
function validateAuditReason(correlationId, commandKind, reason) {
    if (reason.registryVersion !== exports.AUDIT_REASON_REGISTRY_VERSION) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'unsupported', field: 'reason.registryVersion' },
        });
    }
    const allowedForKind = COMMAND_KIND_REASON_CODES[commandKind];
    if (allowedForKind === undefined) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'unsupported', field: 'reason.reasonCode' },
        });
    }
    if (!allowedForKind.includes(reason.reasonCode)) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'unsupported', field: 'reason.reasonCode' },
        });
    }
    if (!GLOBAL_REASON_CODES.has(reason.reasonCode)) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'unsupported', field: 'reason.reasonCode' },
        });
    }
    if (isAuditExplanationRequired(reason.reasonCode)) {
        const explanation = reason.explanation?.trim();
        if (!explanation) {
            throw new errors_1.CanonicalCommandError('validation', {
                correlationId,
                details: { reason: 'required', field: 'reason.explanation' },
            });
        }
    }
}
