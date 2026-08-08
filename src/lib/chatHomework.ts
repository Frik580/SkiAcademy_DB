import { ChatMessage } from '../types';

/** Homework with no `homeworkForUserIds` (or empty) is visible to all course participants. */
export function isHomeworkVisibleToStudent(
  message: ChatMessage,
  studentUid: string | undefined
): boolean {
  if (!message.isHomework) return false;
  if (!studentUid) return true;
  const targets = message.homeworkForUserIds;
  if (!targets?.length) return true;
  return targets.includes(studentUid);
}

/**
 * Build homework audience for a group course.
 * `null` / empty selection = all participants. Partial selection = listed uids only.
 */
export function buildHomeworkForUserIds(
  targetStudentUids: string[] | null | undefined,
  participantCount: number,
  allParticipantUids?: string[]
): string[] | undefined {
  if (participantCount <= 1) return undefined;
  if (!targetStudentUids?.length) return undefined;

  const unique = [...new Set(targetStudentUids.filter(Boolean))];
  if (!unique.length) return undefined;

  if (allParticipantUids?.length) {
    const participantSet = new Set(allParticipantUids);
    const allSelected =
      unique.length >= participantSet.size && unique.every((uid) => participantSet.has(uid));
    if (allSelected) return undefined;
  }

  return unique;
}
