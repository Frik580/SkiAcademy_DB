import {
  InstructorRatingSummarySchema,
  InstructorReviewSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type InstructorId,
  type InstructorRatingSummary,
  type InstructorReview,
  type ReviewId,
} from '@ski-academy/shared-domain';

function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function instructorReviewPath(reviewId: ReviewId): string {
  return toTransactionPath(canonicalPaths.instructorReview(reviewId));
}

export function instructorRatingSummaryPath(instructorId: InstructorId): string {
  return toTransactionPath(canonicalPaths.instructorRatingSummary(instructorId));
}

export function parseInstructorReview(
  data: Record<string, unknown> | undefined
): InstructorReview | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = InstructorReviewSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseInstructorRatingSummary(
  data: Record<string, unknown> | undefined
): InstructorRatingSummary | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = InstructorRatingSummarySchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
