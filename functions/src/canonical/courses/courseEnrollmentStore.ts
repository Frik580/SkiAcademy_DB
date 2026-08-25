import {
  CourseEnrollmentSchema,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type CourseEnrollment,
  type CourseEnrollmentId,
} from '@ski-academy/shared-domain';

export const COURSE_ENROLLMENT_PLANNING_ESTIMATES = {
  enrollmentBytes: 1_024,
} as const;

export function courseEnrollmentPath(enrollmentId: CourseEnrollmentId): string {
  return `course_enrollments/${enrollmentId}`;
}

export function parseCourseEnrollment(
  data: Record<string, unknown> | undefined
): CourseEnrollment | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseEnrollmentSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function readRevision(data: Record<string, unknown> | undefined): number | undefined {
  return readAggregateRevision(data);
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
