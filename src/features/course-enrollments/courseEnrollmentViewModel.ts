import type {
  CourseCatalogReadModel,
  CourseEnrollmentLifecycleStatus,
  CourseEnrollmentReadModel,
  QueryCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
import { useCourseEnrollmentStore } from './courseEnrollmentStore';
import type {
  CourseCatalogOperationalState,
  CourseDaySessionItem,
  CourseEnrollmentCabinetItem,
} from './courseEnrollmentContracts';

const ACTIVE_ENROLLMENT_STATUSES: ReadonlySet<CourseEnrollmentLifecycleStatus> = new Set([
  'pending',
  'confirmed',
  'pending_cancellation',
]);

export function isActiveCourseEnrollmentLifecycle(
  status: CourseEnrollmentLifecycleStatus
): boolean {
  return ACTIVE_ENROLLMENT_STATUSES.has(status);
}

/**
 * Participant-scoped enrollment check. CTA / pre-submit guards must pass
 * `participantId` — never treat "any enrollment on this course for the account"
 * as already enrolled for the selected participant.
 */
export function isEnrolledInCourse(
  enrollments: readonly CourseEnrollmentCabinetItem[],
  courseId: string,
  participantId: string
): boolean {
  return enrollments.some(
    (enrollment) =>
      enrollment.courseId === courseId &&
      enrollment.participantId === participantId &&
      isActiveCourseEnrollmentLifecycle(enrollment.lifecycleStatus)
  );
}

/** Account-level: any managed participant has an active enrollment on the course. */
export function hasActiveEnrollmentForCourse(
  enrollments: readonly CourseEnrollmentCabinetItem[],
  courseId: string
): boolean {
  return enrollments.some(
    (enrollment) =>
      enrollment.courseId === courseId &&
      isActiveCourseEnrollmentLifecycle(enrollment.lifecycleStatus)
  );
}

/**
 * Card/details CTA enrollment flag: only true when a concrete selected
 * participant is already enrolled. Missing selection (multi-participant
 * without auto-select) must not disable enroll for the whole account.
 */
export function resolveParticipantScopedCourseEnrollment(input: {
  readonly enrollments: readonly CourseEnrollmentCabinetItem[];
  readonly courseId: string;
  readonly selectedParticipantId: string | undefined;
}): boolean {
  if (!input.selectedParticipantId) {
    return false;
  }
  return isEnrolledInCourse(input.enrollments, input.courseId, input.selectedParticipantId);
}

/** True when any selected participant is already enrolled (blocks mixed submit). */
export function isAnySelectedParticipantEnrolledInCourse(
  enrollments: readonly CourseEnrollmentCabinetItem[],
  courseId: string,
  selectedParticipantIds: readonly string[]
): boolean {
  return selectedParticipantIds.some((participantId) =>
    isEnrolledInCourse(enrollments, courseId, participantId)
  );
}

function timestampToDateString(seconds: number, nanoseconds: number, timeZone: string): string {
  return canonicalTimestampToLocalParts(seconds, nanoseconds, timeZone).date;
}

export function mapCourseEnrollmentReadModelToCabinetItem(
  readModel: CourseEnrollmentReadModel
): CourseEnrollmentCabinetItem {
  const firstDay = readModel.courseSchedule.courseDays[0]!;
  const lastDay =
    readModel.courseSchedule.courseDays[readModel.courseSchedule.courseDays.length - 1]!;
  const scheduleStartDate = timestampToDateString(
    firstDay.interval.startsAt.seconds,
    firstDay.interval.startsAt.nanoseconds,
    firstDay.timeZone
  );
  const scheduleEndDate = timestampToDateString(
    lastDay.interval.endsAt.seconds,
    lastDay.interval.endsAt.nanoseconds,
    lastDay.timeZone
  );

  return {
    enrollmentId: readModel.enrollmentId,
    revision: readModel.revision,
    courseId: readModel.courseId,
    originalCourseId: readModel.originalCourseId,
    participantId: readModel.participant.participantId,
    participantName: readModel.participant.displayName,
    lifecycleStatus: readModel.lifecycle.status,
    courseTitle: readModel.courseDisplay.title,
    courseSchedule: readModel.courseSchedule,
    scheduleStartDate,
    scheduleEndDate,
    bookingOrigin: readModel.bookingOrigin,
    authorizedActions: readModel.authorizedActions,
    payment: readModel.paymentPresentation,
    updatedAtSeconds: readModel.updatedAt.seconds,
  };
}

export function mapCourseCatalogReadModelToOperationalState(
  readModel: CourseCatalogReadModel
): CourseCatalogOperationalState {
  const firstDay = readModel.courseSchedule.courseDays[0]!;
  const lastDay =
    readModel.courseSchedule.courseDays[readModel.courseSchedule.courseDays.length - 1]!;
  return {
    courseId: readModel.courseId,
    revision: readModel.revision,
    title: readModel.title,
    priceMinorUnits: readModel.price,
    totalSeats: readModel.capacity.totalSeats,
    availableSeats: readModel.capacity.availableSeats,
    isCapacityFrozen: readModel.capacity.isCapacityFrozen,
    isEnrollmentEligible: readModel.capacity.isEnrollmentEligible,
    isFull: readModel.capacity.isFull,
    scheduleSummaryStartDate: timestampToDateString(
      readModel.scheduleSummary.startAt.seconds,
      readModel.scheduleSummary.startAt.nanoseconds,
      firstDay.timeZone
    ),
    scheduleSummaryEndDate: timestampToDateString(
      readModel.scheduleSummary.finalCourseDayEndsAt.seconds,
      readModel.scheduleSummary.finalCourseDayEndsAt.nanoseconds,
      lastDay.timeZone
    ),
    courseDayCount: readModel.scheduleSummary.courseDayCount,
    courseSchedule: readModel.courseSchedule,
  };
}

export function mergeCourseEnrollmentRecords(
  existing: ReadonlyMap<string, CourseEnrollmentCabinetItem>,
  incoming: QueryCourseEnrollmentReadModelsResult
): Map<string, CourseEnrollmentCabinetItem> {
  if (incoming.scope === 'instructor_roster') {
    return new Map(existing);
  }
  const readModels = incoming.items as readonly CourseEnrollmentReadModel[];
  const merged = new Map(existing);
  for (const readModel of readModels) {
    const item = mapCourseEnrollmentReadModelToCabinetItem(readModel);
    const cached = merged.get(item.enrollmentId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.enrollmentId, item);
    }
  }
  return merged;
}

