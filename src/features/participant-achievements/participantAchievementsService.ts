import {
  AggregateRevisionSchema,
  ParticipantIdSchema,
  parseCommandResultPayload,
  timestampFromDate,
  type IdempotencyKey,
  type ParticipantAchievementSource,
  type ParticipantId,
  type RecordParticipantAchievementInput,
} from '@ski-academy/shared-domain';
import { deriveRecordParticipantAchievementsIdempotencyKey } from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import { queryManagedParticipantAchievementsReadModels } from '../../lib/canonical/canonicalReadModelClient';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import { logger } from '../../shared';
import { useParticipantAchievementsStore } from './participantAchievementsStore';

export async function refreshManagedParticipantAchievements(
  participantIds?: readonly string[]
) {
  const parsedIds = participantIds?.map((participantId) =>
    ParticipantIdSchema.parse(participantId)
  );
  const result = await queryManagedParticipantAchievementsReadModels(parsedIds);
  useParticipantAchievementsStore.getState().setItems(result.items);
  return result.items;
}

export function deriveRecordParticipantAchievementsClientKey(
  participantId: string,
  expectedRevision: number,
  earned: readonly { achievementId: string }[]
): IdempotencyKey {
  return deriveRecordParticipantAchievementsIdempotencyKey(
    ParticipantIdSchema.parse(participantId),
    expectedRevision,
    earned
  );
}

export async function recordManagedParticipantAchievements(input: {
  readonly accountId: string;
  readonly participantId: string;
  readonly expectedRevision: number;
  readonly earned: readonly {
    readonly achievementId: string;
    readonly earnedAtIso: string;
    readonly source: ParticipantAchievementSource;
  }[];
  readonly exercisedCapability: Extract<
    ClientCallableCapability,
    'account_owner' | 'parent_guardian'
  >;
}) {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const earned: RecordParticipantAchievementInput[] = input.earned.map((item) => ({
    achievementId: item.achievementId,
    earnedAt: timestampFromDate(new Date(item.earnedAtIso)),
    source: item.source,
  }));
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'record_participant_achievements',
    intent: {
      participantId,
      earned,
    },
    idempotencyKey: deriveRecordParticipantAchievementsClientKey(
      participantId,
      input.expectedRevision,
      earned
    ),
    expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    exercisedCapability: input.exercisedCapability,
  });
  if (result.status === 'error') {
    throw mapCanonicalCommandResultError(result);
  }
  const payload = parseCommandResultPayload('record_participant_achievements', result.payload);
  if (!payload.success) {
    throw new Error('Participant achievements command returned an invalid payload.');
  }
  try {
    await refreshManagedParticipantAchievements([participantId]);
  } catch (error) {
    logger.warn('Failed to refresh participant achievements after record', error);
  }
  return payload.data;
}

export type { ParticipantId };
