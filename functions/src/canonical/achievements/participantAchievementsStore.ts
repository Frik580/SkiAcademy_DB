import {
  ParticipantAchievementsSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type ParticipantAchievements,
  type ParticipantId,
} from '@ski-academy/shared-domain';

function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export const PARTICIPANT_ACHIEVEMENTS_PLANNING_ESTIMATES = {
  achievementsBytes: 4_096,
} as const;

export function participantAchievementsPath(participantId: ParticipantId): string {
  return toTransactionPath(canonicalPaths.participantAchievements(participantId));
}

export function parseParticipantAchievements(
  data: Record<string, unknown> | undefined
): ParticipantAchievements | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantAchievementsSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
