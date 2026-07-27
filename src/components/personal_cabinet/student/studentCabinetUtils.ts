import { Booking, Course, Instructor, Review, UserProfile } from '../../../types';
import {
  SkillConfig,
  SkillItem,
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
} from '../../../lib/skillData';
import {
  parseCourseDates,
  type TranslationKey,
  getDifficultyLabel,
} from '../../../lib/LanguageContext';
import { getRecommendationTasks } from '../../../lib/lessonRecommendations';
import { getCourseTrackLabel as getTrackLabelForLevel } from '../../../lib/courseLevelStyles';
import { customTodayTaskId, skillTodayTaskId } from '../../../lib/todayChecklist';

export type StudentCabinetTab =
  'home' | 'development' | 'calendar' | 'courses' | 'instructors' | 'settings';

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
}

export interface HistoryEvent {
  id: string;
  date: string;
  dateLabel: string;
  title: string;
  subtitle?: string;
  kind: 'training' | 'level' | 'homework' | 'points';
}

export interface RecentLesson {
  id: string;
  title: string;
  dateLabel: string;
  rating: number;
  reviewSnippet?: string;
  instructorName: string;
  booking: Booking;
}

export interface StudentStats {
  lessons: number;
  hours: number;
  kilometers: number;
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

export const addMinutesToTime = (time: string, hours: number) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + Math.round(hours * 60);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
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
      return language === 'ru' && course.titleRu ? course.titleRu : course.title;
    }
    return booking.instructorName.replace(/\s*\((Групповой курс|Group Course)\)\s*$/i, '').trim();
  }
  return getDifficultyLabel(booking.difficulty, language, 'short');
};

export const getRecentLessonInstructorLabel = (booking: Booking, language: 'en' | 'ru') => {
  if (booking.instructorId.startsWith('course_')) {
    return language === 'ru' ? 'Групповой курс' : 'Group course';
  }
  return booking.instructorName;
};

export const getTodayTaskBookingContext = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
): TodayTaskBookingContext => {
  const isCourse = booking.instructorId.startsWith('course_');
  return {
    bookingId: booking.id,
    title: isCourse
      ? getRecentLessonTitle(booking, courses, language)
      : `${getDifficultyLabel(booking.difficulty, language, 'short')} — ${booking.instructorName}`,
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
      const [h, m] = booking.time.split(':').map(Number);
      const sessionStart = new Date();
      sessionStart.setHours(h, m, 0, 0);
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
  skillConfig?: SkillConfig
): SectionProgress[] => {
  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const level = userProfile.level || 1;
  const targetLevel = level >= 4 ? 3 : Math.min(3, Math.max(1, level));
  const relevant = items.filter((i) => i.levelTarget <= targetLevel);
  const scores = userProfile.skillScores || {};

  const bySection = new Map<string, { earned: number; max: number }>();
  relevant.forEach((item) => {
    const cur = bySection.get(item.section) || { earned: 0, max: 0 };
    cur.earned += scores[item.id] || 0;
    cur.max += item.maxPoints;
    bySection.set(item.section, cur);
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

export const getTodayTasks = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  skillConfig: SkillConfig | undefined
): TodayTask[] => {
  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const completed = new Set(userProfile.completedTodayTaskIds ?? []);
  const dismissed = new Set(userProfile.dismissedTodayTaskIds ?? []);

  const recTasks: TodayTask[] = getRecommendationTasks(bookings)
    .filter((task) => !dismissed.has(task.id))
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
      label: item?.title ?? skillId,
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

export const getAchievements = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillConfig: SkillConfig | undefined,
  _language: 'en' | 'ru',
  t: (key: TranslationKey) => string
): Achievement[] => {
  const completed = bookings.filter((b) => b.status === 'completed' && !b.isDeleted);
  const sections = getSectionProgress(userProfile, skillConfig);
  const carving = sections.find((s) => /карв|carv|поворот|turn/i.test(s.label));
  const speed = sections.find((s) => /скор|speed|контр/i.test(s.label));

  const list: Achievement[] = [];
  if ((carving?.percent ?? 0) >= 60 || (userProfile.level || 1) >= 2) {
    list.push({ id: 'carving', icon: '🏆', label: t('scAchCarvingArcs') });
  }
  if ((speed?.percent ?? 0) >= 80) {
    list.push({ id: 'speed', icon: '🏆', label: t('scAchSpeedControl') });
  }
  if (completed.length >= 10) {
    list.push({ id: 'ten', icon: '🏆', label: t('scAchTenLessons') });
  }
  if (list.length === 0) {
    list.push({ id: 'start', icon: '🏆', label: t('scAchFirstSteps') });
  }
  return list.slice(0, 4);
};

export const getStudentStats = (userProfile: UserProfile, bookings: Booking[]): StudentStats => {
  const completed = bookings.filter((b) => b.status === 'completed' && !b.isDeleted);
  const hours = completed.reduce((acc, b) => acc + b.durationHours, 0);
  const points = Object.values(userProfile.skillScores || {}).reduce((a, b) => a + b, 0);
  return {
    lessons: completed.length,
    hours: Math.round(hours),
    kilometers: Math.round(hours * 8),
    points,
  };
};

export const getHistoryEvents = (
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

export const getRecentLessons = (
  bookings: Booking[],
  reviews: Review[],
  courses: Course[],
  language: 'en' | 'ru'
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
      return {
        id: b.id,
        title: getRecentLessonTitle(b, courses, language),
        dateLabel: formatRecentLessonDateLabel(b, courses, language),
        rating: review?.rating ?? 5,
        reviewSnippet: review?.comment,
        instructorName: getRecentLessonInstructorLabel(b, language),
        booking: b,
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

const startOfWeekMonday = (from: Date) => {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

export type MiniCalendarDay = {
  day: number;
  dateStr: string;
  hasSession: boolean;
  isToday: boolean;
  weekdayLabel: string;
};

/** Current calendar week (Mon–Sun) with booked sessions marked. */
export const getMiniCalendarDays = (
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru' = 'ru'
): MiniCalendarDay[] => {
  const todayStr = toYMD(new Date());
  const weekStart = startOfWeekMonday(new Date());
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const booked = bookings.filter(isActiveBooking);

  const days: MiniCalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
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

/** Booked sessions that fall on the current Mon–Sun week, sorted by date/time. */
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

export const getInstructorsForStudent = (bookings: Booking[], instructors: Instructor[]) => {
  const ids = new Set(
    bookings
      .filter((b) => !b.isDeleted && b.status !== 'cancelled')
      .map((b) => b.instructorId)
      .filter((id) => !id.startsWith('course_'))
  );
  const matched = instructors.filter((i) => ids.has(i.id));
  return matched.length > 0 ? matched : instructors.slice(0, 4);
};

export const getEnrolledCourses = (bookings: Booking[], courses: Course[]) => {
  const enrolledIds = new Set(
    bookings
      .filter((b) => b.instructorId.startsWith('course_') && b.status !== 'cancelled')
      .map((b) => b.instructorId.replace('course_', ''))
  );
  return courses.filter((c) => !c.isHidden && enrolledIds.has(c.id));
};

export const getCourseTrackLabel = (course: Course) =>
  getTrackLabelForLevel(course.level || 'beginner');

export const aggregateSkillItemProgress = (item: SkillItem, scores: Record<string, number>) => {
  const earned = scores[item.id] || 0;
  return item.maxPoints > 0 ? Math.min(100, Math.round((earned / item.maxPoints) * 100)) : 0;
};
