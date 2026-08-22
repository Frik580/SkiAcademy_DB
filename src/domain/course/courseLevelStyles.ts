import type { Course } from '../../types';

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

/** V2 soft pill — pastel fill, no border (course cards). */
const courseCardLevelBadgeClass: Record<CourseLevel | '', string> = {
  '': 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  beginner: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  advanced: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  expert: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
};

/** Badge on public / cabinet course cards. */
export function getCourseLevelCardBadgeClass(level: Course['level']): string {
  return courseCardLevelBadgeClass[level || ''];
}

export const courseLevelBadgeLabel: Record<CourseLevel, string> = {
  beginner: 'BEGINNER',
  intermediate: 'CARVE',
  advanced: 'PERFORMANCE',
  expert: 'EXPERT',
};

export function getCourseTrackLabel(level: Course['level']): string {
  if (!level) return '';
  const map: Record<string, string> = {
    beginner: 'BASE',
    intermediate: 'CARVE',
    advanced: 'PRO',
    expert: 'PRO',
    freeride: 'FREERIDE',
    freestyle: 'PARK',
  };
  return map[level] ?? 'BASE';
}

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

const USER_LEVEL_TO_COURSE_LEVEL: Record<number, CourseLevel> = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
  4: 'expert',
};

export function userLevelToCourseLevel(level: number): CourseLevel {
  return USER_LEVEL_TO_COURSE_LEVEL[level] ?? 'beginner';
}

/** Level badge in the navbar / cabinet — bordered admin style. */
export function getUserLevelBadgeClass(level: number): string {
  return getCourseLevelBadgeClass(userLevelToCourseLevel(level));
}
