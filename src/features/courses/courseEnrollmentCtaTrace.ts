import type { CourseEnrollmentCabinetItem } from '../course-enrollments/courseEnrollmentContracts';
import { resolveParticipantScopedCourseEnrollment } from '../course-enrollments/courseEnrollmentViewModel';

export interface CourseEnrollmentCtaTraceInput {
  readonly courseId: string;
  readonly selectedParticipantId: string | undefined;
  readonly availableParticipantIds: readonly string[];
  readonly courseEnrollments: readonly CourseEnrollmentCabinetItem[];
  readonly accountId?: string;
  readonly accountRole?: string;
  readonly instructorId?: string;
  readonly syncEnabled?: boolean;
  readonly pathname?: string;
}

/**
 * Temporary diagnostic for Arsenii CTA identity tracing.
 * Enable with `window.__TRACE_COURSE_ENROLLMENT_CTA__ = true` in DEV.
 */
export function traceCourseEnrollmentCtaIdentity(input: CourseEnrollmentCtaTraceInput): void {
  if (typeof window === 'undefined') return;
  const enabled =
    import.meta.env.DEV &&
    (window as Window & { __TRACE_COURSE_ENROLLMENT_CTA__?: boolean })
      .__TRACE_COURSE_ENROLLMENT_CTA__ === true;
  if (!enabled) return;

  const matchingCourse = input.courseEnrollments.filter(
    (enrollment) => enrollment.courseId === input.courseId
  );
  const isEnrolled = resolveParticipantScopedCourseEnrollment({
    enrollments: input.courseEnrollments,
    courseId: input.courseId,
    selectedParticipantId: input.selectedParticipantId,
  });

  // Temporary DEV diagnostic — keep console.info.
  console.info('[course-enrollment-cta-trace]', {
    selectedParticipantId: input.selectedParticipantId,
    availableParticipants: input.availableParticipantIds.map((id) => ({ id })),
    courseEnrollments: input.courseEnrollments.map((enrollment) => ({
      id: enrollment.enrollmentId,
      participantId: enrollment.participantId,
      courseId: enrollment.courseId,
      status: enrollment.lifecycleStatus,
    })),
    matchingCourseEnrollments: matchingCourse.map((enrollment) => ({
      id: enrollment.enrollmentId,
      participantId: enrollment.participantId,
      courseId: enrollment.courseId,
      status: enrollment.lifecycleStatus,
      idsEqual:
        input.selectedParticipantId !== undefined &&
        enrollment.participantId === input.selectedParticipantId &&
        enrollment.courseId === input.courseId,
    })),
    isEnrolled,
    accountId: input.accountId,
    accountRole: input.accountRole,
    instructorId: input.instructorId,
    syncEnabled: input.syncEnabled,
    pathname: input.pathname,
    divergence:
      matchingCourse.length === 0
        ? 'no_enrollment_hydrated_for_course'
        : input.selectedParticipantId === undefined
          ? 'no_selected_participant'
          : matchingCourse.some(
                (enrollment) => enrollment.participantId === input.selectedParticipantId
              )
            ? 'matched'
            : 'participantId_mismatch',
  });
}
