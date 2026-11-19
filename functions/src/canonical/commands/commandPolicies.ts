import {
  CanonicalCommandError,
  TEST_SESSION_COMMAND_SUPPORT,
  evaluateCommandContextAuthorization,
  type CanonicalExecutionScope,
  type CommandContext,
  type CommandEnvelope,
  type CommandKind,
  type CommandSource,
  type ExercisedCapability,
  type TestCommandSupportState,
} from '@ski-academy/shared-domain';

export type CommandInvocation = 'authenticated_callable' | 'guest_callable' | 'server';

type AdministratorCallableRoute = 'required' | 'opt_in' | 'server_only';

type CommandAccessMode =
  | {
      readonly source: 'client_callable';
      readonly actor: 'account';
      readonly capability: 'account_owner' | 'parent_guardian';
      readonly identity: 'firebase_account';
    }
  | {
      readonly source: 'client_callable';
      readonly actor: 'account';
      readonly capability: 'instructor';
      readonly identity: 'linked_instructor';
    }
  | {
      readonly source: 'admin_callable';
      readonly actor: 'account';
      readonly capability: 'administrator';
      readonly identity: 'active_administrator';
      readonly callable: AdministratorCallableRoute;
    }
  | {
      readonly source: 'guest_callable';
      readonly actor: 'guest';
      readonly capability: 'guest';
      readonly identity: 'derived_guest_subject';
    }
  | {
      readonly source: 'scheduler' | 'system_reconciliation';
      readonly actor: 'system';
      readonly capability: 'system';
      readonly identity: 'server';
    }
  | {
      readonly source: 'provider_callback';
      readonly actor: 'provider';
      readonly capability: 'provider_callback';
      readonly identity: 'server';
    };

type CommandPolicy = Readonly<{
  availability: 'available' | 'unavailable';
  modes: readonly CommandAccessMode[];
  objectAuthorization: 'handler' | 'none';
  testBootstrap?: 'existing_self_identity' | 'starter_credit_noop';
  participantProgressContract?: 2;
  guestAdmission?: true;
}>;

const owner = {
  source: 'client_callable',
  actor: 'account',
  capability: 'account_owner',
  identity: 'firebase_account',
} as const;
const guardian = { ...owner, capability: 'parent_guardian' } as const;
const manager = [owner, guardian] as const;
const instructor = { ...owner, capability: 'instructor', identity: 'linked_instructor' } as const;
const admin = {
  source: 'admin_callable',
  actor: 'account',
  capability: 'administrator',
  identity: 'active_administrator',
  callable: 'required',
} as const;
const adminOptIn = { ...admin, callable: 'opt_in' } as const;
const serverAdmin = { ...admin, callable: 'server_only' } as const;
const guest = {
  source: 'guest_callable',
  actor: 'guest',
  capability: 'guest',
  identity: 'derived_guest_subject',
} as const;
const scheduler = {
  source: 'scheduler',
  actor: 'system',
  capability: 'system',
  identity: 'server',
} as const;
const reconciliation = { ...scheduler, source: 'system_reconciliation' } as const;
const provider = {
  source: 'provider_callback',
  actor: 'provider',
  capability: 'provider_callback',
  identity: 'server',
} as const;

function resource(...modes: readonly CommandAccessMode[]): CommandPolicy {
  return { availability: 'available', modes, objectAuthorization: 'handler' };
}

function configuration(...modes: readonly CommandAccessMode[]): CommandPolicy {
  return { availability: 'available', modes, objectAuthorization: 'none' };
}

const unavailable = {
  availability: 'unavailable',
  modes: [],
  objectAuthorization: 'none',
} as const;

