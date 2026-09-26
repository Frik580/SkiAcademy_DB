/**
 * Lesson-context UX gate. Backend authorization remains authoritative.
 */
export function isLessonContextProgressAssessmentEnabled(
  booking: { status: string; startsAtEpochMs: number },
  nowMs: number
): boolean {
  return (
    (booking.status === 'confirmed' || booking.status === 'completed') &&
    nowMs >= booking.startsAtEpochMs
  );
}
