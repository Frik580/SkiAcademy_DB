import { ActivityLog, Booking, Course, Instructor, Review, UserProfile } from '../../../types';
import {
  SkillConfig,
  SkillItem,
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
  getSkillItemTitle,
  getSkillItemSection,
} from '../../../lib/skillData';
import { Language } from '../../../lib/i18n/translations';
import { translateCourse, translateInstructorName } from '../../../lib/i18n/contentTranslation';
import {
  parseCourseDates,
  type TranslationKey,
  getDifficultyLabel,
} from '../../../lib/LanguageContext';
import {
  getRecommendationTasks,
  hasPendingRecommendations,
} from '../../../lib/lessonRecommendations';
import { getCourseTrackLabel as getTrackLabelForLevel } from '../../../lib/courseLevelStyles';
import {
  customTodayTaskId,
  resolveCompletedTodayTaskIds,
  skillTodayTaskId,
} from '../../../lib/todayChecklist';
import {
  evaluateEarnedAchievements,
  formatAchievementLabel,
  normalizeAchievementsConfig,
  type AchievementsConfig,
} from '../../../lib/achievements';

export type StudentCabinetTab =
  | 'home'
  | 'training'
  | 'coach'
  | 'development'
  | 'calendar'
  | 'courses'
  | 'instructors'
  | 'settings'
  | 'profile_personal'
  | 'profile_journey'
  | 'profile_skills'
  | 'profile_certificates'
  | 'profile_achievements'
  | 'profile_season'
  | 'profile_videos'
  | 'profile_preferences'
  | 'history';

export const PROFILE_TABS: StudentCabinetTab[] = [
  'settings',
  'profile_personal',
  'profile_journey',
  'profile_skills',
  'profile_certificates',
  'profile_achievements',
  'profile_season',
  'profile_videos',
  'profile_preferences',
];

export const isProfileTab = (tab: StudentCabinetTab) => PROFILE_TABS.includes(tab);

/** Maps deep-link tabs to the bottom navigation item that should appear active. */
export const resolveStudentBottomNavTab = (tab: StudentCabinetTab): StudentCabinetTab => {
  if (tab === 'development' || tab === 'calendar' || tab === 'courses') return 'training';
  if (tab === 'instructors') return 'coach';
  if (isProfileTab(tab)) return 'settings';
  return tab;
};

export interface SectionProgress {
  id: string;
  label: string;
  percent: number;
}

export interface TodayTaskBookingContext {
  bookingId: string;
  title: string;
  dateLabel: string;
  isCourse: boolean;
}

export interface TodayTask {
  id: string;
  label: string;
  done: boolean;
  kind: 'recommendation' | 'skill' | 'custom';
  bookingId?: string;
  recommendationId?: string;
  skillItemId?: string;
  customTaskId?: string;
  bookingContext?: TodayTaskBookingContext;
}

export interface Achievement {
  id: string;
  icon: string;
  label: string;
  earnedAtLabel?: string;
  earnedAt?: string;
}

export interface RecentLesson {
  id: string;
  title: string;
  dateLabel: string;
  rating: number;
  reviewSnippet?: string;
  instructorName: string;
  booking: Booking;
  needsReview?: boolean;
  pendingRecommendationsCount?: number;
}

export type HistoryFilter = 'all' | 'training' | 'progress' | 'homework';

export type HistoryEventAction =
  | { type: 'open_lesson'; bookingId: string }
  | { type: 'write_review'; bookingId: string }
  | { type: 'open_development' };

export interface HistoryEventCta {
  labelKey: TranslationKey;
  action: HistoryEventAction;
}

export interface HistoryEvent {
  id: string;
  date: string;
  dateLabel: string;
  title: string;
  subtitle?: string;
  kind: 'training' | 'level' | 'homework' | 'points' | 'review';
  bookingId?: string;
  cta?: HistoryEventCta;
}

export interface HistoryMonthGroup {
  monthKey: string;
  monthLabel: string;
  events: HistoryEvent[];
}

export interface StudentStats {
  lessons: number;
  hours: number;
  exercisesMastered: number;
  points: number;
}

const LEVEL_NAMES_EN: Record<number, string> = {
  1: 'BEGINNER',
  2: 'CARVE',
  3: 'PERFORMANCE',
  4: 'EXPERT',
};

const LEVEL_NAMES_RU: Record<number, string> = {
  1: 'НАЧИНАЮЩИЙ',
  2: 'CARVE',
  3: 'PERFORMANCE',
  4: 'ЭКСПЕРТ',
};

const LEVEL_LABEL_EN: Record<number, string> = {
  1: 'Beginner',
  2: 'Carve',
  3: 'Performance',
  4: 'Expert',
};

const LEVEL_LABEL_RU: Record<number, string> = {
  1: 'Начинающий',
  2: 'Carve',
  3: 'Performance',
  4: 'Эксперт',
};

export const getLevelName = (level: number, language: 'en' | 'ru') =>
  (language === 'ru' ? LEVEL_NAMES_RU : LEVEL_NAMES_EN)[level] || LEVEL_NAMES_EN[1];

export const getLevelLabel = (level: number, language: 'en' | 'ru') =>
  (language === 'ru' ? LEVEL_LABEL_RU : LEVEL_LABEL_EN)[level] || LEVEL_LABEL_EN[1];

export const getGreeting = (language: 'en' | 'ru', firstName: string) => {
  const hour = new Date().getHours();
  let prefix: string;
  if (hour < 12) prefix = language === 'ru' ? 'Доброе утро' : 'Good morning';
  else if (hour < 18) prefix = language === 'ru' ? 'Добрый день' : 'Good afternoon';
  else prefix = language === 'ru' ? 'Добрый вечер' : 'Good evening';
  return `${prefix}, ${firstName} 👋`;
};

export const getFirstName = (displayName: string) => displayName.split(' ')[0] || displayName;

export const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const BOOKING_TIME_RANGE_RE = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
const BOOKING_START_TIME_RE = /^(\d{2}):(\d{2})$/;

