import { z } from 'zod';
import { CanonicalRecordMetadataSchema } from './accountParticipantAccess';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const LESSON_LEVELS_SETTING_ID = 'lesson_levels';
export const LESSON_LEVELS_DOCUMENT_PATH = 'settings/lesson_levels';
export const LessonLevelIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const LessonLevelDefinitionSchema = z
  .object({
    id: LessonLevelIdSchema,
    nameRu: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    marker: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .refine(
        (value) => /\p{Extended_Pictographic}/u.test(value) && !/[\p{L}\p{N}\p{Cc}]/u.test(value),
        'Use an emoji marker'
      ),
    order: z.number().int().min(0).max(100_000),
    isActive: z.boolean(),
  })
  .strict();
export type LessonLevelDefinition = Readonly<z.output<typeof LessonLevelDefinitionSchema>>;

export const LessonLevelsPayloadSchema = z
  .object({
    levels: z.array(LessonLevelDefinitionSchema).min(1).max(128),
  })
  .strict()
  .superRefine(({ levels }, ctx) => {
    if (new Set(levels.map((level) => level.id)).size !== levels.length) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate lesson level ID' });
    }
    if (!levels.some((level) => level.isActive)) {
      ctx.addIssue({ code: 'custom', message: 'At least one active lesson level is required' });
    }
    if (new Set(levels.map((level) => level.order)).size !== levels.length) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate lesson level order' });
    }
  });

export const LessonLevelsCatalogSchema = LessonLevelsPayloadSchema.safeExtend({
  revision: AggregateRevisionSchema.refine((value) => value >= 1),
  createdAt: CanonicalTimestampSchema,
  updatedAt: CanonicalTimestampSchema,
  audit: CanonicalRecordMetadataSchema.shape.audit,
});
export type LessonLevelsCatalog = Readonly<z.output<typeof LessonLevelsCatalogSchema>>;

// These are the existing persisted difficulty IDs, independent of mastery progression.
export const DEFAULT_LESSON_LEVELS: readonly LessonLevelDefinition[] = [
  {
    id: 'beginner',
    nameRu: 'Начинающий',
    nameEn: 'Beginner',
    marker: '🟢',
    order: 0,
    isActive: true,
  },
  {
    id: 'intermediate',
    nameRu: 'Средний уровень',
    nameEn: 'Intermediate',
    marker: '🔵',
    order: 1,
    isActive: true,
  },
  {
    id: 'advanced',
    nameRu: 'Продвинутый',
    nameEn: 'Advanced',
    marker: '🔴',
    order: 2,
    isActive: true,
  },
  { id: 'freeride', nameRu: 'Фрирайд', nameEn: 'Freeride', marker: '🏔️', order: 3, isActive: true },
  {
    id: 'freestyle',
    nameRu: 'Фристайл',
    nameEn: 'Freestyle',
    marker: '🛹',
    order: 4,
    isActive: true,
  },
];

const LEGACY_LESSON_LEVEL_IDS: Readonly<Record<string, string>> = {
  base: 'beginner',
  carve: 'intermediate',
  pro: 'advanced',
  park: 'freestyle',
};
export function normalizeLessonLevelId(value: string): string {
  const code = value.trim().toLowerCase();
  return LEGACY_LESSON_LEVEL_IDS[code] ?? code;
}

export function sortLessonLevels(
  levels: readonly LessonLevelDefinition[]
): LessonLevelDefinition[] {
  return [...levels].sort((a, b) => a.order - b.order);
}
export function activeLessonLevels(
  levels: readonly LessonLevelDefinition[]
): LessonLevelDefinition[] {
  return sortLessonLevels(levels).filter((level) => level.isActive);
}
export function resolveLessonLevel(value: string, levels: readonly LessonLevelDefinition[]) {
  const id = normalizeLessonLevelId(value);
  return levels.find((level) => level.id === id);
}
export function formatLessonLevelLabel(
  value: string,
  language: 'ru' | 'en',
  levels: readonly LessonLevelDefinition[],
  onUnknown?: (value: string) => void
): string {
  const level = resolveLessonLevel(value, levels);
  if (!level) {
    onUnknown?.(value);
    return language === 'ru' ? 'Уровень не указан' : 'Level not specified';
  }
  return `${level.marker} ${language === 'ru' ? level.nameRu : level.nameEn}`;
}

/** Archive only: existing IDs and historical references can never be removed. */
export function assertLessonLevelsRetained(
  current: readonly LessonLevelDefinition[],
  next: readonly LessonLevelDefinition[]
): void {
  if (current.some((level) => !next.some((candidate) => candidate.id === level.id))) {
    throw new Error('Existing lesson level IDs must be retained; archive instead');
  }
  // Legacy aliases remain reserved so a new definition cannot shadow them.
  if (next.some((level) => normalizeLessonLevelId(level.id) !== level.id)) {
    throw new Error('Reserved legacy lesson level ID');
  }
}
