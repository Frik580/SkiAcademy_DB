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
    'instructor_attendance',
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
    create_guest_booking_request: ['other'],
    confirm_guest_booking: ['manual_override', 'other'],
    link_guest_booking_to_account: ['participant_management', 'other'],
    request_booking_cancellation: ['self_service_booking', 'manual_override', 'other'],
    withdraw_booking_cancellation_request: ['self_service_booking', 'other'],
    resolve_booking_cancellation: ['manual_override', 'other'],
    reschedule_booking: ['self_service_booking', 'manual_override', 'other'],
    change_booking_instructor: ['manual_override', 'other'],
    change_booking_duration: ['manual_override', 'other'],
    change_booking_party: ['self_service_booking', 'manual_override', 'other'],
    rollback_unpaid_booking_party_additions: ['scheduled_system_action', 'manual_override'],
    record_booking_attendance: ['scheduled_system_action', 'attendance_correction', 'instructor_attendance', 'manual_override', 'other'],
    resolve_attendance_outcome: ['scheduled_system_action', 'manual_override'],
    expire_guest_reservation: ['scheduled_system_action'],
    enforce_payment_start_gate: ['scheduled_system_action', 'manual_override'],
    record_manual_wallet_funding: ['manual_financial_correction', 'manual_override', 'other'],
    record_provider_payment_event: ['provider_callback_processed', 'manual_override', 'other'],
    adjust_service_price: ['manual_override', 'other'],
    record_financial_correction: ['manual_financial_correction', 'manual_override', 'other'],
    record_audit_correction: ['audit_correction', 'scheduled_system_action', 'manual_override', 'other'],
    create_participant: ['participant_management', 'other'],
    update_participant_profile: ['participant_management', 'other'],
    assign_participant_management: ['participant_management', 'other'],
    revoke_participant_management: ['participant_management', 'other'],
    create_instructor_relationship: ['participant_management', 'manual_override', 'other'],
    revoke_instructor_relationship: ['participant_management', 'manual_override', 'other'],
    block_participant: ['participant_access_control', 'other'],
    unblock_participant: ['participant_access_control', 'other'],
    create_booking_proposal: ['other'],
    accept_booking_proposal: ['self_service_booking', 'other'],
    cancel_booking_proposal: ['other'],
    expire_booking_proposal: ['scheduled_system_action'],
    create_booking_change_request: ['other'],
    withdraw_booking_change_request: ['other'],
    resolve_booking_change_request: ['manual_override', 'other'],
    create_course_day: ['manual_override', 'other'],
    reassign_course_day_instructor: ['manual_override', 'other'],
    create_course_enrollments: ['self_service_booking', 'manual_override', 'other'],
    transfer_course_enrollment: ['manual_override', 'other'],
    withdraw_course_enrollment: ['self_service_booking', 'other'],
    request_course_enrollment_cancellation: ['self_service_booking', 'manual_override', 'other'],
    resolve_course_enrollment_cancellation: ['manual_override', 'other'],
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
