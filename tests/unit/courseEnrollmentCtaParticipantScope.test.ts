import { describe, expect, it } from 'vitest';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import {
  isEnrolledInCourse,
  resolveParticipantScopedCourseEnrollment,
} from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { deriveGroupCourseEnrollmentCtaState } from '../../src/features/courses/groupCourseEnrollmentCta';
import { resolveDefaultParticipantSelection } from '../../src/features/participants/participantSelectionState';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { CourseCatalogOperationalState } from '../../src/features/course-enrollments/courseEnrollmentContracts';

const COURSE_ID = 'course_cta_scope_01';

const catalogOperational: CourseCatalogOperationalState = {
  courseId: COURSE_ID,
  revision: 1,
  title: 'Camp',
  priceMinorUnits: 100_000,
  totalSeats: 8,
  availableSeats: 6,
  isCapacityFrozen: false,
  isEnrollmentEligible: true,
  isFull: false,
  scheduleSummaryStartDate: '2027-01-15',
  scheduleSummaryEndDate: '2027-01-15',
  courseDayCount: 1,
  courseSchedule: {
    courseId: COURSE_ID,
    courseScheduleRevision: 1,
    courseDayCount: 1,
    startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
    courseDays: [
      {
        courseDayId: 'course_day_cta_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_800_000_000, nanoseconds: 0 },
          endsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
    ],
  },
};

function enrollment(
  participantId: string,
  overrides: Partial<CourseEnrollmentCabinetItem> = {}
): CourseEnrollmentCabinetItem {
  return {
    enrollmentId: `enrollment_${participantId}`,
    revision: 1,
    courseId: COURSE_ID,
    participantId,
    participantName: participantId,
    lifecycleStatus: 'confirmed',
    courseTitle: 'Camp',
    courseSchedule: catalogOperational.courseSchedule,
    scheduleStartDate: '2027-01-15',
    scheduleEndDate: '2027-01-15',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: true, canRequestCancellation: false },
    updatedAtSeconds: 1_800_000_000,
    ...overrides,
  };
}

function participant(participantId: string, displayName: string): ManagedParticipantOption {
  return {
    participantId,
    participantManagementId: `management_${participantId}`,
    displayName,
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 30 },
    authority: participantId === 'participant_a' ? 'self' : 'parent_guardian',
    revision: 1,
  };
}

function ctaFor(
  selectedParticipantId: string | undefined,
  enrollments: readonly CourseEnrollmentCabinetItem[]
) {
  const isEnrolled = resolveParticipantScopedCourseEnrollment({
    enrollments,
    courseId: COURSE_ID,
    selectedParticipantId,
  });
  return deriveGroupCourseEnrollmentCtaState({
    rawCourse: { availableSeats: 6, totalSeats: 8 },
    catalogOperational,
    isEnrolled,
  });
}

describe('course enrollment CTA participant scope', () => {
  it('auto-selects sole participant and disables CTA when that participant is enrolled', () => {
    const sole = participant('participant_a', 'Arsenii');
    const selected = resolveDefaultParticipantSelection([sole]);
    expect(selected).toEqual(['participant_a']);

    const enrollments = [enrollment('participant_a')];
    const cta = ctaFor(selected[0], enrollments);

    expect(cta.enrollDisabled).toBe(true);
    expect(cta.label).toBe('enrolled');
  });

  it('recomputes CTA per selected participant when only A is enrolled', () => {
    const managed = [
      participant('participant_a', 'A'),
      participant('participant_b', 'B'),
      participant('participant_c', 'C'),
    ];
    expect(resolveDefaultParticipantSelection(managed)).toEqual([]);

    const enrollments = [enrollment('participant_a')];

    expect(ctaFor('participant_a', enrollments).enrollDisabled).toBe(true);
    expect(ctaFor('participant_b', enrollments).enrollDisabled).toBe(false);
    expect(ctaFor('participant_c', enrollments).enrollDisabled).toBe(false);
    expect(ctaFor('participant_a', enrollments).enrollDisabled).toBe(true);

    // No card-level selection must not disable for the whole account.
    expect(ctaFor(undefined, enrollments).enrollDisabled).toBe(false);
    expect(ctaFor(undefined, enrollments).label).toBe('enroll');
  });

  it('after B enrolls, only B becomes enrolled while A/C stay unchanged', () => {
    const enrollmentsAfterB = [enrollment('participant_a'), enrollment('participant_b')];

    expect(isEnrolledInCourse(enrollmentsAfterB, COURSE_ID, 'participant_a')).toBe(true);
    expect(isEnrolledInCourse(enrollmentsAfterB, COURSE_ID, 'participant_b')).toBe(true);
    expect(isEnrolledInCourse(enrollmentsAfterB, COURSE_ID, 'participant_c')).toBe(false);

    expect(ctaFor('participant_a', enrollmentsAfterB).enrollDisabled).toBe(true);
    expect(ctaFor('participant_b', enrollmentsAfterB).enrollDisabled).toBe(true);
    expect(ctaFor('participant_c', enrollmentsAfterB).enrollDisabled).toBe(false);
  });
});
