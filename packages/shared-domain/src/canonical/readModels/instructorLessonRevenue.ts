import { z } from 'zod';
import { KztMinorUnitsSchema } from '../primitives';
import type { CanonicalExecutionScope } from '../canonicalScope';

export const INSTRUCTOR_LESSON_REVENUE_STATE_PATH = 'instructor_lesson_revenue/state';

export function instructorLessonRevenueScopeKey(scope: CanonicalExecutionScope): string {
  return scope.dataScope === 'live' ? 'live' : `test_${scope.testSessionId}`;
}

export function instructorLessonRevenuePath(
  scope: CanonicalExecutionScope,
  instructorId: string
): string {
  return `instructor_lesson_revenue/${instructorLessonRevenueScopeKey(scope)}/instructors/${instructorId}`;
}

/** Sanitized school revenue only. No Payment, payer, or participant details. */
export const InstructorLessonRevenueSummarySchema = z
  .object({
    retainedAmount: KztMinorUnitsSchema,
    unavailableCount: z.number().int().nonnegative().safe(),
    revision: z.number().int().nonnegative().safe(),
  })
  .strict();

export type InstructorLessonRevenueSummary = z.output<typeof InstructorLessonRevenueSummarySchema>;

export type InstructorLessonRevenueState =
  | { readonly status: 'loading' | 'error' | 'unavailable' }
  | { readonly status: 'loaded'; readonly retainedAmount: number };