/** The transport grants these modes. Handlers still authorize the specific resource and intent. */
export const COMMAND_POLICIES = {
  create_confirmed_booking: resource(...manager, adminOptIn),
  create_guest_booking_request: { ...resource(guest), guestAdmission: true },
  confirm_guest_booking: resource(admin),
  confirm_guest_course_enrollment: resource(admin),
  link_guest_booking_to_account: resource(owner),
  link_guest_booking_to_account_as_administrator: resource(admin),
  request_booking_cancellation: resource(...manager, guest),
  withdraw_booking_cancellation_request: resource(...manager),
  resolve_booking_cancellation: resource(admin),
  reschedule_booking: resource(...manager, adminOptIn),
  change_booking_instructor: resource(adminOptIn),
  change_booking_duration: resource(adminOptIn),
  // The administrative handler branch has no account callable route.
  change_booking_party: resource(...manager, serverAdmin),
  // The administrative handler branch has no account callable route.
  rollback_unpaid_booking_party_additions: resource(scheduler, serverAdmin),
  record_booking_attendance: resource(instructor, adminOptIn),
  record_course_day_attendance: resource(instructor, adminOptIn),
  complete_booking: unavailable,
  record_booking_no_show: unavailable,
  create_instructor_review: resource(...manager),
  update_participant_progress: { ...resource(instructor), participantProgressContract: 2 },
  manage_participant_level: { ...resource(instructor, adminOptIn), participantProgressContract: 2 },
  record_participant_achievements: resource(...manager),
  save_participant_lesson_feedback: resource(instructor),
  set_participant_lesson_feedback_item_completion: resource(...manager),
  create_course_enrollments: { ...resource(...manager, adminOptIn, guest), guestAdmission: true },
  transfer_course_enrollment: resource(admin),
  // Guest transport parses this kind, but only an authenticated manager can withdraw.
  withdraw_course_enrollment: resource(...manager),
  request_course_enrollment_cancellation: resource(...manager, guest),
  resolve_course_enrollment_cancellation: resource(admin),
  create_booking_proposal: resource(instructor),
  accept_booking_proposal: resource(...manager),
  cancel_booking_proposal: resource(...manager, instructor),
  expire_booking_proposal: resource(scheduler, reconciliation),
  create_booking_change_request: resource(instructor),
  withdraw_booking_change_request: resource(instructor),
  resolve_booking_change_request: resource(admin),
  expire_guest_reservation: resource(scheduler, reconciliation),
  finalize_booking_attendance: resource(adminOptIn),
  enforce_payment_start_gate: resource(admin, scheduler, reconciliation),
  resolve_attendance_outcome: resource(adminOptIn, scheduler, reconciliation),
  provision_self_participant: { ...resource(owner), testBootstrap: 'existing_self_identity' },
  create_participant: resource(...manager),
  update_participant_profile: resource(...manager, instructor, adminOptIn),
  complete_guest_participant_profile: resource(guest),
  assign_participant_management: resource(...manager),
  revoke_participant_management: resource(...manager, instructor, adminOptIn),
  // The administrative grant branch has no account callable route.
  create_instructor_relationship: resource(...manager, serverAdmin),
  revoke_instructor_relationship: resource(...manager, instructor, serverAdmin),
  block_participant: resource(...manager, instructor),
  unblock_participant: resource(...manager, instructor),
  disable_account: resource(admin),
  enable_account: resource(admin),
  archive_participant: resource(admin),
  reactivate_participant: resource(admin),
  assign_participant_management_as_administrator: resource(admin),
  create_managed_dependent_participant: resource(admin),
  provision_self_participant_for_account: resource(admin),
  change_account_role: resource(admin),
  update_lesson_pricing_settings: configuration(admin),
  update_lesson_levels: configuration(admin),
  set_email_delivery_enabled: configuration(admin),
  update_account_contact_as_administrator: resource(admin),
  update_own_account_contact: resource(owner),
  create_instructor_catalog_entry: resource(admin),
  update_instructor_catalog_profile: resource(admin),
  deactivate_instructor_catalog: resource(admin),
  reactivate_instructor_catalog: resource(admin),
  link_account_instructor_catalog: resource(admin),
  unlink_account_instructor_catalog: resource(admin),
  delete_instructor_catalog_entry: resource(admin),
  repair_participant_management_owner_guard: resource(admin),
  record_provider_payment_event: resource(admin, provider),
  pay_service_from_wallet_as_administrator: resource(admin),
  record_manual_wallet_funding: resource(admin),
  create_kaspi_payment_request: resource(owner, guest),
  claim_kaspi_payment: resource(owner, guest),
  review_kaspi_payment: resource(admin),
  set_kaspi_payment_enabled: configuration(admin),
  save_kaspi_configuration: resource(admin),
  grant_starter_credit: { ...resource(owner), testBootstrap: 'starter_credit_noop' },
  // The finance handler supports trusted server administrator envelopes only.
  adjust_service_price: resource(serverAdmin),
  record_financial_correction: resource(admin),
  record_audit_correction: resource(admin, reconciliation),
  create_course_day: resource(admin),
  reassign_course_day_instructor: resource(admin),
  provision_canonical_course: resource(admin),
  apply_canonical_course_provisioning_manifest: resource(admin),
  change_course_title: resource(admin),
  change_course_price: resource(admin),
  change_course_capacity: resource(admin),
  archive_course: resource(admin),
  reactivate_course: resource(admin),
  add_course_roster_instructor: resource(admin),
  remove_course_roster_instructor: resource(admin),
  reschedule_course_day: resource(admin),
  remove_course_day: resource(admin),
  update_course_catalog_content: resource(admin),
  create_administrative_availability_block: resource(admin),
  reschedule_administrative_availability_block: resource(admin),
  release_administrative_availability_block: resource(admin),
  reconcile_course_enrollment: resource(admin, scheduler, reconciliation),
  link_guest_course_enrollment_to_account: resource(...manager),
  link_guest_course_enrollment_to_account_as_administrator: resource(admin),
} satisfies Record<CommandKind, CommandPolicy>;

