import { ChatMessage } from '../../types';

/** Homework with no `homeworkForParticipantIds` (or empty) is visible to all lesson/course participants. */
export function isHomeworkVisibleToStudent(
  message: ChatMessage,
  participantId: string | undefined
): boolean {
  if (!message.isHomework) return false;
  const targets = message.homeworkForParticipantIds;
  if (!targets?.length) return true;
  if (!participantId) return false;
  return targets.includes(participantId);
}

/**
 * Build homework audience for a group lesson or course.
 * `null` / empty selection = all participants. Partial selection = listed Participant IDs only.
 */
export function buildHomeworkForParticipantIds(
  targetParticipantIds: string[] | null | undefined,
  participantCount: number,
  allParticipantIds?: string[]
): string[] | undefined {
  if (participantCount <= 1) return undefined;
  if (!targetParticipantIds?.length) return undefined;

  const unique = [...new Set(targetParticipantIds.filter(Boolean))];
  if (!unique.length) return undefined;

  if (allParticipantIds?.length) {
    const participantSet = new Set(allParticipantIds);
    const allSelected =
      unique.length >= participantSet.size && unique.every((id) => participantSet.has(id));
    if (allSelected) return undefined;
  }

  return unique;
}
