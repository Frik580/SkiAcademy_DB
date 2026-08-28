import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import type { CabinetSessionItem, CourseDaySessionItem } from './courseEnrollmentContracts';
import { expandEnrollmentsToCourseDaySessions } from './courseEnrollmentViewModel';
import type { CourseEnrollmentCabinetItem } from './courseEnrollmentContracts';

function sessionSortKey(item: CabinetSessionItem): string {
  if (item.kind === 'lesson') {
    return `${item.session.date}T${item.session.time}`;
  }
  return `${item.date}T${item.time}`;
}

export function buildMixedCabinetSessionItems(input: {
  readonly lessonBookings: readonly LessonBookingCabinetItem[];
  readonly courseEnrollments: readonly CourseEnrollmentCabinetItem[];
}): CabinetSessionItem[] {
  const lessonItems: CabinetSessionItem[] = input.lessonBookings.map((session) => ({
    kind: 'lesson',
    session,
  }));
  const courseDayItems: CourseDaySessionItem[] = expandEnrollmentsToCourseDaySessions(
    input.courseEnrollments
  );
  return [...lessonItems, ...courseDayItems].sort((left, right) =>
    sessionSortKey(right).localeCompare(sessionSortKey(left))
  );
}

export function isCourseDaySession(item: CabinetSessionItem): item is CourseDaySessionItem {
  return item.kind === 'course_day';
}

export function isLessonSession(
  item: CabinetSessionItem
): item is { readonly kind: 'lesson'; readonly session: LessonBookingCabinetItem } {
  return item.kind === 'lesson';
}
