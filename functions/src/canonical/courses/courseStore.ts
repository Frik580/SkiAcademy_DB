import {
  CourseDaySchema,
  CourseSchema,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type Course,
  type CourseDay,
  type CourseDayId,
  type CourseId,
} from '@ski-academy/shared-domain';

export const COURSE_PLANNING_ESTIMATES = {
  courseBytes: 1_024,
  courseDayBytes: 768,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function coursePath(courseId: CourseId): string {
  return toTransactionPath(`courses/${courseId}`);
}

export function courseDayPath(courseId: CourseId, courseDayId: CourseDayId): string {
  return toTransactionPath(`courses/${courseId}/days/${courseDayId}`);
}

export function courseDaysCollectionPath(courseId: CourseId): string {
  return toTransactionPath(`courses/${courseId}/days`);
}

export function parseCourse(data: Record<string, unknown> | undefined): Course | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseCourseDay(data: Record<string, unknown> | undefined): CourseDay | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseDaySchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseCourseDays(
  documents: readonly { readonly data: Record<string, unknown> }[]
): CourseDay[] {
  const parsedDays: CourseDay[] = [];
  for (const document of documents) {
    const courseDay = parseCourseDay(document.data);
    if (courseDay) {
      parsedDays.push(courseDay);
    }
  }
  return parsedDays;
}

export function readRevision(data: Record<string, unknown> | undefined): number | undefined {
  return readAggregateRevision(data);
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

export {
  instructorCatalogPath,
  parseInstructorCatalog,
  type InstructorCatalogRecord,
} from '../bookings/bookingStore';
