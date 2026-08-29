import type {
  CourseCatalogReadModel,
  CourseEnrollmentLifecycleStatus,
  CourseEnrollmentReadModel,
  QueryCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
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

export function isEnrolledInCourse(
  enrollments: readonly CourseEnrollmentCabinetItem[],
  courseId: string,
  participantId?: string
): boolean {
  return enrollments.some(
    (enrollment) =>
      enrollment.courseId === courseId &&
      isActiveCourseEnrollmentLifecycle(enrollment.lifecycleStatus) &&
      (participantId === undefined || enrollment.participantId === participantId)
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
