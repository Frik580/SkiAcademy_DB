import { compareCanonicalTimestamps } from '@ski-academy/shared-domain';
import type { AdminLessonBookingView } from '../lesson-bookings/lessonBookingAdminContracts';
import type { AdminCourseEnrollmentView } from '../course-enrollments/adminCourseEnrollmentContracts';
import type {
  AdminTrainingKindFilter,
  AdminTrainingRecord,
  AdminTrainingScope,
} from './adminTrainingRecordContracts';

export function parseAdminTrainingKindFilter(
  value: string | null | undefined
): AdminTrainingKindFilter | undefined {
  if (value === 'all' || value === 'lesson' || value === 'course') return value;
  return undefined;
}

export function parseAdminTrainingScope(
  value: string | null | undefined
): AdminTrainingScope | undefined {
  if (value === 'current' || value === 'history' || value === 'pending_guest') return value;
  return undefined;
}

export function resolveAdminTrainingKindFilter(input: {
  readonly explicit?: string | null;
  readonly hasBooking: boolean;
  readonly hasEnrollment: boolean;
  readonly hasCourseFilter: boolean;
}): AdminTrainingKindFilter {
  const parsed = parseAdminTrainingKindFilter(input.explicit);
  if (parsed) return parsed;
  if (input.hasEnrollment || input.hasCourseFilter) {
    return input.hasBooking ? 'all' : 'course';
  }
  return 'all';
}

export function resolveAdminTrainingScope(input: {
  readonly explicit?: string | null;
  readonly kind: AdminTrainingKindFilter;
  readonly bookingView: AdminLessonBookingView;
  readonly enrollmentView: AdminCourseEnrollmentView;
}): AdminTrainingScope {
  const parsed = parseAdminTrainingScope(input.explicit);
  if (parsed) return parsed;
  if (input.enrollmentView === 'pending_guest') return 'pending_guest';
  if (input.kind === 'lesson') return input.bookingView === 'history' ? 'history' : 'current';
  if (input.kind === 'course') return input.enrollmentView === 'history' ? 'history' : 'current';
  if (input.bookingView === 'history' && input.enrollmentView === 'history') return 'history';
  return 'current';
}

export function lessonViewForTrainingScope(scope: AdminTrainingScope): AdminLessonBookingView {
  return scope === 'history' ? 'history' : 'hot';
}

export function courseViewForTrainingScope(scope: AdminTrainingScope): AdminCourseEnrollmentView {
  if (scope === 'pending_guest') return 'pending_guest';
  if (scope === 'history') return 'history';
  return 'roster';
}

export function mergeAdminTrainingRecords(input: {
  readonly kind: AdminTrainingKindFilter;
  readonly lessons: readonly AdminTrainingRecord[];
  readonly courses: readonly AdminTrainingRecord[];
}): AdminTrainingRecord[] {
  const records =
    input.kind === 'lesson'
      ? [...input.lessons]
      : input.kind === 'course'
        ? [...input.courses]
        : [...input.lessons, ...input.courses];
  return records.sort((left, right) => {
    const updated = compareCanonicalTimestamps(
      left.kind === 'lesson' ? left.data.updatedAt : left.data.updatedAt,
      right.kind === 'lesson' ? right.data.updatedAt : right.data.updatedAt
    );
    if (updated !== 0) return -updated;
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.id.localeCompare(right.id);
  });
}
