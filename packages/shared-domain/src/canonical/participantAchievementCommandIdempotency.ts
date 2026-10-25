import { buildCanonicalCommandIdempotencyKey } from './boundedCanonicalIdempotency';
import type { IdempotencyKey } from './commands/commandContext';
import type { ParticipantId } from './identifiers';
import type { RecordParticipantAchievementInput } from './participantAchievements';
import { computeCommandFingerprint } from './commandFingerprint';

export function deriveRecordParticipantAchievementsIdempotencyKey(
  participantId: ParticipantId,
  expectedRevision: number,
  earned: readonly RecordParticipantAchievementInput[],
  exercisedCapability: 'account_owner' | 'parent_guardian' = 'account_owner'
): IdempotencyKey {
  return buildCanonicalCommandIdempotencyKey([
    'record-participant-achievements:v2',
    participantId,
    String(expectedRevision),
    computeCommandFingerprint({
      kind: 'record_participant_achievements',
      exercisedCapability,
      intent: { participantId, earned },
    }),
  ]);
}
