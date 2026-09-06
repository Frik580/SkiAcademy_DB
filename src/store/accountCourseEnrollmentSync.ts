/**
 * Account course-enrollment read sync must run wherever authenticated users
 * can see GroupCourseCard enroll CTAs.
 *
 * Historical bug: sync was limited to `role === 'user' && !instructorId` on
 * `/cabinet*` only. That left enrollments empty for:
 * - admin Arsenii viewing courses on `/` (HomeRoute keeps admins on home)
 * - dual-role accounts (`instructorId` set) on `/cabinet`
 *
 * Predicate `isEnrolledInCourse(courseId, selectedParticipantId)` then correctly
 * returned false because the enrollment never hydrated — not because IDs mismatched.
 */
export function shouldSyncAccountCourseEnrollments(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): boolean {
  if (!input.accountId) {
    return false;
  }
  return input.pathname === '/' || input.pathname.startsWith('/cabinet');
}
