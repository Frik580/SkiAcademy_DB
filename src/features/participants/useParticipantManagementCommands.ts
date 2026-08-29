import { useCallback } from 'react';
import {
  AggregateRevisionSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  type AccountId,
} from '@ski-academy/shared-domain';
import {
  executeAuthenticatedCanonicalCommand,
  type ClientCallableCapability,
} from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import type {
  CreateDependentParticipantInput,
  UpdateManagedParticipantProfileInput,
} from './participantManagementContracts';
import { mapAgeYearsToParticipantAge } from './participantManagementContracts';
import {
  createDependentParticipantAttemptId,
  deriveAssignDependentManagementIdempotencyKey,
  deriveCreateDependentParticipantIdempotencyKey,
  deriveDependentManagementId,
  deriveDependentParticipantId,
  deriveUpdateParticipantProfileIdempotencyKey,
} from './deriveParticipantIds';

function capabilityForAuthority(authority: 'self' | 'parent_guardian'): ClientCallableCapability {
  return authority === 'self' ? 'account_owner' : 'parent_guardian';
}

export function useParticipantManagementCommands(accountId: string | undefined) {
  const createDependentParticipant = useCallback(
    async (input: CreateDependentParticipantInput): Promise<{ readonly participantId: string }> => {
      if (!accountId) {
        throw new Error('Authentication is required.');
      }

      const attemptId = createDependentParticipantAttemptId();
      const parsedAccountId = accountId as AccountId;
      const participantId = deriveDependentParticipantId(parsedAccountId, attemptId);
      const participantManagementId = deriveDependentManagementId({
        participantId,
        accountId: parsedAccountId,
      });

      const createResult = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'create_participant',
        intent: {
          participantId,
          displayName: input.displayName.trim(),
          age: mapAgeYearsToParticipantAge(input.ageYears),
          skillLevel: input.skillLevel.trim(),
          discipline: input.discipline,
          ...(input.instructorComment?.trim()
            ? { instructorComment: input.instructorComment.trim() }
            : {}),
        },
        idempotencyKey: deriveCreateDependentParticipantIdempotencyKey(attemptId),
        exercisedCapability: 'account_owner',
      });
      const createError = mapCanonicalCommandResultError(createResult);
      if (createError) throw createError;

      const assignResult = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'assign_participant_management',
        intent: {
          participantManagementId: ParticipantManagementIdSchema.parse(participantManagementId),
          participantId: ParticipantIdSchema.parse(participantId),
          authority: 'parent_guardian',
        },
        idempotencyKey: deriveAssignDependentManagementIdempotencyKey(attemptId),
        exercisedCapability: 'parent_guardian',
      });
      const assignError = mapCanonicalCommandResultError(assignResult);
      if (assignError) throw assignError;

      return { participantId };
    },
    [accountId]
  );

  const updateManagedParticipantProfile = useCallback(
    async (input: UpdateManagedParticipantProfileInput): Promise<void> => {
      if (!accountId) {
        throw new Error('Authentication is required.');
      }

      const patch = {
        participantId: ParticipantIdSchema.parse(input.participantId),
        ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
        ...(input.age !== undefined ? { age: input.age } : {}),
        ...(input.skillLevel !== undefined ? { skillLevel: input.skillLevel.trim() } : {}),
        ...(input.discipline !== undefined ? { discipline: input.discipline } : {}),
        ...(input.instructorComment !== undefined
          ? { instructorComment: input.instructorComment.trim() }
          : {}),
      };

      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'update_participant_profile',
        intent: patch,
        idempotencyKey: deriveUpdateParticipantProfileIdempotencyKey(
          input.participantId,
          input.expectedRevision
        ),
        expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
        exercisedCapability: capabilityForAuthority(input.authority),
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
    },
    [accountId]
  );

  return {
    createDependentParticipant,
    updateManagedParticipantProfile,
  };
}
