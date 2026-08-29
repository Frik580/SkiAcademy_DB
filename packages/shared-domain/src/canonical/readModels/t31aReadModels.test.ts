import { describe, expect, it } from 'vitest';
import {
  CourseAttendanceDayProjectionSchema,
  QueryCourseAttendanceReadModelsInputSchema,
  resolveCourseAttendanceFactualState,
} from './courseAttendanceReadModel';
import { CourseDayScheduleItemSchema } from './courseDayScheduleProjection';
import {
  CourseCatalogReadModelSchema,
  QueryCourseCatalogReadModelsInputSchema,
} from './courseCatalogReadModel';
import {
  CourseEnrollmentReadModelSchema,
  QueryCourseEnrollmentReadModelsInputSchema,
} from './courseEnrollmentReadModel';
import { CourseEnrollmentReadModelAuthorizedActionsSchema } from './readModelAuthorizedActions';

describe('T31A course read model contracts', () => {
  it('rejects booking-shaped fields on CourseEnrollmentReadModel', () => {
    const result = CourseEnrollmentReadModelSchema.safeParse({
      enrollmentId: 'enrollment_t31a_01',
      revision: 1,
      courseId: 'course_t31a_01',
      participant: { participantId: 'participant_t31a_01', displayName: 'Student' },
      lifecycle: { status: 'confirmed' },
      courseDisplay: { courseId: 'course_t31a_01', title: 'Course' },
      courseSchedule: {
        courseId: 'course_t31a_01',
        courseScheduleRevision: 1,
        courseDayCount: 1,
        startAt: { seconds: 1, nanoseconds: 0 },
        finalCourseDayEndsAt: { seconds: 2, nanoseconds: 0 },
        courseDays: [
          {
            courseDayId: 'course_day_t31a_01',
            dayOrder: 1,
            interval: {
              startsAt: { seconds: 1, nanoseconds: 0 },
              endsAt: { seconds: 2, nanoseconds: 0 },
            },
            timeZone: 'Asia/Almaty',
            revision: 1,
          },
        ],
      },
      bookingOrigin: 'account',
      authorizedActions: { canWithdraw: false, canRequestCancellation: true },
      updatedAt: { seconds: 1, nanoseconds: 0 },
      instructorId: 'instructor_legacy',
    });
    expect(result.success).toBe(false);
  });

  it('parses authorizedActions strictly', () => {
    expect(
      CourseEnrollmentReadModelAuthorizedActionsSchema.safeParse({
        canWithdraw: true,
        canRequestCancellation: false,
      }).success
    ).toBe(true);
    expect(
      CourseEnrollmentReadModelAuthorizedActionsSchema.safeParse({
        canWithdraw: true,
        canTransfer: true,
      }).success
    ).toBe(false);
  });

  it('keeps missing attendance distinct from absent', () => {
    expect(
      resolveCourseAttendanceFactualState({
        attendanceStatus: undefined,
        matchesCurrentOccurrence: false,
      })
    ).toBe('missing');
    expect(
      resolveCourseAttendanceFactualState({
        attendanceStatus: 'absent',
        matchesCurrentOccurrence: true,
      })
    ).toBe('absent');
    expect(
      CourseAttendanceDayProjectionSchema.safeParse({
        courseDayId: 'course_day_t31a_01',
        factualState: 'missing',
        courseDayRevision: 1,
        authorizedActions: { canRecordAttendance: false },
      }).success
    ).toBe(true);
    expect(
      CourseAttendanceDayProjectionSchema.safeParse({
        courseDayId: 'course_day_t31a_01',
        factualState: 'missing',
        attendanceStatus: 'absent',
        courseDayRevision: 1,
        authorizedActions: { canRecordAttendance: false },
      }).success
    ).toBe(false);
  });

  it('requires server-owned catalog capacity fields', () => {
    const parsed = CourseCatalogReadModelSchema.safeParse({
      courseId: 'course_t31a_01',
      revision: 1,
      title: 'Course',
      price: 10_000,
      capacity: {
        totalSeats: 8,
        availableSeats: 3,
        isCapacityFrozen: false,
        isEnrollmentEligible: true,
        isFull: false,
      },
      scheduleSummary: {
        startAt: { seconds: 1, nanoseconds: 0 },
        finalCourseDayEndsAt: { seconds: 2, nanoseconds: 0 },
        courseDayCount: 1,
      },
      courseSchedule: {
        courseId: 'course_t31a_01',
        courseScheduleRevision: 1,
        courseDayCount: 1,
        startAt: { seconds: 1, nanoseconds: 0 },
        finalCourseDayEndsAt: { seconds: 2, nanoseconds: 0 },
        courseDays: [
          CourseDayScheduleItemSchema.parse({
            courseDayId: 'course_day_t31a_01',
            dayOrder: 1,
            interval: {
              startsAt: { seconds: 1, nanoseconds: 0 },
              endsAt: { seconds: 2, nanoseconds: 0 },
            },
            timeZone: 'Asia/Almaty',
            revision: 1,
          }),
        ],
      },
      updatedAt: { seconds: 1, nanoseconds: 0 },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts optional idempotencyKey injected by callable transport for course catalog reads', () => {
    const parsed = QueryCourseCatalogReadModelsInputSchema.safeParse({
      scope: 'public',
      idempotencyKey: 'read:course_catalog:public:all',
    });
    expect(parsed.success).toBe(true);
  });

  it('fails closed on invalid read scopes', () => {
    expect(
      QueryCourseEnrollmentReadModelsInputSchema.safeParse({
        scope: 'guest_single',
      }).success
    ).toBe(false);
    expect(
      QueryCourseCatalogReadModelsInputSchema.safeParse({
        scope: 'authenticated',
      }).success
    ).toBe(false);
    expect(
      QueryCourseAttendanceReadModelsInputSchema.safeParse({
        scope: 'instructor_roster',
      }).success
    ).toBe(false);
  });
});
