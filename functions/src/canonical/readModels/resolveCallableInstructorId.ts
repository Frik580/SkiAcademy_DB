import {
  InstructorIdSchema,
  type AccountId,
  type InstructorId,
} from '@ski-academy/shared-domain';
import type { CallableAccountProfile } from '../commands/resolveCallableAccountContext';
import { resolveActiveAccountInstructorId } from '../participantAccess/instructorIdentity';
import { parseAccount } from '../participantAccess/participantAccessStore';

export function resolveActiveCallableInstructorId(
  accountId: AccountId,
  data: Record<string, unknown> | undefined
): InstructorId | undefined {
  return resolveActiveAccountInstructorId(accountId, parseAccount(data), data?.instructorId);
}

export function resolveCallableInstructorId(
  profile: CallableAccountProfile | undefined
): InstructorId | undefined {
  const instructorId = profile?.instructorId;
  if (!instructorId) {
    return undefined;
  }
  const parsed = InstructorIdSchema.safeParse(instructorId);
  return parsed.success ? parsed.data : undefined;
}

export function readCallableAccountProfile(
  data: Record<string, unknown> | undefined
): CallableAccountProfile {
  if (!data) {
    return {};
  }
  return {
    ...(typeof data.role === 'string' ? { role: data.role } : {}),
    ...(typeof data.systemRole === 'string' ? { systemRole: data.systemRole } : {}),
    ...(typeof data.instructorId === 'string' ? { instructorId: data.instructorId } : {}),
    ...(typeof data.isInstructor === 'boolean' ? { isInstructor: data.isInstructor } : {}),
  };
}
