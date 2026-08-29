import type {
  CourseEnrollmentLifecycleStatus,
  CourseEnrollmentReadModelAuthorizedActions,
  CourseEnrollmentReadModelPaymentPresentation,
  CourseScheduleProjectionReadModel,
} from '@ski-academy/shared-domain';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';

/** Customer cabinet projection — never carries synthetic booking/instructor fields. */
export interface CourseEnrollmentCabinetItem {
  readonly enrollmentId: string;
  readonly revision: number;
  readonly courseId: string;
  readonly originalCourseId?: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly lifecycleStatus: CourseEnrollmentLifecycleStatus;
  readonly courseTitle: string;
  readonly courseSchedule: CourseScheduleProjectionReadModel;
  readonly scheduleStartDate: string;
  readonly scheduleEndDate: string;
  readonly bookingOrigin: 'account' | 'guest' | 'instructor' | 'admin';
  readonly authorizedActions: CourseEnrollmentReadModelAuthorizedActions;
  readonly payment?: CourseEnrollmentReadModelPaymentPresentation;
  readonly updatedAtSeconds: number;
}

/** Server-owned operational catalog state for customer enrollment decisions. */
export interface CourseCatalogOperationalState {
  readonly courseId: string;
  readonly revision: number;
  readonly title: string;
  readonly priceMinorUnits: number;
  readonly totalSeats: number;
  readonly availableSeats: number;
  readonly isCapacityFrozen: boolean;
  readonly isEnrollmentEligible: boolean;
  readonly isFull: boolean;
  readonly scheduleSummaryStartDate: string;
  readonly scheduleSummaryEndDate: string;
  readonly courseDayCount: number;
  readonly courseSchedule: CourseScheduleProjectionReadModel;
}

/** Marketing/display Course fields remain on legacy Course type; operational fields come from catalog RM. */
export interface CourseCatalogPresentationInput {
  readonly marketingCourse: import('../../types').Course;
  readonly operational?: CourseCatalogOperationalState;
}

export interface CourseDaySessionItem {
  readonly kind: 'course_day';
  readonly enrollmentId: string;
  readonly courseDayId: string;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly date: string;
  readonly time: string;
  readonly endTime: string;
  readonly timeZone: string;
  readonly dayOrder: number;
  readonly lifecycleStatus: CourseEnrollmentLifecycleStatus;
  readonly participantName: string;
  readonly revision: number;
  readonly authorizedActions: CourseEnrollmentReadModelAuthorizedActions;
}

export type CabinetSessionItem =
  { readonly kind: 'lesson'; readonly session: LessonBookingCabinetItem } | CourseDaySessionItem;

export interface CourseEnrollmentSubmissionIdentity {
  readonly enrollmentId: string;
  readonly idempotencyKey: string;
}

export interface AuthenticatedCourseEnrollmentInput {
  readonly courseId: string;
  readonly participantIds: readonly string[];
  readonly exercisedCapability: ClientCallableCapability;
  readonly identity: CourseEnrollmentSubmissionIdentity;
}

export interface GuestCourseEnrollmentInput {
  readonly courseId: string;
  readonly enrollmentId: string;
  readonly participantId: string;
  readonly identity: CourseEnrollmentSubmissionIdentity;
  readonly guestDisplayName: string;
  readonly guestSkillLevel: string;
  readonly guestDiscipline: 'ski' | 'snowboard';
  readonly guestAgeYears: number;
}

export type CourseEnrollmentReadSyncState = {
  readonly hotLoading: boolean;
  readonly historyLoading: boolean;
  readonly historyHasMore: boolean;
  readonly historyCursor?: string;
  readonly catalogLoading: boolean;
  readonly error?: string;
  readonly loaded: boolean;
};