export const parseBookingStartTime = (time: string): { h: number; m: number } | null => {
  const rangeMatch = time.match(BOOKING_TIME_RANGE_RE);
  if (rangeMatch) {
    const [h, m] = rangeMatch[1].split(':').map(Number);
    return { h, m };
  }
  const startMatch = time.match(BOOKING_START_TIME_RE);
  if (startMatch) {
    return { h: Number(startMatch[1]), m: Number(startMatch[2]) };
  }
  return null;
};

export const parseBookingEndTime = (
  time: string,
  durationHours: number
): { h: number; m: number } | null => {
  const rangeMatch = time.match(BOOKING_TIME_RANGE_RE);
  if (rangeMatch) {
    const [h, m] = rangeMatch[2].split(':').map(Number);
    return { h, m };
  }
  const start = parseBookingStartTime(time);
  if (!start) return null;
  const total = start.h * 60 + start.m + Math.round(durationHours * 60);
  return { h: Math.floor(total / 60) % 24, m: total % 60 };
};

const buildLocalDateTime = (dateStr: string, h: number, m: number): Date => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
};

const getBookingDailyTimeWindow = (
  booking: Booking,
  courses: Course[],
  dateStr: string
): { start: Date; end: Date } | null => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const [sh, sm] = parsed.startTime.split(':').map(Number);
    const [eh, em] = parsed.endTime.split(':').map(Number);
    return {
      start: buildLocalDateTime(dateStr, sh, sm),
      end: buildLocalDateTime(dateStr, eh, em),
    };
  }
  const startParsed = parseBookingStartTime(booking.time);
  const endParsed = parseBookingEndTime(booking.time, booking.durationHours);
  if (!startParsed || !endParsed) return null;
  return {
    start: buildLocalDateTime(dateStr, startParsed.h, startParsed.m),
    end: buildLocalDateTime(dateStr, endParsed.h, endParsed.m),
  };
};

/** First day + start hour of the booking or course. */
export const resolveBookingStartDateTime = (booking: Booking, courses: Course[]): Date | null => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const [h, m] = parsed.startTime.split(':').map(Number);
    return buildLocalDateTime(toYMD(parsed.start), h, m);
  }
  const startTime = parseBookingStartTime(booking.time);
  if (!startTime) return buildLocalDateTime(booking.date, 0, 0);
  return buildLocalDateTime(booking.date, startTime.h, startTime.m);
};

/** Last day + end hour of the booking or course. */
export const resolveBookingEndDateTime = (booking: Booking, courses: Course[]): Date | null => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const [h, m] = parsed.endTime.split(':').map(Number);
    return buildLocalDateTime(toYMD(parsed.end), h, m);
  }
  const endTime = parseBookingEndTime(booking.time, booking.durationHours);
  if (!endTime) return null;
  return buildLocalDateTime(booking.date, endTime.h, endTime.m);
};

export const isBookingPastBySchedule = (
  booking: Booking,
  courses: Course[],
  now = new Date()
): boolean => {
  if (booking.isDeleted) return true;
  if (booking.status === 'cancelled' || booking.status === 'completed') return true;
  const end = resolveBookingEndDateTime(booking, courses);
  return end ? now >= end : false;
};

export const isBookingUpcomingBySchedule = (
  booking: Booking,
  courses: Course[],
  now = new Date()
): boolean => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  const start = resolveBookingStartDateTime(booking, courses);
  return start ? now < start : false;
};

/** Started but last day/end hour not reached yet (multi-day courses included). */
export const isBookingCurrentBySchedule = (
  booking: Booking,
  courses: Course[],
  now = new Date()
): boolean => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  return (
    !isBookingPastBySchedule(booking, courses, now) &&
    !isBookingUpcomingBySchedule(booking, courses, now)
  );
};

/** In session right now (today's time slot). */
export const isBookingInProgressNow = (
  booking: Booking,
  courses: Course[],
  now = new Date()
): boolean => {
  if (!isActiveBooking(booking)) return false;
  const todayStr = toYMD(now);
  if (!isBookingOnDate(booking, todayStr, courses)) return false;
  const window = getBookingDailyTimeWindow(booking, courses, todayStr);
  if (!window) return false;
  return now >= window.start && now < window.end;
};

export const getCurrentSessions = (
  bookings: Booking[],
  courses: Course[],
  now = new Date()
): Booking[] =>
  bookings
    .filter((b) => isBookingInProgressNow(b, courses, now))
    .sort((a, b) => a.time.localeCompare(b.time));

export interface TodaySessionCountdown {
  booking: Booking;
  startsAt: Date;
}

/** Nearest session or course on today that has not started yet. */
export const getTodaySessionCountdown = (
  bookings: Booking[],
  courses: Course[],
  now = new Date()
): TodaySessionCountdown | null => {
  const todayStr = toYMD(now);
  const candidates: TodaySessionCountdown[] = [];

  for (const booking of bookings.filter(isActiveBooking)) {
    if (!isBookingOnDate(booking, todayStr, courses)) continue;
    const window = getBookingDailyTimeWindow(booking, courses, todayStr);
    if (!window || now >= window.start) continue;
    candidates.push({ booking, startsAt: window.start });
  }

  candidates.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return candidates[0] ?? null;
};

export const formatCountdownRemaining = (ms: number, language: 'en' | 'ru') => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (language === 'ru') {
    if (h > 0) return `${h}ч ${pad(m)}м ${pad(s)}с`;
    return `${m}м ${pad(s)}с`;
  }
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
};

export const addMinutesToTime = (time: string, hours: number) => {
  const parsed = parseBookingStartTime(time);
  if (!parsed || !Number.isFinite(hours)) return '';
  const total = parsed.h * 60 + parsed.m + Math.round(hours * 60);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
};

/** Private lessons: "09:00–11:00". Course bookings already store a range: "09:00–13:00". */
export const formatSessionTimeRange = (booking: Pick<Booking, 'time' | 'durationHours'>) => {
  const rangeMatch = booking.time.match(BOOKING_TIME_RANGE_RE);
  if (rangeMatch) {
    return `${rangeMatch[1]}–${rangeMatch[2]}`;
  }
  const endTime = addMinutesToTime(booking.time, booking.durationHours);
  if (!endTime) return booking.time;
  return `${booking.time}–${endTime}`;
};

