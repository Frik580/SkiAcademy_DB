import {
  AccountIdSchema,
  type AccountId,
  type CommandKind,
  type CommandSource,
  type ExercisedCapability,
} from '@ski-academy/shared-domain';

export const CLIENT_CALLABLE_CAPABILITIES = [
  'account_owner',
  'parent_guardian',
  'instructor',
] as const;

export type ClientCallableCapability = (typeof CLIENT_CALLABLE_CAPABILITIES)[number];

export const ADMINISTRATOR_COMMAND_KINDS: ReadonlySet<CommandKind> = new Set([
  'confirm_guest_booking',
  'resolve_booking_cancellation',
  'resolve_booking_change_request',
  'resolve_course_enrollment_cancellation',
  'transfer_course_enrollment',
  'record_financial_correction',
  'record_manual_wallet_funding',
  'record_audit_correction',
  'enforce_payment_start_gate',
  'create_course_day',
  'reassign_course_day_instructor',
  'provision_canonical_course',
  'apply_canonical_course_provisioning_manifest',
  'change_course_title',
  'change_course_price',
  'change_course_capacity',
  'archive_course',
  'reactivate_course',
  'add_course_roster_instructor',
  'remove_course_roster_instructor',
  'reschedule_course_day',
  'remove_course_day',
  'update_course_catalog_content',
  'reconcile_course_enrollment',
  'disable_account',
  'enable_account',
  'archive_participant',
  'reactivate_participant',
  'assign_participant_management_as_administrator',
  'create_managed_dependent_participant',
  'provision_self_participant_for_account',
  'change_account_role',
  'create_instructor_catalog_entry',
  'update_instructor_catalog_profile',
  'deactivate_instructor_catalog',
  'reactivate_instructor_catalog',
  'link_account_instructor_catalog',
  'unlink_account_instructor_catalog',
  'repair_participant_management_owner_guard',
]);

export const ADMINISTRATOR_CONTEXT_COMMAND_KINDS: ReadonlySet<CommandKind> = new Set([
  'create_confirmed_booking',
  'create_course_enrollments',
  'reschedule_booking',
  'change_booking_instructor',
  'change_booking_duration',
  'record_booking_attendance',
  'record_course_day_attendance',
  'resolve_attendance_outcome',
  'update_participant_profile',
  'revoke_participant_management',
]);

export interface CallableAccountProfile {
  readonly role?: string;
  readonly systemRole?: string;
  readonly instructorId?: string;
  readonly isInstructor?: boolean;
}

export interface ResolveCallableAccountContextInput {
  readonly authUid: string;
  readonly commandKind: CommandKind;
  readonly exercisedCapability?: unknown;
  readonly administratorContext?: unknown;
}

export interface ResolvedCallableAccountContext {
  readonly accountId: AccountId;
  readonly capability: ExercisedCapability;
  readonly source: CommandSource;
}

function isClientCallableCapability(value: unknown): value is ClientCallableCapability {
  return (
    typeof value === 'string' && (CLIENT_CALLABLE_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function parseCallableAccountId(authUid: string): AccountId | undefined {
  const parsed = AccountIdSchema.safeParse(authUid);
  return parsed.success ? parsed.data : undefined;
}

export function isAdministratorProfile(profile: CallableAccountProfile | undefined): boolean {
  return profile?.role === 'admin';
}

export function resolveCallableAccountContext(
  profile: CallableAccountProfile | undefined,
  input: ResolveCallableAccountContextInput
): ResolvedCallableAccountContext {
  const accountId = parseCallableAccountId(input.authUid);
  if (!accountId) {
    throw new Error('unauthenticated');
  }

  if (input.exercisedCapability === 'administrator') {
    throw new Error('forbidden_capability');
  }

  const isAdmin = isAdministratorProfile(profile);

  if (ADMINISTRATOR_COMMAND_KINDS.has(input.commandKind)) {
    if (!isAdmin) {
      throw new Error('forbidden');
    }
    return {
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    };
  }

  if (
    isAdmin &&
    input.administratorContext === true &&
    ADMINISTRATOR_CONTEXT_COMMAND_KINDS.has(input.commandKind)
  ) {
    return {
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    };
  }

  const capability = isClientCallableCapability(input.exercisedCapability)
    ? input.exercisedCapability
    : 'account_owner';

  return {
    accountId,
    capability,
    source: 'client_callable',
  };
}
