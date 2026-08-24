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
  'other',
] as const;

export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[number];

const GLOBAL_REASON_CODES = new Set<string>(AUDIT_REASON_CODES);

const COMMAND_KIND_REASON_CODES: Partial<Record<CommandKind, readonly AuditReasonCode[]>> = {
  complete_booking: ['self_service_completion', 'scheduled_system_action', 'other'],
  create_confirmed_booking: ['self_service_booking', 'manual_override', 'other'],
  record_manual_wallet_funding: ['manual_financial_correction', 'manual_override', 'other'],
};

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
  const allowedCodes = allowedForKind === undefined ? AUDIT_REASON_CODES : allowedForKind;

  if (!allowedCodes.includes(reason.reasonCode as AuditReasonCode)) {
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