export function patchCourseEnrollmentCancellationInStore(input: {
  readonly enrollmentId: string;
  readonly lifecycleStatus: 'cancelled' | 'pending_cancellation';
  readonly nextRevision: number;
}): void {
  const existing = useCourseEnrollmentStore.getState().items.get(input.enrollmentId);
  if (!existing || input.nextRevision < existing.revision) {
    return;
  }

  const updated: CourseEnrollmentCabinetItem = {
    ...existing,
    lifecycleStatus: input.lifecycleStatus,
    revision: input.nextRevision,
    authorizedActions: {
      canWithdraw: input.lifecycleStatus === 'pending_cancellation',
      canRequestCancellation: false,
    },
  };
  useCourseEnrollmentStore.getState().mergeItems(new Map([[input.enrollmentId, updated]]));
}

export function expandEnrollmentToCourseDaySessions(
  enrollment: CourseEnrollmentCabinetItem
): CourseDaySessionItem[] {
  return enrollment.courseSchedule.courseDays.map((courseDay) => {
    const start = canonicalTimestampToLocalParts(
      courseDay.interval.startsAt.seconds,
      courseDay.interval.startsAt.nanoseconds,
      courseDay.timeZone
    );
    const end = canonicalTimestampToLocalParts(
      courseDay.interval.endsAt.seconds,
      courseDay.interval.endsAt.nanoseconds,
      courseDay.timeZone
    );
    return {
      kind: 'course_day',
      enrollmentId: enrollment.enrollmentId,
      courseDayId: courseDay.courseDayId,
      courseId: enrollment.courseId,
      courseTitle: enrollment.courseTitle,
      date: start.date,
      time: start.time,
      endTime: end.time,
      timeZone: courseDay.timeZone,
      dayOrder: courseDay.dayOrder,
      lifecycleStatus: enrollment.lifecycleStatus,
      participantName: enrollment.participantName,
      revision: enrollment.revision,
      authorizedActions: enrollment.authorizedActions,
    };
  });
}

export function expandEnrollmentsToCourseDaySessions(
  enrollments: readonly CourseEnrollmentCabinetItem[]
): CourseDaySessionItem[] {
  const sessions: CourseDaySessionItem[] = [];
  for (const enrollment of enrollments) {
    if (!isActiveCourseEnrollmentLifecycle(enrollment.lifecycleStatus)) {
      continue;
    }
    sessions.push(...expandEnrollmentToCourseDaySessions(enrollment));
  }
  return sessions;
}

export function getEnrolledCourseIdsFromEnrollments(
  enrollments: readonly CourseEnrollmentCabinetItem[]
): ReadonlySet<string> {
  return new Set(
    enrollments
      .filter((enrollment) => isActiveCourseEnrollmentLifecycle(enrollment.lifecycleStatus))
      .map((enrollment) => enrollment.courseId)
  );
}

export function mergeCatalogRecords(
  existing: ReadonlyMap<string, CourseCatalogOperationalState>,
  incoming: readonly CourseCatalogReadModel[]
): Map<string, CourseCatalogOperationalState> {
  const merged = new Map(existing);
  for (const readModel of incoming) {
    const item = mapCourseCatalogReadModelToOperationalState(readModel);
    const cached = merged.get(item.courseId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.courseId, item);
    }
  }
  return merged;
}

/** Resolve operational catalog by marketing course id (Firestore document id). */
export function lookupCourseCatalogOperational(
  catalogByCourseId: ReadonlyMap<string, CourseCatalogOperationalState>,
  marketingCourseId: string
): CourseCatalogOperationalState | undefined {
  const direct = catalogByCourseId.get(marketingCourseId);
  if (direct) {
    return direct;
  }
  for (const entry of catalogByCourseId.values()) {
    if (entry.courseId === marketingCourseId) {
      return entry;
    }
  }
  return undefined;
}
