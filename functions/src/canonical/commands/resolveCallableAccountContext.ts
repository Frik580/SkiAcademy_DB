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
  'record_financial_correction',
  'record_manual_wallet_funding',
  'record_audit_correction',
  'enforce_payment_start_gate',
  'create_course_day',
  'reassign_course_day_instructor',
  'reconcile_course_enrollment',
]);

export const ADMINISTRATOR_CONTEXT_COMMAND_KINDS: ReadonlySet<CommandKind> = new Set([
  'create_confirmed_booking',
  'create_course_enrollments',
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
