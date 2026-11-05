import {
  ParticipantProgressSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type ParticipantId,
  type ParticipantProgress,
} from '@ski-academy/shared-domain';

function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export const PARTICIPANT_PROGRESS_PLANNING_ESTIMATES = {
  // 128 comments x 2,000 UTF-8 code points (up to 6,000 bytes each),
  // bounded author IDs and score maps, plus Firestore encoding headroom.
  progressBytes: 850_000,
} as const;

export function participantProgressPath(participantId: ParticipantId): string {
  return toTransactionPath(canonicalPaths.participantProgress(participantId));
}

export function parseParticipantProgress(
  data: Record<string, unknown> | undefined
): ParticipantProgress | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantProgressSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
