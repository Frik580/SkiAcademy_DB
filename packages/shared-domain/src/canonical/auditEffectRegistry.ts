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
    'participant_access_changed',
    'outbox_obligation_created',
  ],
  confirm_guest_booking: ['booking_lifecycle_changed', 'outbox_obligation_created'],
  confirm_guest_course_enrollment: [
    'course_enrollment_lifecycle_changed',
    'outbox_obligation_created',
  ],
  link_guest_booking_to_account: ['participant_access_changed', 'outbox_obligation_created'],
  link_guest_booking_to_account_as_administrator: [
    'booking_party_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  request_booking_cancellation: [
    'booking_lifecycle_changed',
    'payment_state_changed',
    'resource_claim_changed',
    'admin_issue_opened',
    'outbox_obligation_created',
  ],
  withdraw_booking_cancellation_request: [
    'booking_lifecycle_changed',
    'admin_issue_resolved',
    'outbox_obligation_created',
  ],
  resolve_booking_cancellation: [
    'booking_lifecycle_changed',
    'payment_state_changed',
    'resource_claim_changed',
    'admin_issue_opened',
    'admin_issue_resolved',
    'outbox_obligation_created',
  ],
  reschedule_booking: [
    'booking_schedule_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  change_booking_instructor: [
    'booking_service_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  change_booking_duration: [
    'booking_service_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  change_booking_party: [
    'booking_party_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  rollback_unpaid_booking_party_additions: [
    'booking_party_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  record_booking_attendance: [
    'attendance_recorded',
    'booking_lifecycle_changed',
    'admin_issue_opened',
    'admin_issue_resolved',
  ],
  record_course_day_attendance: [
    'attendance_recorded',
    'course_enrollment_lifecycle_changed',
    'admin_issue_opened',
    'admin_issue_resolved',
    'resource_claim_changed',
  ],
  resolve_attendance_outcome: [
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'admin_issue_opened',
    'admin_issue_resolved',
    'resource_claim_changed',
  ],
  expire_guest_reservation: [
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'resource_claim_changed',
  ],
  enforce_payment_start_gate: ['admin_issue_opened'],
  record_manual_wallet_funding: ['wallet_balance_changed', 'financial_correction_recorded'],
  record_provider_payment_event: [
    'payment_state_changed',
    'admin_issue_resolved',
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'outbox_obligation_created',
  ],
  adjust_service_price: [
    'payment_state_changed',
    'wallet_balance_changed',
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'outbox_obligation_created',
  ],
  record_financial_correction: [
    'payment_state_changed',
    'wallet_balance_changed',
    'financial_correction_recorded',
    'admin_issue_resolved',
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'outbox_obligation_created',
  ],
  record_audit_correction: [
    'audit_correction_recorded',
    'admin_issue_opened',
    'payment_state_changed',
    'wallet_balance_changed',
    'booking_lifecycle_changed',
    'course_enrollment_lifecycle_changed',
    'outbox_obligation_created',
  ],
  provision_self_participant: ['participant_access_changed'],
  create_participant: ['participant_access_changed'],
  update_participant_profile: ['participant_access_changed'],
  assign_participant_management: ['participant_access_changed'],
  revoke_participant_management: ['participant_access_changed'],
  create_instructor_relationship: ['participant_access_changed'],
  revoke_instructor_relationship: ['participant_access_changed'],
  block_participant: ['participant_access_changed', 'outbox_obligation_created'],
  unblock_participant: ['participant_access_changed'],
  disable_account: ['participant_access_changed', 'outbox_obligation_created'],
  enable_account: ['participant_access_changed', 'outbox_obligation_created'],
  archive_participant: ['participant_access_changed', 'outbox_obligation_created'],
  reactivate_participant: ['participant_access_changed', 'outbox_obligation_created'],
  assign_participant_management_as_administrator: [
    'participant_access_changed',
    'outbox_obligation_created',
  ],
  create_managed_dependent_participant: ['participant_access_changed', 'outbox_obligation_created'],
  provision_self_participant_for_account: [
    'participant_access_changed',
    'outbox_obligation_created',
  ],
  change_account_role: ['outbox_obligation_created'],
  create_instructor_catalog_entry: ['outbox_obligation_created'],
  update_instructor_catalog_profile: ['outbox_obligation_created'],
  deactivate_instructor_catalog: ['outbox_obligation_created'],
  reactivate_instructor_catalog: ['outbox_obligation_created'],
  link_account_instructor_catalog: ['outbox_obligation_created'],
  unlink_account_instructor_catalog: ['outbox_obligation_created'],
  repair_participant_management_owner_guard: [
    'participant_access_changed',
    'outbox_obligation_created',
  ],
  create_booking_proposal: ['outbox_obligation_created'],
  accept_booking_proposal: [
    'booking_lifecycle_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  cancel_booking_proposal: ['outbox_obligation_created'],
  expire_booking_proposal: ['outbox_obligation_created'],
  create_booking_change_request: ['outbox_obligation_created'],
  withdraw_booking_change_request: ['outbox_obligation_created'],
  resolve_booking_change_request: [
    'booking_lifecycle_changed',
    'booking_schedule_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  create_course_day: ['resource_claim_changed', 'outbox_obligation_created'],
  reassign_course_day_instructor: ['resource_claim_changed', 'outbox_obligation_created'],
  provision_canonical_course: ['outbox_obligation_created'],
  apply_canonical_course_provisioning_manifest: [
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  change_course_title: ['outbox_obligation_created'],
  change_course_price: ['outbox_obligation_created'],
  change_course_capacity: ['outbox_obligation_created'],
  archive_course: ['outbox_obligation_created'],
  reactivate_course: ['outbox_obligation_created'],
  add_course_roster_instructor: ['outbox_obligation_created'],
  remove_course_roster_instructor: ['outbox_obligation_created'],
  reschedule_course_day: ['resource_claim_changed', 'outbox_obligation_created'],
  remove_course_day: ['resource_claim_changed', 'outbox_obligation_created'],
  update_course_catalog_content: ['outbox_obligation_created'],
  create_course_enrollments: [
    'course_enrollment_lifecycle_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  transfer_course_enrollment: [
    'course_enrollment_lifecycle_changed',
    'payment_state_changed',
    'wallet_balance_changed',
    'resource_claim_changed',
    'outbox_obligation_created',
  ],
  withdraw_course_enrollment: [
    'course_enrollment_lifecycle_changed',
    'admin_issue_resolved',
    'outbox_obligation_created',
  ],
  request_course_enrollment_cancellation: [
    'course_enrollment_lifecycle_changed',
    'payment_state_changed',
    'resource_claim_changed',
    'admin_issue_opened',
    'outbox_obligation_created',
  ],
  resolve_course_enrollment_cancellation: [
    'course_enrollment_lifecycle_changed',
    'payment_state_changed',
    'resource_claim_changed',
    'admin_issue_opened',
    'admin_issue_resolved',
    'outbox_obligation_created',
  ],
  reconcile_course_enrollment: [
    'course_enrollment_lifecycle_changed',
    'admin_issue_opened',
    'admin_issue_resolved',
    'resource_claim_changed',
  ],
  link_guest_course_enrollment_to_account: [
    'guest_course_enrollment_linked',
    'participant_access_changed',
    'resource_claim_changed',
    'payment_association_changed',
    'outbox_obligation_created',
  ],
  link_guest_course_enrollment_to_account_as_administrator: [
    'guest_course_enrollment_linked',
    'resource_claim_changed',
    'payment_association_changed',
    'outbox_obligation_created',
  ],
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