export const formatSessionDayLabel = (
  dateStr: string,
  language: 'en' | 'ru',
  t: (key: TranslationKey) => string
) => {
  const today = toYMD(new Date());
  const tomorrow = toYMD(new Date(Date.now() + 86400000));
  if (dateStr === today) return t('scToday');
  if (dateStr === tomorrow) return t('scTomorrow');
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export const getDifficultyShort = (difficulty: Booking['difficulty']) => {
  const map: Record<string, string> = {
    beginner: 'BASE',
    intermediate: 'CARVE',
    advanced: 'PRO',
    freeride: 'PRO',
    freestyle: 'PRO',
  };
  return map[difficulty] || 'BASE';
};

const isActiveBooking = (b: Booking) =>
  !b.isDeleted && (b.status === 'confirmed' || b.status === 'pending');

export const resolveBookingStartDate = (booking: Booking, courses: Course[]) => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    return toYMD(parsed.start);
  }
  return booking.date;
};

/** Instructor homework stays in «Today» only for recent lessons (days since lesson date). */
export const RECOMMENDATION_TODAY_WINDOW_DAYS = 14;

export const getLessonAgeDays = (
  booking: Booking,
  courses: Course[],
  fromDate = new Date()
): number | null => {
  const dateStr = resolveBookingStartDate(booking, courses);
  const lessonDate = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(lessonDate.getTime())) return null;
  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());
  return Math.floor((today.getTime() - lessonDay.getTime()) / 86_400_000);
};

export const isBookingInTodayRecommendationWindow = (
  booking: Booking,
  courses: Course[],
  maxDays = RECOMMENDATION_TODAY_WINDOW_DAYS,
  fromDate = new Date()
) => {
  const ageDays = getLessonAgeDays(booking, courses, fromDate);
  if (ageDays === null) return true;
  return ageDays >= 0 && ageDays <= maxDays;
};

export const formatBookingDayMonth = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const dateStr = resolveBookingStartDate(booking, courses);
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export const formatCourseDateRangeLabel = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const courseId = booking.instructorId.substring('course_'.length);
  const course = courses.find((c) => c.id === courseId);
  const parsed = parseCourseDates(course ? course.dates : booking.date);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  const start = parsed.start.toLocaleDateString(locale, opts);
  const end = parsed.end.toLocaleDateString(locale, opts);
  if (start === end) return start;
  return `${start} — ${end}`;
};

export const formatRecentLessonDateLabel = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) =>
  booking.instructorId.startsWith('course_')
    ? formatCourseDateRangeLabel(booking, courses, language)
    : formatBookingDayMonth(booking, courses, language);

export const getRecentLessonTitle = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    if (course) {
      return translateCourse(course, language).title;
    }
    const cleanName = booking.instructorName
      .replace(/\s*\((Групповой курс|Group Course)\)\s*$/i, '')
      .trim();
    return translateInstructorName(cleanName, language);
  }
  return getDifficultyLabel(booking.difficulty, language, 'short');
};

export const getRecentLessonInstructorLabel = (booking: Booking, language: 'en' | 'ru') => {
  if (booking.instructorId.startsWith('course_')) {
    return language === 'ru' ? 'Групповой курс' : 'Group course';
  }
  return translateInstructorName(booking.instructorName, language);
};

export const getTodayTaskBookingContext = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
): TodayTaskBookingContext => {
  const isCourse = booking.instructorId.startsWith('course_');
  const instructorName = translateInstructorName(booking.instructorName, language);
  return {
    bookingId: booking.id,
    title: isCourse
      ? getRecentLessonTitle(booking, courses, language)
      : `${getDifficultyLabel(booking.difficulty, language, 'short')} — ${instructorName}`,
    dateLabel: formatRecentLessonDateLabel(booking, courses, language),
    isCourse,
  };
};

export const getNextSession = (bookings: Booking[], courses: Course[]) => {
  const now = new Date();
  const todayStr = toYMD(now);

  const upcoming = bookings
    .filter(isActiveBooking)
    .map((b) => ({
      booking: b,
      date: resolveBookingStartDate(b, courses),
    }))
    .filter(({ date, booking }) => {
      if (date > todayStr) return true;
      if (date < todayStr) return false;
      const startTime = parseBookingStartTime(booking.time);
      if (!startTime) return true;
      const sessionStart = new Date();
      sessionStart.setHours(startTime.h, startTime.m, 0, 0);
      return sessionStart >= now;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.booking.time.localeCompare(b.booking.time);
    });

  return upcoming[0]?.booking ?? null;
};

export const getLevelProgressPercent = (userProfile: UserProfile, skillConfig?: SkillConfig) => {
  const level = userProfile.level || 1;
  const progress = calculateSkillProgress(
    userProfile.skillScores || {},
    skillConfig?.items || DEFAULT_SKILL_CONFIG.items,
    level,
    skillConfig?.passPercentage ?? 80
  );
  if (progress.targetMaxPoints <= 0) return { percent: 0, remaining: 0, progress };
  const percent = Math.min(
    100,
    Math.round((progress.targetEarnedPoints / progress.targetRequiredPoints) * 100)
  );
  return { percent, remaining: progress.remainingPointsNeeded, progress };
};

