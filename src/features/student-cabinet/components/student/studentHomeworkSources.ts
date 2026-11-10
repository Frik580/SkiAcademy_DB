import type { CabinetSessionItem } from '../../../course-enrollments';
import type { InstructorHomeworkSourceInput } from '../../../instructor-workspace/instructorLessonContextContracts';

/**
 * The student counterpart of InstructorHomeworkSection's confirmed-membership source list.
 * Never derive accessible chats from the account's legacy Booking display entries alone.
 */
export function getStudentHomeworkSources(
  accountSessions: readonly CabinetSessionItem[],
  participantId: string | undefined
): InstructorHomeworkSourceInput[] {
  if (!participantId) return [];
  const sources = new Map<string, InstructorHomeworkSourceInput>();
  const add = (threadId: string, label: string) => {
    if (threadId && !sources.has(threadId)) {
      sources.set(threadId, { threadId, participantIds: [participantId], label });
    }
  };

  for (const entry of accountSessions) {
    if (entry.kind === 'lesson') {
      const lesson = entry.session;
      if (!(lesson.participantIds ?? []).includes(participantId)) continue;
      if (lesson.status === 'cancelled') continue;
      add(lesson.id, lesson.instructorName || lesson.date);
      continue;
    }
    if (entry.participantId !== participantId || entry.lifecycleStatus === 'cancelled') continue;
    // Shared course chat and legacy per-enrollment chat; same source model as the
    // instructor's lesson card, deduplicated by the canonical thread ID.
    add(entry.courseId, entry.courseTitle);
    add(entry.enrollmentId, entry.courseTitle);
  }
  return [...sources.values()];
}
