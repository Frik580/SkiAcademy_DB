import {
  AggregateRevisionSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain/canonical/primitives';
import { ParticipantIdSchema } from '@ski-academy/shared-domain/canonical/identifiers';
import { parseCommandResultPayload } from '@ski-academy/shared-domain/canonical/commands/commandResultPayloads';
import {
  type IdempotencyKey,
  type ParticipantAchievementSource,
  type ParticipantId,
  type RecordParticipantAchievementInput,
} from '@ski-academy/shared-domain';
import { deriveRecordParticipantAchievementsIdempotencyKey } from '@ski-academy/shared-domain/canonical/participantAchievementCommandIdempotency';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import {
  CanonicalCommandClientError,
  mapCanonicalCommandResultError,
} from '../../lib/canonical/mapCanonicalCommandError';
import { queryManagedParticipantAchievementsReadModels } from '../../lib/canonical/canonicalReadModelClient';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import { logger } from '../../shared';
import { useParticipantAchievementsStore } from './participantAchievementsStore';

export async function refreshManagedParticipantAchievements(participantIds?: readonly string[]) {
  const syncGeneration = useParticipantAchievementsStore.getState().syncGeneration;
  const parsedIds = participantIds?.map((participantId) =>
    ParticipantIdSchema.parse(participantId)
  );
  const result = await queryManagedParticipantAchievementsReadModels(parsedIds);
  if (useParticipantAchievementsStore.getState().syncGeneration !== syncGeneration) {
    return result.items;
  }
  useParticipantAchievementsStore.getState().setItems(result.items);
  return result.items;
}

export function deriveRecordParticipantAchievementsClientKey(
  participantId: string,
  expectedRevision: number,
  earned: readonly RecordParticipantAchievementInput[],
  exercisedCapability: 'account_owner' | 'parent_guardian' = 'account_owner'
): IdempotencyKey {
  return deriveRecordParticipantAchievementsIdempotencyKey(
    ParticipantIdSchema.parse(participantId),
    expectedRevision,
    earned,
    exercisedCapability
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
  const syncGeneration = useParticipantAchievementsStore.getState().syncGeneration;
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
      earned,
      input.exercisedCapability
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
  // A committed result must survive unmount and a failed follow-up read.
  const store = useParticipantAchievementsStore.getState();
  if (store.syncGeneration !== syncGeneration) return payload.data;
  const current = store.byId[participantId];
  store.upsertItem({
    ...current,
    participantId,
    revision: payload.data.revision,
    earned: {
      ...Object.fromEntries(
        earned
          .filter((item) => payload.data.newlyEarnedAchievementIds.includes(item.achievementId))
          .map(({ achievementId, ...record }) => [achievementId, record])
      ),
      ...current?.earned,
    },
  });
  try {
    await refreshManagedParticipantAchievements([participantId]);
  } catch (error) {
    logger.warn('Failed to refresh participant achievements after record', error);
  }
  return payload.data;
}

export type { ParticipantId };

export async function loadManagedParticipantAchievementsOnce(participantId: string) {
  const store = useParticipantAchievementsStore.getState();
  const generation = store.syncGeneration;
  if (!store.beginRecording(participantId, `load:${participantId}`)) return;
  try {
    await refreshManagedParticipantAchievements([participantId]);
  } catch (error) {
    logger.warn('Failed to load selected participant achievements', error);
  } finally {
    if (useParticipantAchievementsStore.getState().syncGeneration === generation) {
      useParticipantAchievementsStore.getState().setRecording(participantId, false);
    }
  }
}

/** One automatic operation per Participant across component instances.
 * Failures allow at most one recovery read and settle the attempted IDs for this
 * auth session. New achievements remain eligible; no component lifecycle retries.
 */
export async function recordManagedParticipantAchievementsOnce(
  input: Parameters<typeof recordManagedParticipantAchievements>[0]
) {
  const store = useParticipantAchievementsStore.getState();
  const generation = store.syncGeneration;
  if (
    input.earned.some((item) =>
      store.blockedAchievements[input.participantId]?.includes(item.achievementId)
    )
  )
    return;
  const attemptKey = JSON.stringify([
    input.accountId,
    input.participantId,
    input.exercisedCapability,
    input.expectedRevision,
    input.earned.map((item) => item.achievementId).sort(),
  ]);
  if (!store.beginRecording(input.participantId, attemptKey)) return;
  try {
    await recordManagedParticipantAchievements(input);
    const settled = useParticipantAchievementsStore.getState();
    if (settled.syncGeneration === generation) {
      // A successful no-op does not return historical dates/sources. If the read
      // failed, settle those IDs without guessing their persisted evidence.
      const missing = input.earned.filter(
        (item) => !settled.byId[input.participantId]?.earned[item.achievementId]
      );
      if (missing.length)
        settled.blockAchievements(
          input.participantId,
          missing.map((item) => item.achievementId)
        );
    }
  } catch (error) {
    if (useParticipantAchievementsStore.getState().syncGeneration !== generation) return;
    if (
      error instanceof CanonicalCommandClientError &&
      (error.retryable || ['idempotency_conflict', 'stale_version'].includes(error.code))
    ) {
      try {
        const items = await refreshManagedParticipantAchievements([input.participantId]);
        if (
          items.some(
            (item) =>
              item.participantId === input.participantId &&
              input.earned.every((earned) => item.earned[earned.achievementId])
          )
        )
          return;
      } catch (refreshError) {
        logger.warn('Failed to recover participant achievements', refreshError);
      }
    }
    if (useParticipantAchievementsStore.getState().syncGeneration !== generation) return;
    // Bound recovery even if unrelated aggregate revisions keep advancing.
    // New achievements remain eligible; failed achievements wait for a new session.
    useParticipantAchievementsStore.getState().blockAchievements(
      input.participantId,
      input.earned.map((item) => item.achievementId)
    );
    logger.warn('Failed to record participant achievements; automatic attempt settled', error);
  } finally {
    if (useParticipantAchievementsStore.getState().syncGeneration === generation) {
      useParticipantAchievementsStore.getState().setRecording(input.participantId, false);
    }
  }
}