export const getSectionProgress = (
  userProfile: UserProfile,
  skillConfig?: SkillConfig,
  language: Language = 'ru'
): SectionProgress[] => {
  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const level = userProfile.level || 1;
  const targetLevel = level >= 4 ? 3 : Math.min(3, Math.max(1, level));
  const relevant = items.filter((i) => i.levelTarget <= targetLevel);
  const scores = userProfile.skillScores || {};

  const bySection = new Map<string, { earned: number; max: number }>();
  relevant.forEach((item) => {
    const secName = getSkillItemSection(item, language);
    const cur = bySection.get(secName) || { earned: 0, max: 0 };
    cur.earned += scores[item.id] || 0;
    cur.max += item.maxPoints;
    bySection.set(secName, cur);
  });

  return Array.from(bySection.entries())
    .map(([label, { earned, max }]) => ({
      id: label,
      label,
      percent: max > 0 ? Math.min(100, Math.round((earned / max) * 100)) : 0,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 6);
};

export type SkillRingFilter = 'all' | 'technique' | 'control' | 'speed';

export const getSkillItemRingCategory = (item: SkillItem): Exclude<SkillRingFilter, 'all'> => {
  if (item.techniquePoints >= item.controlPoints && item.techniquePoints >= item.speedPoints) {
    return 'technique';
  }
  if (item.controlPoints >= item.speedPoints) return 'control';
  return 'speed';
};

export const matchesSkillRingFilter = (item: SkillItem, filter: SkillRingFilter) =>
  filter === 'all' || getSkillItemRingCategory(item) === filter;

export interface PrioritySkillItem {
  id: string;
  title: string;
  earned: number;
  maxPoints: number;
  percent: number;
  pinned: boolean;
}

export const getPrioritySkillItems = (
  userProfile: UserProfile,
  skillConfig?: SkillConfig,
  limit = 3,
  language: Language = 'ru'
): PrioritySkillItem[] => {
  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const currentLevel = userProfile.level || 1;
  const targetStage = Math.min(currentLevel, 3);
  const scores = userProfile.skillScores || {};
  const pinnedIds = new Set(userProfile.todaySkillItemIds ?? []);

  return items
    .filter((item) => item.levelTarget <= targetStage)
    .map((item) => {
      const earned = scores[item.id] ?? 0;
      const percent =
        item.maxPoints > 0 ? Math.min(100, Math.round((earned / item.maxPoints) * 100)) : 100;
      return {
        id: item.id,
        title: getSkillItemTitle(item, language),
        earned,
        maxPoints: item.maxPoints,
        percent,
        pinned: pinnedIds.has(item.id),
      };
    })
    .filter((item) => item.earned < item.maxPoints)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.percent - b.percent;
    })
    .slice(0, limit);
};

export type NextStepAction =
  | {
      kind: 'exercise';
      exerciseId: string;
      exerciseTitle: string;
      pointsGain: number;
      levelProgressDelta: number;
      targetLevel: number;
      pinned: boolean;
    }
  | {
      kind: 'recommendation';
      label: string;
      bookingId: string;
    }
  | { kind: 'complete' };

export const getNextStepAction = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillConfig?: SkillConfig,
  language: Language = 'ru'
): NextStepAction | null => {
  if (userProfile.hideProgressTracking) return null;

  const pendingRec = getRecommendationTasks(bookings).find((task) => !task.done);
  if (pendingRec) {
    return {
      kind: 'recommendation',
      label: pendingRec.label,
      bookingId: pendingRec.bookingId,
    };
  }

  const nextExercise = getPrioritySkillItems(userProfile, skillConfig, 1, language)[0];
  if (!nextExercise) {
    return { kind: 'complete' };
  }

  const level = userProfile.level || 1;
  const targetLevel = Math.min(4, level + 1);
  const pointsGain = Math.max(0, nextExercise.maxPoints - nextExercise.earned);
  const { percent: currentPercent } = getLevelProgressPercent(userProfile, skillConfig);
  const simulatedScores = {
    ...(userProfile.skillScores || {}),
    [nextExercise.id]: nextExercise.maxPoints,
  };
  const { percent: afterPercent } = getLevelProgressPercent(
    { ...userProfile, skillScores: simulatedScores },
    skillConfig
  );

  return {
    kind: 'exercise',
    exerciseId: nextExercise.id,
    exerciseTitle: nextExercise.title,
    pointsGain,
    levelProgressDelta: Math.max(0, afterPercent - currentPercent),
    targetLevel,
    pinned: nextExercise.pinned,
  };
};

export const getTodayTasks = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  skillConfig: SkillConfig | undefined
): TodayTask[] => {
  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const completed = new Set(resolveCompletedTodayTaskIds(userProfile));
  const dismissed = new Set(userProfile.dismissedTodayTaskIds ?? []);

  const recTasks: TodayTask[] = getRecommendationTasks(bookings)
    .filter((task) => !task.done)
    .filter((task) => !dismissed.has(task.id))
    .filter((task) => {
      const booking = bookings.find((b) => b.id === task.bookingId);
      return booking ? isBookingInTodayRecommendationWindow(booking, courses) : false;
    })
    .map((task) => {
      const booking = bookings.find((b) => b.id === task.bookingId);
      return {
        id: task.id,
        label: task.label,
        done: task.done,
        kind: 'recommendation' as const,
        bookingId: task.bookingId,
        recommendationId: task.recommendationId,
        bookingContext: booking
          ? getTodayTaskBookingContext(booking, courses, language)
          : undefined,
      };
    });

  const skillTasks: TodayTask[] = (userProfile.todaySkillItemIds ?? []).map((skillId) => {
    const item = items.find((i) => i.id === skillId);
    const taskId = skillTodayTaskId(skillId);
    return {
      id: taskId,
      label: item ? getSkillItemTitle(item, language) : skillId,
      done: completed.has(taskId),
      kind: 'skill' as const,
      skillItemId: skillId,
    };
  });

  const customTasks: TodayTask[] = (userProfile.customTodayTasks ?? []).map((task) => {
    const taskId = customTodayTaskId(task.id);
    return {
      id: taskId,
      label: task.text,
      done: completed.has(taskId),
      kind: 'custom' as const,
      customTaskId: task.id,
    };
  });

  return [...recTasks, ...skillTasks, ...customTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return 0;
  });
};

export { getTrainingStreakWeeks } from '../../../lib/trainingStreak';

