import {
  CanonicalCommandError,
  DEFAULT_LESSON_LEVELS,
  LESSON_LEVELS_DOCUMENT_PATH,
  LessonLevelsCatalogSchema,
  resolveLessonLevel,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';

export { LESSON_LEVELS_DOCUMENT_PATH };
export function parseLessonLevels(value: unknown) {
  const parsed = LessonLevelsCatalogSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** A single bounded config read in the same transaction as booking creation. */
export async function assertActiveLessonLevel(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  value: string | undefined
): Promise<void> {
  if (value === undefined) return;
  const read = await session.tx.get({ path: LESSON_LEVELS_DOCUMENT_PATH });
  session.plan.planRead({ path: LESSON_LEVELS_DOCUMENT_PATH, category: 'aggregate' });
  const catalog = read.exists ? parseLessonLevels(read.data) : undefined;
  if (read.exists && !catalog) {
    throw new CanonicalCommandError('internal', { correlationId: envelope.context.correlationId });
  }
  const level = resolveLessonLevel(value, catalog?.levels ?? DEFAULT_LESSON_LEVELS);
  if (!level?.isActive) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'difficulty', reason: 'conflict' },
    });
  }
}
