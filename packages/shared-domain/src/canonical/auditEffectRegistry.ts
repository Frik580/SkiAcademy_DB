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
  create_guest_booking_request: [
    'booking_lifecycle_changed',
    'payment_state_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  confirm_guest_booking: ['booking_lifecycle_changed', 'outbox_obligation_created'],
  link_guest_booking_to_account: ['participant_access_changed', 'outbox_obligation_created'],
  request_booking_cancellation: ['booking_lifecycle_changed', 'resource_claim_changed'],
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

export function hasAuditEffectRegistryEntry(commandKind: CommandKind): boolean {
  return COMMAND_KIND_ALLOWED_EFFECTS[commandKind] !== undefined;
}

export function allowedAuditEffectsForCommand(
  commandKind: CommandKind
): readonly AuditEffectKind[] {
  const allowed = COMMAND_KIND_ALLOWED_EFFECTS[commandKind];
  if (allowed === undefined) {
    return [];
  }
  return allowed;
}

export function validateAuditEffectsForCommand(
  correlationId: CorrelationId,
  commandKind: CommandKind,
  effects: readonly { kind: AuditEffectKind }[]
): void {
  const allowedForKind = COMMAND_KIND_ALLOWED_EFFECTS[commandKind];
  if (allowedForKind === undefined) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'unsupported', field: 'effects.kind' },
    });
  }

  const allowed = new Set(allowedForKind);
  for (const effect of effects) {
    if (!allowed.has(effect.kind)) {
      throw new CanonicalCommandError('validation', {
        correlationId,
        details: { reason: 'unsupported', field: 'effects.kind' },
      });
    }
  }
}