export const getAchievements = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillConfig: SkillConfig | undefined,
  language: 'en' | 'ru',
  activityLogs: ActivityLog[] = [],
  reviews: Review[] = [],
  courses: Course[] = [],
  achievementsConfig?: AchievementsConfig
): Achievement[] => {
  const config = normalizeAchievementsConfig(achievementsConfig);
  const earned = evaluateEarnedAchievements(
    {
      userProfile,
      bookings,
      courses,
      reviews,
      skillConfig,
      activityLogs,
    },
    config
  );

  const logTimestamps = new Map<string, string>(
    activityLogs
      .filter((log) => log.type === 'achievement_earned' && log.metadata?.achievementId)
      .map((log) => [log.metadata!.achievementId as string, log.timestamp])
  );

  const logLabels = new Map<string, { ru?: string; en?: string }>(
    activityLogs
      .filter((log) => log.type === 'achievement_earned' && log.metadata?.achievementId)
      .map((log) => [
        log.metadata!.achievementId as string,
        {
          ru: log.metadata?.achievementLabelRu,
          en: log.metadata?.achievementLabelEn,
        },
      ])
  );

  return earned
    .map((item) => {
      const timestamp = logTimestamps.get(item.id) ?? item.earnedAt;
      const storedLabels = logLabels.get(item.id);
      return {
        id: item.id,
        icon: item.icon,
        label: formatAchievementLabel(item.id, language, config, {
          achievementLabelRu: storedLabels?.ru ?? item.labelRu,
          achievementLabelEn: storedLabels?.en ?? item.labelEn,
        }),
        earnedAtLabel: timestamp ? formatActivityTimestamp(timestamp, language) : undefined,
        earnedAt: timestamp,
      };
    })
    .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''));
};

const USER_LEVEL_TO_COURSE_LEVEL: Record<number, NonNullable<Course['level']>> = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
  4: 'expert',
};

export const getRecommendedCourses = (
  userProfile: UserProfile,
  courses: Course[],
  bookings: Booking[],
  limit = 2
): Course[] => {
  const targetLevel = USER_LEVEL_TO_COURSE_LEVEL[userProfile.level || 1] ?? 'beginner';
  const enrolledIds = new Set(
    getEnrolledCourses(bookings, courses, userProfile.uid).map((c) => c.id)
  );

  return courses
    .filter((c) => !c.isHidden && !enrolledIds.has(c.id) && c.availableSeats > 0)
    .sort((a, b) => {
      const aMatch = a.level === targetLevel ? 0 : 1;
      const bMatch = b.level === targetLevel ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (a.order ?? 999) - (b.order ?? 999);
    })
    .slice(0, limit);
};

export const getRecommendedInstructors = (
  userProfile: UserProfile,
  instructors: Instructor[],
  bookings: Booking[],
  limit = 2
): Instructor[] => {
  const myIds = new Set(getMyInstructors(bookings, instructors, userProfile.uid).map((i) => i.id));

  return instructors
    .filter((i) => i.isAvailable && !myIds.has(i.id))
    .sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount)
    .slice(0, limit);
};

export type NextLessonBookingTarget =
  | { kind: 'instructor'; instructor: Instructor }
  | { kind: 'course'; course: Course }
  | { kind: 'pick'; tab: 'coach' | 'courses' };

/** Best target when the student taps «Book next lesson». */
export const resolveNextLessonBookingTarget = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  instructors: Instructor[]
): NextLessonBookingTarget => {
  const myInstructors = getMyInstructors(bookings, instructors, userProfile.uid);
  const recentAvailable = myInstructors.find((i) => i.isAvailable);
  if (recentAvailable) return { kind: 'instructor', instructor: recentAvailable };

  const recommendedInstructor = getRecommendedInstructors(
    userProfile,
    instructors,
    bookings,
    1
  )[0];
  if (recommendedInstructor) return { kind: 'instructor', instructor: recommendedInstructor };

  const fallbackInstructor = instructors.find((i) => i.isAvailable);
  if (fallbackInstructor) return { kind: 'instructor', instructor: fallbackInstructor };

  const recommendedCourse = getRecommendedCourses(userProfile, courses, bookings, 1)[0];
  if (recommendedCourse) return { kind: 'course', course: recommendedCourse };

  return { kind: 'pick', tab: myInstructors.length > 0 ? 'coach' : 'courses' };
};

export type InstructorPickerGroup = {
  id: string;
  labelKey: TranslationKey;
  subtitleKey?: TranslationKey;
  instructors: Instructor[];
  bookLabelKey?: TranslationKey;
};

export const getInstructorPickerGroups = (
  userProfile: UserProfile,
  bookings: Booking[],
  instructors: Instructor[]
): InstructorPickerGroup[] => {
  const myInstructors = getMyInstructors(bookings, instructors, userProfile.uid);
  const recommended = getRecommendedInstructors(userProfile, instructors, bookings, 5);
  const shownIds = new Set([
    ...myInstructors.map((i) => i.id),
    ...recommended.map((i) => i.id),
  ]);
  const others = instructors.filter((i) => i.isAvailable && !shownIds.has(i.id));

  const groups: InstructorPickerGroup[] = [];
  if (myInstructors.length > 0) {
    groups.push({
      id: 'my',
      labelKey: 'scMyInstructors',
      subtitleKey: 'scMyInstructorsSub',
      instructors: myInstructors,
      bookLabelKey: 'scBookAgain',
    });
  }
  if (recommended.length > 0) {
    groups.push({
      id: 'recommended',
      labelKey: 'scRecommendedInstructors',
      subtitleKey: 'scRecommendedInstructorsSub',
      instructors: recommended,
    });
  }
  if (others.length > 0) {
    groups.push({
      id: 'others',
      labelKey: 'scAvailableInstructors',
      instructors: others,
    });
  }
  return groups;
};

export type BookingListScope = 'upcoming' | 'current' | 'past' | 'all';

export const filterBookingsByScope = (
  bookings: Booking[],
  scope: BookingListScope,
  courses: Course[] = [],
  now = new Date()
): Booking[] => {
  if (scope === 'all') return bookings;
  if (scope === 'upcoming') {
    return bookings.filter((b) => isBookingUpcomingBySchedule(b, courses, now));
  }
  if (scope === 'current') {
    return bookings.filter((b) => isBookingCurrentBySchedule(b, courses, now));
  }
  return bookings.filter((b) => isBookingPastBySchedule(b, courses, now));
};

export const getStudentStats = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillItems: SkillItem[] = DEFAULT_SKILL_CONFIG.items
): StudentStats => {
  const completed = bookings.filter((b) => b.status === 'completed' && !b.isDeleted);
  const hours = completed.reduce((acc, b) => acc + b.durationHours, 0);
  const scores = userProfile.skillScores || {};
  const points = Object.values(scores).reduce((a, b) => a + b, 0);
  const exercisesMastered = skillItems.filter(
    (item) => item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints
  ).length;
  return {
    lessons: completed.length,
    hours: Math.round(hours),
    exercisesMastered,
    points,
  };
};

