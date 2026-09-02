import {
  CourseCatalogContentSchema,
  normalizeFirestoreDocument,
  type CourseCatalogContent,
} from '@ski-academy/shared-domain';

export const COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES = {
  catalogContentBytes: 2_048,
} as const;

export function courseCatalogContentPath(courseId: CourseCatalogContent['courseId']): string {
  const path = `course_catalog_content/${courseId}`;
  return path.startsWith('/') ? path.slice(1) : path;
}

export function parseCourseCatalogContent(
  data: Record<string, unknown> | undefined,
  courseId?: CourseCatalogContent['courseId']
): CourseCatalogContent | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseCatalogContentSchema.safeParse(
    courseId ? { courseId, ...normalized } : normalized
  );
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
