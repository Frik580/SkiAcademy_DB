import type { CourseEnrollmentLifecycleStatus } from '@ski-academy/shared-domain';
import type { Course } from '../../types';
import type { CourseCatalogOperationalState } from '../course-enrollments';

export interface CourseCatalogLoadInput {
  readonly catalogStatus?: 'idle' | 'loading' | 'ready' | 'error';
  readonly onRetryCatalog?: () => void;
}

export type GroupCourseEnrollmentCtaLabel =
  | 'loading'
  | 'error'
  | 'enrolled'
  | 'awaitingPayment'
  | 'accessSuspended'
  | 'soldOut'
  | 'unavailable'
  | 'enroll';

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

export function deriveGroupCourseEnrollmentCtaState(
  input: CourseCatalogLoadInput & {
    readonly rawCourse: Pick<Course, 'availableSeats' | 'totalSeats'>;
    readonly catalogOperational?: CourseCatalogOperationalState;
    readonly isEnrolled: boolean;
    readonly enrollmentLifecycleStatus?: CourseEnrollmentLifecycleStatus;
    readonly isClientActive?: boolean;
  }
): GroupCourseEnrollmentCtaState {
  const { rawCourse, catalogOperational, isEnrolled, enrollmentLifecycleStatus, isClientActive } =
    input;
  const hasOperationalCatalog = catalogOperational !== undefined;
  const availableSeats = catalogOperational?.availableSeats ?? rawCourse.availableSeats;
  const totalSeats = catalogOperational?.totalSeats ?? rawCourse.totalSeats;
  const isCapacityFrozen = catalogOperational?.isCapacityFrozen ?? false;
  const isEnrollmentEligible =
    hasOperationalCatalog && catalogOperational.isEnrollmentEligible === true;
  const catalogStatus = input.catalogStatus ?? (hasOperationalCatalog ? 'ready' : 'idle');
  const isFull = hasOperationalCatalog && catalogOperational.isFull;
  const pending = catalogStatus === 'idle' || catalogStatus === 'loading';

  const enrollDisabled =
    pending ||
    catalogStatus === 'error' ||
    isEnrolled ||
    isClientActive === false ||
    isFull ||
    isCapacityFrozen ||
    !isEnrollmentEligible;

  let label: GroupCourseEnrollmentCtaLabel;
  if (isEnrolled) {
    label = enrollmentLifecycleStatus === 'pending' ? 'awaitingPayment' : 'enrolled';
  } else if (isClientActive === false) {
    label = 'accessSuspended';
  } else if (pending) {
    label = 'loading';
  } else if (catalogStatus === 'error') {
    label = 'error';
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
