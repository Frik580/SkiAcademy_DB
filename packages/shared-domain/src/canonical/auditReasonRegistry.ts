import type { CommandKind } from './commands/commandKinds';
import { CanonicalCommandError } from './errors';
import type { CorrelationId } from './identifiers';

export const AUDIT_REASON_REGISTRY_VERSION = 'reason:v1' as const;

export const AUDIT_REASON_CODES = [
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
] as const;

export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[number];

const GLOBAL_REASON_CODES = new Set<string>(AUDIT_REASON_CODES);

const COMMAND_KIND_REASON_CODES: Partial<Record<CommandKind, readonly AuditReasonCode[]>> = {
  complete_booking: ['self_service_completion', 'scheduled_system_action', 'other'],
  create_confirmed_booking: ['self_service_booking', 'manual_override', 'other'],
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

export function hasAuditReasonRegistryEntry(commandKind: CommandKind): boolean {
  return COMMAND_KIND_REASON_CODES[commandKind] !== undefined;
}

const EXPLANATION_REQUIRED_REASON_CODES = new Set<AuditReasonCode>([
  'manual_override',
  'manual_financial_correction',
  'attendance_correction',
  'admin_issue_dismissal',
  'audit_correction',
  'other',
]);

export interface AuditReasonInput {
  readonly registryVersion: string;
  readonly reasonCode: string;
  readonly explanation?: string;
}

export function isAuditExplanationRequired(reasonCode: string): boolean {
  if (EXPLANATION_REQUIRED_REASON_CODES.has(reasonCode as AuditReasonCode)) {
    return true;
  }
  if (reasonCode === 'other') {
    return true;
  }
  return false;
}

export function validateAuditReason(
  correlationId: CorrelationId,
  commandKind: CommandKind,
  reason: AuditReasonInput
): void {
  if (reason.registryVersion !== AUDIT_REASON_REGISTRY_VERSION) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'unsupported', field: 'reason.registryVersion' },
    });
  }

  const allowedForKind = COMMAND_KIND_REASON_CODES[commandKind];
  if (allowedForKind === undefined) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'unsupported', field: 'reason.reasonCode' },
    });
  }

  if (!allowedForKind.includes(reason.reasonCode as AuditReasonCode)) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'unsupported', field: 'reason.reasonCode' },
    });
  }

  if (!GLOBAL_REASON_CODES.has(reason.reasonCode)) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'unsupported', field: 'reason.reasonCode' },
    });
  }

  if (isAuditExplanationRequired(reason.reasonCode)) {
    const explanation = reason.explanation?.trim();
    if (!explanation) {
      throw new CanonicalCommandError('validation', {
        correlationId,
        details: { reason: 'required', field: 'reason.explanation' },
      });
    }
  }
}
