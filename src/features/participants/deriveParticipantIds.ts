import {
  ParticipantIdSchema,
  canonicalDeterministicHash,
  participantManagementIdFromGuestLink,
  type AccountId,
  type IdempotencyKey,
  type ParticipantId,
  type ParticipantManagementId,
} from '@ski-academy/shared-domain';

export function createDependentParticipantAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveDependentParticipantId(
  accountId: AccountId,
  attemptId: string
): ParticipantId {
  return ParticipantIdSchema.parse(
    canonicalDeterministicHash(['participant:v1', 'dependent', accountId, attemptId])
  );
}

export function deriveDependentManagementId(input: {
  readonly participantId: ParticipantId;
  readonly accountId: AccountId;
}): ParticipantManagementId {
  return participantManagementIdFromGuestLink(input);
}

export function deriveCreateDependentParticipantIdempotencyKey(attemptId: string): IdempotencyKey {
  return `create-dependent:${attemptId}` as IdempotencyKey;
}

export function deriveAssignDependentManagementIdempotencyKey(attemptId: string): IdempotencyKey {
  return `assign-dependent:${attemptId}` as IdempotencyKey;
}

export function deriveUpdateParticipantProfileIdempotencyKey(
  participantId: string,
  expectedRevision: number
): IdempotencyKey {
  return `update-participant:${participantId}:${expectedRevision}` as IdempotencyKey;
}
