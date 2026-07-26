import type { Course } from '../types';

export type CourseLevel = Exclude<NonNullable<Course['level']>, ''>;

/** Tailwind color tokens per course level — change colors here only. */
export const courseLevelColors = {
  beginner: 'emerald',
  intermediate: 'amber',
  advanced: 'blue',
  expert: 'violet',
  default: 'sky',
} as const satisfies Record<CourseLevel | 'default', string>;

const cardTextClass: Record<CourseLevel | '', string> = {
  '': 'text-[var(--ink-dim)]',
  beginner: 'text-emerald-600 dark:text-emerald-400',
  intermediate: 'text-amber-600 dark:text-amber-400',
  advanced: 'text-blue-600 dark:text-blue-400',
  expert: 'text-violet-600 dark:text-violet-400',
};

const modalHeroTextClass: Record<CourseLevel | '', string> = {
  '': 'text-white/90',
  beginner: 'text-emerald-400',
  intermediate: 'text-amber-400',
  advanced: 'text-blue-400',
  expert: 'text-violet-300',
};

const adminBadgeClass: Record<CourseLevel | '', string> = {
  '': 'bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/50',
  beginner:
    'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50',
  intermediate:
    'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50',
  advanced:
    'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50',
  expert:
    'bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-900/50',
};

/** Course cards on the public courses section. */
export function getCourseLevelCardClass(level: Course['level']): string {
  return cardTextClass[level || ''];
}

/** Level label over the dark hero image in the course details modal. */
export function getCourseLevelModalClass(level: Course['level']): string {
  return modalHeroTextClass[level || ''];
}

/** Badge in the admin courses table. */
export function getCourseLevelBadgeClass(level: Course['level']): string {
  return adminBadgeClass[level || ''];
}
