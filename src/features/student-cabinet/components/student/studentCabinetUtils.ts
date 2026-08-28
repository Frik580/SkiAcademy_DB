import type { Booking } from '../../../../types';
import type { TranslationKey } from '../../../../app/providers/LanguageContext';
import type { TodayTaskBookingContext } from './studentTodayTaskContext';

export {
  isProfileTab,
  PROFILE_TABS,
  resolveStudentBottomNavTab,
  type StudentCabinetTab,
} from './studentCabinetNavigation';
export { filterBookingsByScope, type BookingListScope } from './studentBookingOverview';
export {
  getTodayTaskBookingContext,
  type TodayTaskBookingContext,
} from './studentTodayTaskContext';
export {
  getFirstName,
  getGreeting,
  getLevelLabel,
  getLevelName,
  isTimestampOnLocalDate,
  parseActivityTimestamp,
  toYMD,
} from './studentCabinetPresentation';
export {
  isBookingCurrentBySchedule,
  isBookingInProgressNow,
  isBookingOnDate,
  isBookingPastBySchedule,
  isBookingUpcomingBySchedule,
  parseBookingEndTime,
  parseBookingStartTime,
  resolveBookingEndDateTime,
  resolveBookingStartDateTime,
} from './studentBookingSchedule';
export {
  getCurrentSessions,
  getNextSession,
  getNextSessionsNext7Days,
  getTodaySessionCountdown,
  isSessionInProgressNow,
  type NextSessionItem,
  type TodaySessionCountdown,
} from './studentSessionSchedule';
export {
  addMinutesToTime,
  formatCountdownRemaining,
  formatSessionDayLabel,
  formatSessionTimeRange,
  getDifficultyShort,
} from './studentSessionPresentation';
export { formatDurationLabel } from '../../../../lib/i18n/duration';
export {
  RECOMMENDATION_TODAY_WINDOW_DAYS,
  formatBookingDayMonth,
  formatCourseDateRangeLabel,
  formatRecentLessonDateLabel,
  getLessonAgeDays,
  getRecentLessonInstructorLabel,
  getRecentLessonTitle,
  isBookingInTodayRecommendationWindow,
  resolveBookingStartDate,
} from './studentLessonPresentation';

export interface SectionProgress {
  id: string;
  label: string;
  percent: number;
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
export interface SkillDeltaItem {
  itemId: string;
  title: string;
  delta: number;
  oldScore?: number;
  newScore?: number;
  maxPoints?: number;
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
  skillDeltas?: SkillDeltaItem[];
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

export * from './studentSkillProgress';
export * from './studentAchievements';
export * from './studentRecommendations';
export * from './studentBookingOverview';
export * from './studentHistory';
