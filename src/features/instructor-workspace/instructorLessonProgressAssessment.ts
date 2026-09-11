/**
 * Lesson-context UX gate for instructor progress evaluation on a booking card.
 * Global progress authorization (relationships, other surfaces) is separate.
 */
export function isLessonContextProgressAssessmentEnabled(
  attendanceStatus?: 'present' | 'absent'
): boolean {
  return attendanceStatus === 'present';
}
