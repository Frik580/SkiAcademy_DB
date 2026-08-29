import { describe, expect, it } from 'vitest';
import type { CourseCatalogReadModel } from '@ski-academy/shared-domain';
import { deriveGroupCourseEnrollmentCtaState } from '../../src/features/courses/groupCourseEnrollmentCta';
import {
  lookupCourseCatalogOperational,
  mapCourseCatalogReadModelToOperationalState,
  mergeCatalogRecords,
} from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import type { Course } from '../../src/types';

const marketingCourse: Pick<Course, 'availableSeats' | 'totalSeats'> = {
  availableSeats: 8,
  totalSeats: 8,
};

const catalogReadModel: CourseCatalogReadModel = {
  courseId: 'course_1784217360616',
  revision: 2,
  title: 'BASE — First Turns',
  price: 250_000,
  capacity: {
    totalSeats: 8,
    availableSeats: 8,
    isCapacityFrozen: false,
    isEnrollmentEligible: true,
    isFull: false,
  },
  scheduleSummary: {
    startAt: { seconds: 1_795_363_200, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_795_795_200, nanoseconds: 0 },
    courseDayCount: 5,
  },
  courseSchedule: {
    courseId: 'course_1784217360616',
    courseScheduleRevision: 1,
    courseDayCount: 5,
    startAt: { seconds: 1_795_363_200, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_795_795_200, nanoseconds: 0 },
    courseDays: [
      {
        courseDayId: 'course_day_1784217360616_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_795_363_200, nanoseconds: 0 },
          endsAt: { seconds: 1_795_377_600, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
    ],
  },
  updatedAt: { seconds: 1_795_363_200, nanoseconds: 0 },
};

describe('deriveGroupCourseEnrollmentCtaState', () => {
  it('enables enroll when operational catalog is eligible with seats', () => {
    const operational = mapCourseCatalogReadModelToOperationalState(catalogReadModel);
    const cta = deriveGroupCourseEnrollmentCtaState({
      rawCourse: marketingCourse,
      catalogOperational: operational,
      isEnrolled: false,
    });

    expect(cta.availableSeats).toBe(8);
    expect(cta.isEnrollmentEligible).toBe(true);
    expect(cta.isFull).toBe(false);
    expect(cta.enrollDisabled).toBe(false);
    expect(cta.label).toBe('enroll');
  });

  it('shows sold out when available seats are zero', () => {
    const operational = mapCourseCatalogReadModelToOperationalState({
      ...catalogReadModel,
      capacity: {
        ...catalogReadModel.capacity,
        availableSeats: 0,
        isEnrollmentEligible: false,
        isFull: true,
      },
    });
    const cta = deriveGroupCourseEnrollmentCtaState({
      rawCourse: marketingCourse,
      catalogOperational: operational,
      isEnrolled: false,
    });

    expect(cta.isFull).toBe(true);
    expect(cta.enrollDisabled).toBe(true);
    expect(cta.label).toBe('soldOut');
  });

  it('shows unavailable when seats exist but operational catalog is missing', () => {
    const cta = deriveGroupCourseEnrollmentCtaState({
      rawCourse: marketingCourse,
      isEnrolled: false,
    });

    expect(cta.availableSeats).toBe(8);
    expect(cta.isFull).toBe(false);
    expect(cta.isEnrollmentEligible).toBe(false);
    expect(cta.enrollDisabled).toBe(true);
    expect(cta.label).toBe('unavailable');
  });

  it('shows unavailable when seats exist but operational eligibility is false', () => {
    const operational = mapCourseCatalogReadModelToOperationalState({
      ...catalogReadModel,
      capacity: {
        ...catalogReadModel.capacity,
        isEnrollmentEligible: false,
      },
    });
    const cta = deriveGroupCourseEnrollmentCtaState({
      rawCourse: marketingCourse,
      catalogOperational: operational,
      isEnrolled: false,
    });

    expect(cta.isFull).toBe(false);
    expect(cta.enrollDisabled).toBe(true);
    expect(cta.label).toBe('unavailable');
  });
});

describe('lookupCourseCatalogOperational', () => {
  it('matches canonical course id to marketing course id', () => {
    const catalogByCourseId = mergeCatalogRecords(new Map(), [catalogReadModel]);
    const marketingCourseId = 'course_1784217360616';

    expect(lookupCourseCatalogOperational(catalogByCourseId, marketingCourseId)).toEqual(
      catalogByCourseId.get(marketingCourseId)
    );
    expect(lookupCourseCatalogOperational(catalogByCourseId, marketingCourseId)?.courseId).toBe(
      marketingCourseId
    );
  });
});
