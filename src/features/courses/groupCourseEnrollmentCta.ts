import type { Course } from '../../types';
import type { CourseCatalogOperationalState } from '../course-enrollments';

export type GroupCourseEnrollmentCtaLabel =
  'enrolled' | 'accessSuspended' | 'soldOut' | 'unavailable' | 'enroll';

export interface GroupCourseEnrollmentCtaState {
  readonly availableSeats: number;
  readonly totalSeats: number;
  readonly hasOperationalCatalog: boolean;
  readonly isFull: boolean;
  readonly isCapacityFrozen: boolean;
  readonly isEnrollmentEligible: boolean;
  readonly enrollDisabled: boolean;
  readonly label: GroupCourseEnrollmentCtaLabel;
}

export function deriveGroupCourseEnrollmentCtaState(input: {
  readonly rawCourse: Pick<Course, 'availableSeats' | 'totalSeats'>;
  readonly catalogOperational?: CourseCatalogOperationalState;
  readonly isEnrolled: boolean;
  readonly isClientActive?: boolean;
}): GroupCourseEnrollmentCtaState {
  const { rawCourse, catalogOperational, isEnrolled, isClientActive } = input;
  const hasOperationalCatalog = catalogOperational !== undefined;
  const availableSeats = catalogOperational?.availableSeats ?? rawCourse.availableSeats;
  const totalSeats = catalogOperational?.totalSeats ?? rawCourse.totalSeats;
  const isCapacityFrozen = catalogOperational?.isCapacityFrozen ?? false;
  const isEnrollmentEligible =
    hasOperationalCatalog && catalogOperational.isEnrollmentEligible === true;
  const isFull = hasOperationalCatalog ? catalogOperational.isFull : availableSeats <= 0;

  const enrollDisabled =
    isClientActive === false ||
    (!isEnrolled && (isFull || isCapacityFrozen || !isEnrollmentEligible));

  let label: GroupCourseEnrollmentCtaLabel;
  if (isEnrolled) {
    label = 'enrolled';
  } else if (isClientActive === false) {
    label = 'accessSuspended';
  } else if (isCapacityFrozen || isFull) {
    label = 'soldOut';
  } else if (!hasOperationalCatalog || !isEnrollmentEligible) {
    label = 'unavailable';
  } else {
    label = 'enroll';
  }

  return {
    availableSeats,
    totalSeats,
    hasOperationalCatalog,
    isFull,
    isCapacityFrozen,
    isEnrollmentEligible,
    enrollDisabled,
    label,
  };
}
