import {
  IdempotencyKeySchema,
  compareCanonicalTimestamps,
  type AdminCourseEnrollmentDetailReadModel,
  type AdminCourseEnrollmentRosterItem,
} from '@ski-academy/shared-domain';
import type {
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