/** Completed lessons in the current calendar year. */
export const getSeasonBookings = (
  bookings: Booking[],
  userId?: string,
  fromDate = new Date()
): Booking[] => {
  const yearPrefix = String(fromDate.getFullYear());
  return bookings.filter(
    (b) =>
      (!userId || b.userId === userId) &&
      !b.isDeleted &&
      b.status === 'completed' &&
      b.date.startsWith(yearPrefix)
  );
};

/** True if the student has a non-cancelled booking on today's date (private or course day). */
export const hasTrainingToday = (
  bookings: Booking[],
  courses: Course[],
  userId?: string,
  fromDate = new Date()
): boolean => {
  const todayStr = toYMD(fromDate);
  return bookings.some(
    (b) =>
      (!userId || b.userId === userId) &&
      !b.isDeleted &&
      b.status !== 'cancelled' &&
      isBookingOnDate(b, todayStr, courses)
  );
};

const historyEventPrefix = (kind: HistoryEvent['kind']) => {
  switch (kind) {
    case 'training':
      return '✓ ';
    case 'level':
      return '★ ';
    case 'homework':
      return '◆ ';
    case 'review':
      return '★ ';
    case 'points':
      return '+ ';
    default:
      return '';
  }
};

export const getHistoryEventPrefix = historyEventPrefix;

const formatActivityTimestamp = (timestamp: string, language: 'en' | 'ru') => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

const mapActivityLogToHistoryEvent = (
  log: ActivityLog,
  language: 'en' | 'ru',
  t: (key: TranslationKey) => string
): HistoryEvent => {
  const meta = log.metadata ?? {};
  const dateLabel = formatActivityTimestamp(log.timestamp, language);

  switch (log.type) {
    case 'booking_completed': {
      const isCourse = meta.instructorId?.startsWith('course_');
      const title = isCourse
        ? t('scHistoryCourseCompleted').replace(
            '{name}',
            meta.lessonTitle ?? meta.instructorName ?? ''
          )
        : t('scHistoryLessonWith').replace('{name}', meta.instructorName ?? meta.lessonTitle ?? '');
      const subtitleParts: string[] = [];
      if (meta.durationHours) {
        subtitleParts.push(`${meta.durationHours} ${t('hoursShort')}`);
      }
      if (meta.difficulty) {
        subtitleParts.push(getDifficultyShort(meta.difficulty));
      }
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined,
        kind: 'training',
        bookingId: meta.bookingId,
      };
    }
    case 'level_up':
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryNewLevel'),
        subtitle: t('scHistoryLevelReached').replace('{n}', String(meta.newLevel ?? '')),
        kind: 'level',
      };
    case 'skill_scores_updated':
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistorySkillUpdated'),
        subtitle:
          meta.pointsDelta && meta.pointsDelta > 0
            ? t('scHistoryPointsReceived').replace('{n}', String(meta.pointsDelta))
            : undefined,
        kind: 'points',
      };
    case 'review_created':
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryReviewLeft'),
        subtitle: meta.rating
          ? t('scHistoryReviewRating').replace('{n}', String(meta.rating))
          : undefined,
        kind: 'review',
        bookingId: meta.bookingId,
      };
    case 'recommendation_completed':
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryRecommendationDone'),
        subtitle: meta.recommendationText,
        kind: 'homework',
        bookingId: meta.bookingId,
      };
    case 'recommendations_completed_all':
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryAllRecommendationsDone'),
        subtitle: meta.lessonTitle ?? meta.instructorName,
        kind: 'homework',
        bookingId: meta.bookingId,
      };
    case 'achievement_earned': {
      const achievementId = meta.achievementId;
      const label = achievementId
        ? formatAchievementLabel(achievementId, language, undefined, meta)
        : t('scHistoryAchievementEarnedGeneric');
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryAchievementEarned').replace('{name}', label),
        kind: 'level',
      };
    }
    default:
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryTrainingDone'),
        kind: 'training',
      };
  }
};

const getLegacyHistoryEvents = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  t: (key: TranslationKey) => string
): HistoryEvent[] => {
  const events: HistoryEvent[] = [];
  const completed = bookings
    .filter((b) => b.status === 'completed' && !b.isDeleted)
    .sort((a, b) =>
      resolveBookingStartDate(b, courses).localeCompare(resolveBookingStartDate(a, courses))
    );

  completed.slice(0, 5).forEach((b) => {
    const dateStr = resolveBookingStartDate(b, courses);
    events.push({
      id: `train-${b.id}`,
      date: dateStr,
      dateLabel: formatBookingDayMonth(b, courses, language),
      title: t('scHistoryTrainingDone'),
      subtitle: t('scHistoryPointsReceived').replace('{n}', '8'),
      kind: 'training',
      bookingId: b.id,
    });
  });

  if ((userProfile.level || 1) > 1) {
    const levelDateBooking = completed[0];
    const levelDateStr = levelDateBooking
      ? resolveBookingStartDate(levelDateBooking, courses)
      : toYMD(new Date());
    events.push({
      id: 'level',
      date: levelDateStr,
      dateLabel: levelDateBooking ? formatBookingDayMonth(levelDateBooking, courses, language) : '',
      title: t('scHistoryNewLevel'),
      subtitle: `LEVEL ${userProfile.level}`,
      kind: 'level',
    });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
};

export const getHistoryEvents = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  t: (key: TranslationKey) => string,
  activityLogs: ActivityLog[] = []
): HistoryEvent[] => {
  const fromLogs = activityLogs.map((log) => mapActivityLogToHistoryEvent(log, language, t));

  const loggedBookingIds = new Set(
    activityLogs
      .filter((log) => log.type === 'booking_completed')
      .map((log) => log.metadata?.bookingId)
      .filter(Boolean) as string[]
  );

  const backfilledBookings = bookings
    .filter((b) => b.status === 'completed' && !b.isDeleted && !loggedBookingIds.has(b.id))
    .sort((a, b) =>
      resolveBookingStartDate(b, courses).localeCompare(resolveBookingStartDate(a, courses))
    )
    .slice(0, 10)
    .map((b) => {
      const dateStr = resolveBookingStartDate(b, courses);
      const isCourse = b.instructorId.startsWith('course_');
      return {
        id: `train-${b.id}`,
        date: dateStr,
        dateLabel: formatBookingDayMonth(b, courses, language),
        title: isCourse
          ? t('scHistoryCourseCompleted').replace(
              '{name}',
              getRecentLessonTitle(b, courses, language)
            )
          : t('scHistoryLessonWith').replace('{name}', b.instructorName),
        subtitle: `${b.durationHours} ${t('hoursShort')} · ${getDifficultyShort(b.difficulty)}`,
        kind: 'training' as const,
        bookingId: b.id,
      };
    });

  const hasLevelLog = activityLogs.some((log) => log.type === 'level_up');
  const legacyLevel =
    !hasLevelLog && (userProfile.level || 1) > 1
      ? getLegacyHistoryEvents(userProfile, bookings, courses, language, t).filter(
          (event) => event.kind === 'level'
        )
      : [];

  return [...fromLogs, ...backfilledBookings, ...legacyLevel].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
};

