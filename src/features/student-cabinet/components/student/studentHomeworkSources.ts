import type { CabinetSessionItem } from '../../../course-enrollments';
import type { LessonBookingCabinetItem } from '../../../lesson-bookings/lessonBookingContracts';
import type { InstructorHomeworkSourceInput } from '../../../instructor-workspace/instructorLessonContextContracts';

/**
 * The student counterpart of InstructorHomeworkSection's confirmed-membership source list.
 * Include historical canonical lessons: account_hot alone misses completed lessons
 * whose homework remains visible in Coach → Homework.
 */
export function getStudentHomeworkSources(
  accountSessions: readonly CabinetSessionItem[],
  participantId: string | undefined,
  historicalLessons: readonly LessonBookingCabinetItem[] = []
): InstructorHomeworkSourceInput[] {
  if (!participantId) return [];
  const sources = new Map<string, InstructorHomeworkSourceInput>();
  const add = (threadId: string, label: string) => {
    if (threadId && !sources.has(threadId)) {
      sources.set(threadId, { threadId, participantIds: [participantId], label });
    }
  };

  const addLesson = (lesson: LessonBookingCabinetItem) => {
    if (!(lesson.participantIds ?? []).includes(participantId)) return;
    if (lesson.status === 'cancelled') return;
    add(lesson.bookingId || lesson.id, lesson.instructorName || lesson.date);
  };

  for (const entry of accountSessions) {
    if (entry.kind === 'lesson') {
      addLesson(entry.session);
      continue;
    }
    if (entry.participantId !== participantId || entry.lifecycleStatus === 'cancelled') continue;
    // Enrollment identity does not establish a Booking/chat of the same ID.
    // Legacy enrollment candidates are confirmed separately before being added;
    // current chat authorization still decides whether any source is readable.
    add(entry.courseId, entry.courseTitle);
  }
  for (const lesson of historicalLessons) addLesson(lesson);
  return [...sources.values()];
}
