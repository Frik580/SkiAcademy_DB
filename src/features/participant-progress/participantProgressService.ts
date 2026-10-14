import { canonicalDeterministicHash } from '@ski-academy/shared-domain';
import { AggregateRevisionSchema } from '@ski-academy/shared-domain/canonical/primitives';
import { ParticipantIdSchema } from '@ski-academy/shared-domain/canonical/identifiers';
import { parseCommandResultPayload } from '@ski-academy/shared-domain/canonical/commands/commandResultPayloads';
import { type IdempotencyKey, type ParticipantId } from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  queryInstructorParticipantProgressReadModels,
  queryManagedParticipantProgressReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
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
  const syncGeneration = useParticipantProgressStore.getState().syncGeneration;
  const parsedIds = participantIds?.map((participantId) =>
    ParticipantIdSchema.parse(participantId)
  );
  const result = await queryManagedParticipantProgressReadModels(parsedIds);
  const views = result.items.map(toParticipantProgressView);
  if (useParticipantProgressStore.getState().syncGeneration !== syncGeneration) return views;
  useParticipantProgressStore.getState().setItems(views);
  return views;
}

export async function refreshInstructorParticipantProgress(
  participantIds: readonly string[]
): Promise<readonly ParticipantProgressView[]> {
  if (participantIds.length === 0) return [];
  const syncGeneration = useParticipantProgressStore.getState().syncGeneration;
  const parsedIds = participantIds.map((participantId) => ParticipantIdSchema.parse(participantId));
  const result = await queryInstructorParticipantProgressReadModels(parsedIds);
  const views = result.items.map(toParticipantProgressView);
  if (useParticipantProgressStore.getState().syncGeneration !== syncGeneration) return views;
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
  readonly correctionReason?: string;
}): Promise<ParticipantProgressView> {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'update_participant_progress',
    intent: {
      participantId,
      ...(input.correctionReason ? { correctionReason: input.correctionReason } : {}),
      level: input.level,
      skillScores: input.skillScores,
      skillComments: input.skillComments,
    },
    idempotencyKey: (deriveUpdateParticipantProgressIdempotencyKey(
      participantId,
      input.expectedRevision
    ) +
      ':' +
      canonicalDeterministicHash([
        JSON.stringify([input.skillScores, input.skillComments, input.correctionReason ?? '']),
      ])) as IdempotencyKey,
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
  const views = await refreshInstructorParticipantProgress([participantId]);
  const view = views.find((item) => item.participantId === participantId);
  if (!view) throw new Error('Participant progress refresh failed.');
  return view;
}

export type { ParticipantId };

export async function manageCanonicalParticipantLevel(input: {
  accountId: string;
  participantId: string;
  expectedRevision: number;
  operation: import('@ski-academy/shared-domain').LevelOperation;
  administrator?: boolean;
}): Promise<void> {
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'manage_participant_level',
    intent: {
      participantId: ParticipantIdSchema.parse(input.participantId),
      operation: input.operation,
    },
    expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    idempotencyKey:
      `participant-level:${input.participantId}:${input.expectedRevision}:${input.operation.action}:${canonicalDeterministicHash([JSON.stringify(input.operation)])}` as IdempotencyKey,
    ...(input.administrator
      ? { administratorContext: true }
      : { exercisedCapability: 'instructor' as const }),
  });
  if (result.status === 'error') throw mapCanonicalCommandResultError(result);
}
