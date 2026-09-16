import {
  IdempotencyKeySchema,
  compareCanonicalTimestamps,
  type AdminCourseEnrollmentDetailReadModel,
  type AdminCourseEnrollmentRosterItem,
  type AdminCourseListItem,
} from '@ski-academy/shared-domain';
import type {
  AdminCourseEnrollmentCourseOption,
  AdminCourseEnrollmentParticipantOption,
  AdminCourseEnrollmentTarget,
  AdminCourseEnrollmentView,
} from './adminCourseEnrollmentContracts';

function entropy(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createAdminCourseEnrollmentAttemptId(action: string) {
  return IdempotencyKeySchema.parse(`admin_course_enrollment:${action}:${entropy()}`);
}

export function parseAdminCourseEnrollmentView(
  value: string | null | undefined
): AdminCourseEnrollmentView {
  if (value === 'pending_guest' || value === 'history') return value;
  return 'roster';
}

export function captureAdminCourseEnrollmentTarget(
  detail: AdminCourseEnrollmentDetailReadModel
): AdminCourseEnrollmentTarget {
  return {
    enrollmentId: detail.enrollmentId,
    revision: detail.revision,
    courseId: detail.course.courseId,
    paymentId: detail.paymentId,
  };
}

export function mergeAdminCourseEnrollmentItems(
  cached: readonly AdminCourseEnrollmentRosterItem[],
  incoming: readonly AdminCourseEnrollmentRosterItem[]
): AdminCourseEnrollmentRosterItem[] {
  const byId = new Map(cached.map((item) => [item.enrollmentId, item]));
  for (const item of incoming) {
    const existing = byId.get(item.enrollmentId);
    if (!existing || item.revision >= existing.revision) byId.set(item.enrollmentId, item);
  }
  return [...byId.values()].sort((left, right) => {
    const updated = compareCanonicalTimestamps(left.updatedAt, right.updatedAt);
    return updated === 0 ? left.enrollmentId.localeCompare(right.enrollmentId) : -updated;
  });
}

export function collectAdminCourseEnrollmentParticipantOptions(
  items: readonly AdminCourseEnrollmentRosterItem[]
): AdminCourseEnrollmentParticipantOption[] {
  const byId = new Map<string, AdminCourseEnrollmentParticipantOption>();
  for (const item of items) {
    if (!item.payer || item.guestState === 'pending_unlinked') continue;
    byId.set(item.participant.participantId, item.participant);
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.displayName.localeCompare(right.displayName) ||
      left.participantId.localeCompare(right.participantId)
  );
}

export function toAdminCourseEnrollmentCourseOptions(
  items: readonly AdminCourseListItem[]
): AdminCourseEnrollmentCourseOption[] {
  return items
    .map((course) => ({
      courseId: course.courseId,
      title: course.title,
      revision: course.revision,
      availableSeats: course.capacity.availableSeats,
      lifecycle: course.lifecycle,
      instructorNames: (course.instructors ?? []).map((instructor) => instructor.name),
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function resolveCourseEnrollmentInstructorLabel(input: {
  readonly courseId: string;
  readonly courses: readonly AdminCourseEnrollmentCourseOption[];
  readonly instructorDirectory?: readonly {
    readonly instructorId: string;
    readonly displayName: string;
  }[];
  readonly attendanceInstructorIds?: readonly string[];
}): string | undefined {
  const fromCourse = input.courses.find(
    (course) => course.courseId === input.courseId
  )?.instructorNames;
  if (fromCourse && fromCourse.length > 0) {
    return [...new Set(fromCourse)].join(', ');
  }
  if (!input.instructorDirectory?.length || !input.attendanceInstructorIds?.length) {
    return undefined;
  }
  const byId = new Map(
    input.instructorDirectory.map((instructor) => [instructor.instructorId, instructor.displayName])
  );
  const names = [...new Set(input.attendanceInstructorIds)]
    .map((instructorId) => byId.get(instructorId))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(', ') : undefined;
}
