import type { CommandKind } from './commands/commandKinds';
import type { CorrelationId } from './identifiers';
export declare const AUDIT_REASON_REGISTRY_VERSION: "reason:v1";
export declare const AUDIT_REASON_CODES: readonly ["self_service_booking", "self_service_completion", "scheduled_system_action", "provider_callback_processed", "manual_override", "manual_financial_correction", "attendance_correction", "admin_issue_dismissal", "audit_correction", "participant_management", "participant_access_control", "other"];
export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[number];
export declare function hasAuditReasonRegistryEntry(commandKind: CommandKind): boolean;
export interface AuditReasonInput {
    readonly registryVersion: string;
    readonly reasonCode: string;
    readonly explanation?: string;
}
export declare function isAuditExplanationRequired(reasonCode: string): boolean;
export declare function validateAuditReason(correlationId: CorrelationId, commandKind: CommandKind, reason: AuditReasonInput): void;
