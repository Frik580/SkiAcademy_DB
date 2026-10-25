import { buildCanonicalCommandIdempotencyKey } from './boundedCanonicalIdempotency';
import type { IdempotencyKey } from './commands/commandContext';
import type { ParticipantId } from './identifiers';
import type { RecordParticipantAchievementInput } from './participantAchievements';

export function deriveRecordParticipantAchievementsIdempotencyKey(
  participantId: ParticipantId,
  expectedRevision: number,
  earned: readonly Pick<RecordParticipantAchievementInput, 'achievementId'>[]
): IdempotencyKey {
  const ids = [...new Set(earned.map((item) => item.achievementId))].sort().join(',');
  return buildCanonicalCommandIdempotencyKey([
    'record-participant-achievements',
    participantId,
    String(expectedRevision),
    ids,
  ]);
}
