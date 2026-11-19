import {
  AccountIdSchema,
  type Account,
  type AccountId,
  type CommandKind,
  type CommandSource,
  type ExercisedCapability,
  type InstructorId,
} from '@ski-academy/shared-domain';
import { resolveActiveAccountInstructorId } from '../participantAccess/instructorIdentity';
import { findCommandAccessMode, getCommandPolicy } from './commandPolicies';

export const CLIENT_CALLABLE_CAPABILITIES = [
  'account_owner',
  'parent_guardian',
  'instructor',
] as const;

export type ClientCallableCapability = (typeof CLIENT_CALLABLE_CAPABILITIES)[number];

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
  readonly instructorId?: InstructorId;
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
  input: ResolveCallableAccountContextInput,
  account?: Account
): ResolvedCallableAccountContext {
  const accountId = parseCallableAccountId(input.authUid);
  if (!accountId) {
    throw new Error('unauthenticated');
  }

  if (input.exercisedCapability === 'administrator') {
    throw new Error('forbidden_capability');
  }

  const policy = getCommandPolicy(input.commandKind);
  if (!policy) throw new Error('forbidden');
  const adminMode = findCommandAccessMode(policy, 'admin_callable', 'administrator');
  const adminRoute = adminMode?.source === 'admin_callable' ? adminMode.callable : undefined;
  const isAdmin = isAdministratorProfile(profile);

  if (adminRoute === 'required') {
    if (!isAdmin) {
      throw new Error('forbidden');
    }
    return {
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    };
  }

  if (isAdmin && input.administratorContext === true && adminRoute === 'opt_in') {
    return {
      accountId,
      capability: 'administrator',
      source: 'admin_callable',
    };
  }

  const capability = isClientCallableCapability(input.exercisedCapability)
    ? input.exercisedCapability
    : 'account_owner';
  if (capability === 'instructor') {
    const instructorId = resolveActiveAccountInstructorId(accountId, account, profile?.instructorId);
    if (!instructorId) throw new Error('forbidden');
    return { accountId, capability, source: 'client_callable', instructorId };
  }

  return {
    accountId,
    capability,
    source: 'client_callable',
  };
}