export function getCommandPolicy(
  kind: CommandKind
): (CommandPolicy & { readonly testSupport: TestCommandSupportState }) | undefined {
  if (
    !Object.hasOwn(COMMAND_POLICIES, kind) ||
    !Object.hasOwn(TEST_SESSION_COMMAND_SUPPORT, kind)
  ) {
    return undefined;
  }
  const policy = COMMAND_POLICIES[kind];
  const testSupport = TEST_SESSION_COMMAND_SUPPORT[kind];
  return policy && testSupport ? { ...policy, testSupport } : undefined;
}

export function findCommandAccessMode(
  policy: CommandPolicy,
  source: CommandSource,
  capability: ExercisedCapability
): CommandAccessMode | undefined {
  return policy.modes.find((mode) => mode.source === source && mode.capability === capability);
}

export function commandAccessModeMatchesInvocation(
  mode: CommandAccessMode,
  actor: CommandContext['actor'],
  invocation: CommandInvocation
): boolean {
  if (mode.actor !== actor.kind) return false;
  if (invocation === 'authenticated_callable') {
    return (
      mode.source === 'client_callable' ||
      (mode.source === 'admin_callable' && mode.callable !== 'server_only')
    );
  }
  if (invocation === 'guest_callable') return mode.source === 'guest_callable';
  return invocation === 'server';
}

/** Used before dispatch and when a handler starts a separate, server-built command. */
export function getCommandPolicyError(
  envelope: CommandEnvelope,
  scope: CanonicalExecutionScope | undefined,
  invocation: CommandInvocation
): CanonicalCommandError | undefined {
  const { actor, source, exercisedCapability, correlationId } = envelope.context;
  const policy = getCommandPolicy(envelope.kind);
  if (!policy || evaluateCommandContextAuthorization(envelope.context) !== 'authorized') {
    return new CanonicalCommandError('forbidden', { correlationId });
  }
  if (policy.availability === 'unavailable') {
    return new CanonicalCommandError('unavailable', { correlationId });
  }
  if (
    scope?.dataScope === 'test' &&
    (source === 'guest_callable' || (policy.testSupport !== 'TEST_SUPPORTED' && !policy.testBootstrap))
  ) {
    return new CanonicalCommandError('cross_scope_forbidden', {
      correlationId,
      details: { reason: 'unsupported' },
    });
  }
  const mode = findCommandAccessMode(policy, source, exercisedCapability);
  if (!mode || !commandAccessModeMatchesInvocation(mode, actor, invocation)) {
    return new CanonicalCommandError('forbidden', { correlationId });
  }
  return undefined;
}
