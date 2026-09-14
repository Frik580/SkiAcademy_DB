import { describe, expect, it } from 'vitest';
import {
  CourseEnrollmentSchema,
  COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import {
  completePendingCourseEnrollmentOutcomeWork,
  pendingCourseEnrollmentOutcomeWork,
  resolveCourseEnrollmentOutcomeEnvelope,
} from './courseEnrollmentOutcomeWork';

describe('T32.9A.9C.B CourseEnrollment outcome work', () => {
  const { course, courseDays, confirmedEnrollment } = canonicalCourseDeliveryFixtures;
  const finalCourseDay = courseDays[1];
  const updatedAt = timestampFromDate(new Date('2026-01-10T00:00:00.000Z'));

  it('creates deterministic pending work due after the Instructor attendance window', () => {
    const work = pendingCourseEnrollmentOutcomeWork({
      enrollment: confirmedEnrollment,
      course,
      finalCourseDay,
      workRevision: 1,
      updatedAt,
    });
    expect(work.status).toBe('pending');
    expect(work.enrollmentId).toBe(confirmedEnrollment.enrollmentId);
    expect(work.courseId).toBe(course.courseId);
    expect(work.participantId).toBe(confirmedEnrollment.participantId);
    expect(work.finalCourseDayId).toBe(finalCourseDay.courseDayId);
    expect(work.dueAt.seconds).toBe(
      finalCourseDay.interval.endsAt.seconds + COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS / 1_000
    );
  });

  it('builds a stable scheduler envelope and closes pending work idempotently by revision', () => {
    const work = pendingCourseEnrollmentOutcomeWork({
      enrollment: confirmedEnrollment,
      course,
      finalCourseDay,
      workRevision: 3,
      updatedAt,
    });
    expect(resolveCourseEnrollmentOutcomeEnvelope(work)).toEqual(
      resolveCourseEnrollmentOutcomeEnvelope(work)
    );
    expect(resolveCourseEnrollmentOutcomeEnvelope(work).intent).toEqual({
      subjectKind: 'course_enrollment',
      subjectId: confirmedEnrollment.enrollmentId,
    });
    const completed = completePendingCourseEnrollmentOutcomeWork(work, {
      completedReason: 'deadline_processed',
      updatedAt,
    });
    expect(completed).toMatchObject({
      status: 'complete',
      completedReason: 'deadline_processed',
      workRevision: 4,
    });
  });

  it('does not treat guest pending reservations as outcome-work eligible', () => {
    expect(canonicalCourseDeliveryFixtures.guestPendingEnrollment.lifecycle.status).toBe('pending');
    const cancelled = CourseEnrollmentSchema.parse({
      ...confirmedEnrollment,
      lifecycle: { status: 'withdrawn', withdrawnAt: updatedAt },
      updatedAt,
      revision: 2,
    });
    expect(cancelled.lifecycle.status).toBe('withdrawn');
  });
});