const isBookingReviewed = (booking: Booking, reviews: Review[], dismissedReviewIds: string[]) => {
  if (dismissedReviewIds.includes(booking.id)) return true;
  return reviews.some(
    (review) =>
      review.bookingId === booking.id ||
      (review.userId === booking.userId &&
        review.instructorId === booking.instructorId &&
        review.date === booking.date)
  );
};

export { isBookingReviewed };

const countPendingRecommendations = (booking: Booking) => {
  const completed = new Set(booking.completedRecommendationIds ?? []);
  return (booking.recommendations ?? []).filter((rec) => !completed.has(rec.id)).length;
};

export const enrichHistoryEventsWithActions = (
  events: HistoryEvent[],
  bookings: Booking[],
  reviews: Review[],
  dismissedReviewIds: string[] = [],
  t?: (key: TranslationKey) => string
): HistoryEvent[] =>
  events.map((event) => {
    if (event.kind === 'training' && event.bookingId) {
      const booking = bookings.find((item) => item.id === event.bookingId);
      if (!booking) return event;

      const pending = countPendingRecommendations(booking);
      const pendingSubtitle =
        pending > 0 && t
          ? t('scHistoryPendingRecommendations').replace('{n}', String(pending))
          : undefined;

      if (!isBookingReviewed(booking, reviews, dismissedReviewIds)) {
        return {
          ...event,
          subtitle: pendingSubtitle ?? event.subtitle,
          cta: {
            labelKey: 'writeReviewBtn',
            action: { type: 'write_review', bookingId: event.bookingId },
          },
        };
      }

      if (hasPendingRecommendations(booking)) {
        return {
          ...event,
          subtitle: pendingSubtitle ?? event.subtitle,
          cta: {
            labelKey: 'scHistoryOpenRecommendations',
            action: { type: 'open_lesson', bookingId: event.bookingId },
          },
        };
      }

      return {
        ...event,
        cta: {
          labelKey: 'scMoreDetails',
          action: { type: 'open_lesson', bookingId: event.bookingId },
        },
      };
    }

    if (event.kind === 'level') {
      return {
        ...event,
        cta: {
          labelKey: 'scHistoryViewExercises',
          action: { type: 'open_development' },
        },
      };
    }

    if (event.kind === 'homework' && event.bookingId) {
      return {
        ...event,
        cta: {
          labelKey: 'scMoreDetails',
          action: { type: 'open_lesson', bookingId: event.bookingId },
        },
      };
    }

    if (event.kind === 'review' && event.bookingId) {
      return {
        ...event,
        cta: {
          labelKey: 'scMoreDetails',
          action: { type: 'open_lesson', bookingId: event.bookingId },
        },
      };
    }

    return event;
  });

export const filterHistoryEvents = (
  events: HistoryEvent[],
  filter: HistoryFilter
): HistoryEvent[] => {
  if (filter === 'all') return events;
  if (filter === 'training') return events.filter((event) => event.kind === 'training');
  if (filter === 'progress') {
    return events.filter(
      (event) => event.kind === 'level' || event.kind === 'points' || event.kind === 'review'
    );
  }
  return events.filter((event) => event.kind === 'homework');
};

