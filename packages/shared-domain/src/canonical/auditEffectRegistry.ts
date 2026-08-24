import type { AuditEffectKind } from './auditOutbox';
import type { CommandKind } from './commands/commandKinds';
import { CanonicalCommandError } from './errors';
import type { CorrelationId } from './identifiers';

export const AUDIT_EFFECT_REGISTRY_VERSION = 'effect:v1' as const;

const COMMAND_KIND_ALLOWED_EFFECTS: Partial<Record<CommandKind, readonly AuditEffectKind[]>> = {
  complete_booking: ['booking_lifecycle_changed'],
  create_confirmed_booking: [
    'booking_lifecycle_changed',
    'payment_state_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  record_manual_wallet_funding: ['wallet_balance_changed', 'financial_correction_recorded'],
};

const DEFAULT_ALLOWED_EFFECTS: readonly AuditEffectKind[] = [
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

export function allowedAuditEffectsForCommand(
  commandKind: CommandKind
): readonly AuditEffectKind[] {
  return COMMAND_KIND_ALLOWED_EFFECTS[commandKind] ?? DEFAULT_ALLOWED_EFFECTS;
}

export function validateAuditEffectsForCommand(
  correlationId: CorrelationId,
  commandKind: CommandKind,
  effects: readonly { kind: AuditEffectKind }[]
): void {
  const allowed = new Set(allowedAuditEffectsForCommand(commandKind));
  for (const effect of effects) {
    if (!allowed.has(effect.kind)) {
      throw new CanonicalCommandError('validation', {
        correlationId,
        details: { reason: 'unsupported', field: 'effects.kind' },
      });
    }
  }
}
