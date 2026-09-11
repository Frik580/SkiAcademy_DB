import {
  AggregateRevisionSchema,
  ParticipantIdSchema,
  parseCommandResultPayload,
  type IdempotencyKey,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  queryInstructorParticipantProgressReadModels,
  queryManagedParticipantProgressReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import { logger } from '../../shared';
import {
  toParticipantProgressView,
  type ParticipantProgressView,
} from './applyParticipantProgressToProfile';
import { useParticipantProgressStore } from './participantProgressStore';

export function deriveUpdateParticipantProgressIdempotencyKey(
  participantId: string,
  expectedRevision: number
): IdempotencyKey {
  return `update-participant-progress:${participantId}:${expectedRevision}` as IdempotencyKey;
}

export async function refreshManagedParticipantProgress(
  participantIds?: readonly string[]
): Promise<readonly ParticipantProgressView[]> {
  const parsedIds = participantIds?.map((participantId) =>
    ParticipantIdSchema.parse(participantId)
  );
  const result = await queryManagedParticipantProgressReadModels(parsedIds);
  const views = result.items.map(toParticipantProgressView);
  useParticipantProgressStore.getState().setItems(views);
  return views;
}

export async function refreshInstructorParticipantProgress(
  participantIds: readonly string[]
): Promise<readonly ParticipantProgressView[]> {
  if (participantIds.length === 0) return [];
  const parsedIds = participantIds.map((participantId) => ParticipantIdSchema.parse(participantId));
  const result = await queryInstructorParticipantProgressReadModels(parsedIds);
  const views = result.items.map(toParticipantProgressView);
  useParticipantProgressStore.getState().setItems(views);
  return views;
}

export async function updateCanonicalParticipantProgress(input: {
  readonly accountId: string;
  readonly participantId: string;
  readonly level: number;
  readonly skillScores: Record<string, number>;
  readonly skillComments: Record<string, string>;
  readonly expectedRevision: number;
}): Promise<ParticipantProgressView> {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'update_participant_progress',
    intent: {
      participantId,
      level: input.level,
      skillScores: input.skillScores,
      skillComments: input.skillComments,
    },
    idempotencyKey: deriveUpdateParticipantProgressIdempotencyKey(
      participantId,
      input.expectedRevision
    ),
    expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    exercisedCapability: 'instructor',
  });
  if (result.status === 'error') {
    throw mapCanonicalCommandResultError(result);
  }
  const payload = parseCommandResultPayload('update_participant_progress', result.payload);
  if (!payload.success) {
    throw new Error('Participant progress command returned an invalid payload.');
  }
  const nextView: ParticipantProgressView = {
    participantId,
    level: input.level,
    skillScores: { ...input.skillScores },
    skillComments: { ...input.skillComments },
    revision: payload.data.revision,
  };
  useParticipantProgressStore.getState().upsertItem(nextView);
  try {
    await refreshInstructorParticipantProgress([participantId]);
  } catch (error) {
    logger.warn('Failed to refresh participant progress after update', error);
  }
  return useParticipantProgressStore.getState().byId[participantId] ?? nextView;
}

export type { ParticipantId };