export const groupHistoryByMonth = (
  events: HistoryEvent[],
  language: 'en' | 'ru'
): HistoryMonthGroup[] => {
  const map = new Map<string, HistoryEvent[]>();

  events.forEach((event) => {
    const parsed = new Date(event.date.includes('T') ? event.date : `${event.date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    const monthKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    const bucket = map.get(monthKey) ?? [];
    bucket.push(event);
    map.set(monthKey, bucket);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthEvents]) => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(
        language === 'ru' ? 'ru-RU' : 'en-US',
        { month: 'long', year: 'numeric' }
      );
      return {
        monthKey,
        monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        events: monthEvents.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
};

export const buildStudentHistory = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  reviews: Review[],
  language: 'en' | 'ru',
  t: (key: TranslationKey) => string,
  activityLogs: ActivityLog[] = [],
  dismissedReviewIds: string[] = []
): HistoryEvent[] =>
  enrichHistoryEventsWithActions(
    getHistoryEvents(userProfile, bookings, courses, language, t, activityLogs),
    bookings,
    reviews,
    dismissedReviewIds,
    t
  );

export const getNeedsAttentionBookings = (
  bookings: Booking[],
  reviews: Review[],
  dismissedReviewIds: string[],
  userId: string,
  limit = 5
): Booking[] =>
  bookings
    .filter(
      (booking) => booking.userId === userId && booking.status === 'completed' && !booking.isDeleted
    )
    .filter(
      (booking) =>
        !isBookingReviewed(booking, reviews, dismissedReviewIds) ||
        hasPendingRecommendations(booking)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

export const getRecentLessons = (
  bookings: Booking[],
  reviews: Review[],
  courses: Course[],
  language: 'en' | 'ru',
  dismissedReviewIds: string[] = []
): RecentLesson[] => {
  return bookings
    .filter((b) => b.status === 'completed' && !b.isDeleted)
    .sort((a, b) =>
      resolveBookingStartDate(b, courses).localeCompare(resolveBookingStartDate(a, courses))
    )
    .slice(0, 4)
    .map((b) => {
      const review = reviews.find(
        (r) => r.bookingId === b.id || (r.userId === b.userId && r.date === b.date)
      );
      const needsReview = !isBookingReviewed(b, reviews, dismissedReviewIds);
      const pendingRecommendationsCount = countPendingRecommendations(b);
      return {
        id: b.id,
        title: getRecentLessonTitle(b, courses, language),
        dateLabel: formatRecentLessonDateLabel(b, courses, language),
        rating: review?.rating ?? 5,
        reviewSnippet: review?.comment,
        instructorName: getRecentLessonInstructorLabel(b, language),
        booking: b,
        needsReview,
        pendingRecommendationsCount:
          pendingRecommendationsCount > 0 ? pendingRecommendationsCount : undefined,
      };
    });
};

/** True if booking has a session on dateStr (private lesson or multi-day course). */
export const isBookingOnDate = (booking: Booking, dateStr: string, courses: Course[]) => {
  if (booking.isDeleted || booking.status === 'cancelled') return false;
  if (booking.userId?.startsWith('system_block_')) return false;

  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const startStr = toYMD(parsed.start);
    const endStr = toYMD(parsed.end);
    return dateStr >= startStr && dateStr <= endStr;
  }

  return booking.date === dateStr;
};

export type MiniCalendarDay = {
  day: number;
  dateStr: string;
  hasSession: boolean;
  isToday: boolean;
  weekdayLabel: string;
};

/** Next 7 days starting from today with booked sessions marked. */
export const getMiniCalendarDays = (
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru' = 'ru',
  fromDate = new Date()
): MiniCalendarDay[] => {
  const todayStr = toYMD(fromDate);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const booked = bookings.filter(isActiveBooking);

  const days: MiniCalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(fromDate);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const dateStr = toYMD(d);
    const hasSession = booked.some((b) => isBookingOnDate(b, dateStr, courses));
    days.push({
      day: d.getDate(),
      dateStr,
      hasSession,
      isToday: dateStr === todayStr,
      weekdayLabel: d.toLocaleDateString(locale, { weekday: 'short' }),
    });
  }
  return days;
};

/** Booked sessions within the next 7 days from today, sorted by date/time. */
export const getWeekBookedSessions = (bookings: Booking[], courses: Course[]) => {
  const days = getMiniCalendarDays(bookings, courses);
  const weekDateSet = new Set(days.map((d) => d.dateStr));
  const booked = bookings.filter(isActiveBooking);

  const rows: { booking: Booking; dateStr: string }[] = [];
  for (const b of booked) {
    for (const dateStr of weekDateSet) {
      if (isBookingOnDate(b, dateStr, courses)) {
        rows.push({ booking: b, dateStr });
      }
    }
  }

  return rows.sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    return a.booking.time.localeCompare(b.booking.time);
  });
};

export const getNextCalendarSession = (
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const next = getNextSession(bookings, courses);
  if (!next) return null;
  const d = new Date(`${resolveBookingStartDate(next, courses)}T12:00:00`);
  return {
    booking: next,
    label: d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'long',
    }),
  };
};

export const getInstructorsForStudent = (bookings: Booking[], instructors: Instructor[]) =>
  getMyInstructors(bookings, instructors);

export const getMyInstructors = (
  bookings: Booking[],
  instructors: Instructor[],
  userId?: string
): Instructor[] => {
  const lastDateByInstructor = new Map<string, string>();

  bookings
    .filter(
      (b) =>
        (!userId || b.userId === userId) &&
        !b.isDeleted &&
        b.status !== 'cancelled' &&
        !b.instructorId.startsWith('course_')
    )
    .forEach((b) => {
      const prev = lastDateByInstructor.get(b.instructorId);
      if (!prev || b.date > prev) lastDateByInstructor.set(b.instructorId, b.date);
    });

  return instructors
    .filter((i) => lastDateByInstructor.has(i.id))
    .sort((a, b) =>
      (lastDateByInstructor.get(b.id) ?? '').localeCompare(lastDateByInstructor.get(a.id) ?? '')
    );
};

export const getEnrolledCourses = (bookings: Booking[], courses: Course[], userId?: string) => {
  const enrolledIds = new Set(
    bookings
      .filter(
        (b) =>
          (!userId || b.userId === userId) &&
          !b.isDeleted &&
          b.instructorId.startsWith('course_') &&
          b.status !== 'cancelled'
      )
      .map((b) => b.instructorId.replace('course_', ''))
  );
  return courses.filter((c) => !c.isHidden && enrolledIds.has(c.id));
};

export interface ActiveCourseEnrollment {
  course: Course;
  booking: Booking;
}

/** Enrolled group course that includes today in its date range. */
export const getActiveCourseEnrollment = (
  bookings: Booking[],
  courses: Course[],
  userId?: string,
  fromDate = new Date()
): ActiveCourseEnrollment | null => {
  const todayStr = toYMD(fromDate);
  const enrolled = getEnrolledCourses(bookings, courses, userId);

  for (const course of enrolled) {
    const booking = bookings.find(
      (b) =>
        (!userId || b.userId === userId) &&
        !b.isDeleted &&
        b.instructorId === `course_${course.id}` &&
        b.status !== 'cancelled' &&
        isBookingOnDate(b, todayStr, courses)
    );
    if (booking) return { course, booking };
  }

  return null;
};

export const getAvailableCourses = (
  bookings: Booking[],
  courses: Course[],
  userId?: string
): Course[] => {
  const enrolledIds = new Set(getEnrolledCourses(bookings, courses, userId).map((c) => c.id));
  return courses.filter((c) => !c.isHidden && !enrolledIds.has(c.id));
};

export const getCourseTrackLabel = (course: Course) =>
  getTrackLabelForLevel(course.level || 'beginner');

export const aggregateSkillItemProgress = (item: SkillItem, scores: Record<string, number>) => {
  const earned = scores[item.id] || 0;
  return item.maxPoints > 0 ? Math.min(100, Math.round((earned / item.maxPoints) * 100)) : 0;
};
