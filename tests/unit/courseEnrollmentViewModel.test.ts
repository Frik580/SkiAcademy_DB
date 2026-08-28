import { describe, expect, it } from 'vitest';
import {
  expandEnrollmentsToCourseDaySessions,
  isEnrolledInCourse,
  mapCourseEnrollmentReadModelToCabinetItem,
} from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { CourseEnrollmentReadModel } from '@ski-academy/shared-domain';
import {
  createLogicalEnrollmentAttemptId,
  deriveGuestParticipantIdForEnrollment,
} from '../../src/features/course-enrollments/deriveEnrollmentIds';
import { guestSubjectIdFromCourseEnrollmentId } from '@ski-academy/shared-domain';

const readModelFixture: CourseEnrollmentReadModel = {
  enrollmentId: 'enrollment_vm_fixture_01',
  revision: 3,
  courseId: 'course_vm_fixture_01',
  participant: { participantId: 'participant_vm_fixture_01', displayName: 'Alice' },
  lifecycle: { status: 'confirmed' },
  courseDisplay: { courseId: 'course_vm_fixture_01', title: 'Camp' },
  courseSchedule: {
    courseId: 'course_vm_fixture_01',
    courseScheduleRevision: 1,
    courseDayCount: 2,
    startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_800_086_400, nanoseconds: 0 },
    courseDays: [
      {
        courseDayId: 'course_day_vm_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_800_000_000, nanoseconds: 0 },
          endsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
      {
        courseDayId: 'course_day_vm_02',
        dayOrder: 2,
        interval: {
          startsAt: { seconds: 1_800_086_400, nanoseconds: 0 },
          endsAt: { seconds: 1_800_096_400, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
    ],
  },
  bookingOrigin: 'account',
  authorizedActions: { canWithdraw: true, canRequestCancellation: true },
  updatedAt: { seconds: 1_800_000_000, nanoseconds: 0 },
};

describe('courseEnrollmentViewModel', () => {
  it('maps read model without synthetic course_* fields', () => {
    const item = mapCourseEnrollmentReadModelToCabinetItem(readModelFixture);
    expect(item.enrollmentId).toBe('enrollment_vm_fixture_01');
    expect(item).not.toHaveProperty('bookingId');
    expect(item).not.toHaveProperty('instructorId');
    expect(item).not.toHaveProperty('isLessonBooking');
  });

  it('detects enrolled courses from lifecycle', () => {
    const items = [mapCourseEnrollmentReadModelToCabinetItem(readModelFixture)];
    expect(isEnrolledInCourse(items, 'course_vm_fixture_01')).toBe(true);
    expect(isEnrolledInCourse(items, 'course_other')).toBe(false);
  });

  it('expands course days for calendar sessions', () => {
    const item = mapCourseEnrollmentReadModelToCabinetItem(readModelFixture);
    const sessions = expandEnrollmentsToCourseDaySessions([item]);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.kind === 'course_day')).toBe(true);
    expect(sessions[0]?.courseDayId).toBe('course_day_vm_01');
  });

  it('sorts mixed lesson and course_day sessions chronologically', () => {
    const lesson: LessonBookingCabinetItem = {
      id: 'booking_a',
      bookingId: 'booking_a',
      revision: 1,
      status: 'confirmed',
      date: '2027-01-10',
      time: '08:00',
      durationHours: 2,
      instructorId: 'instructor_fixture_01',
      instructorName: 'Coach',
      instructorAvatar: '',
      participantNames: ['Alice'],
      partyKind: 'individual',
      payment: { kind: 'visible' },
      bookingOrigin: 'account',
      isLessonBooking: true,
    };
    const enrollment = mapCourseEnrollmentReadModelToCabinetItem(readModelFixture);
    const mixed = buildMixedCabinetSessionItems({
      lessonBookings: [lesson],
      courseEnrollments: [enrollment],
    });
    expect(mixed.some((item) => item.kind === 'lesson')).toBe(true);
    expect(mixed.some((item) => item.kind === 'course_day')).toBe(true);
    const keys = mixed.map((item) =>
      item.kind === 'lesson' ? `${item.session.date}T${item.session.time}` : `${item.date}T${item.time}`
    );
    const sorted = [...keys].sort((a, b) => b.localeCompare(a));
    expect(keys).toEqual(sorted);
  });

  it('derives deterministic guest enrollment identity', () => {
    const enrollmentId = createLogicalEnrollmentAttemptId();
    const participantId = deriveGuestParticipantIdForEnrollment(enrollmentId);
    expect(participantId).toMatch(/^[0-9a-f]{64}$/);
    expect(guestSubjectIdFromCourseEnrollmentId(enrollmentId)).toMatch(/^[0-9a-f]{64}$/);
  });
});
