import type { ActivityLog, Booking, Course, Review, UserProfile } from '../../../../types';
import { DEFAULT_SKILL_ITEMS, formatAchievementLabel } from '../../../../domain/achievements';
import type { TranslationKey } from '../../../../app/providers/LanguageContext';
import { formatDurationLabel } from '../../../../lib/i18n/duration';
import { hasPendingRecommendations } from '../../lessonRecommendations';
import {
  formatBookingDayMonth,
  getRecentLessonTitle,
  resolveBookingStartDate,
} from './studentLessonPresentation';
import { formatSessionTimeRange, getDifficultyShort } from './studentSessionPresentation';
import { toYMD } from './studentCabinetPresentation';
import type { HistoryEvent, HistoryFilter, HistoryMonthGroup } from './studentCabinetUtils';

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
  t: (key: TranslationKey) => string,
  bookings: Booking[] = []
): HistoryEvent => {
  const meta = log.metadata ?? {};
  const dateLabel = formatActivityTimestamp(log.timestamp, language);

  switch (log.type) {
    case 'booking_completed': {
      const isCourse = meta.instructorId?.startsWith('course_');
      const linkedBooking = meta.bookingId
        ? bookings.find((b) => b.id === meta.bookingId)
        : undefined;

      const title = isCourse
        ? t('scHistoryCourseCompleted').replace(
            '{name}',
            meta.lessonTitle ?? meta.instructorName ?? ''
          )
        : t('scHistoryLessonWith').replace('{name}', meta.instructorName ?? meta.lessonTitle ?? '');

      const timeVal = meta.time ?? linkedBooking?.time;
      const durationHours = meta.durationHours ?? linkedBooking?.durationHours ?? 1;

      const subtitleParts: string[] = [];
      if (timeVal) {
        const timeRange = formatSessionTimeRange({ time: timeVal, durationHours });
        subtitleParts.push(`${t('scHistoryTimeLabel')}: ${timeRange}`);
      }
      if (durationHours) {
        subtitleParts.push(
          `${t('scHistoryDurationLabel')}: ${formatDurationLabel(durationHours, language)}`
        );
      }
      if (meta.difficulty ?? linkedBooking?.difficulty) {
        subtitleParts.push(getDifficultyShort(meta.difficulty ?? linkedBooking!.difficulty));
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
    case 'level_up': {
      const skillDeltas = meta.skillDeltas?.map((d) => {
        const item = DEFAULT_SKILL_ITEMS.find((i) => i.id === d.itemId);
        return {
          itemId: d.itemId,
          title: d.title || item?.title || d.itemId,
          delta: d.delta,
          oldScore: d.oldScore,
          newScore: d.newScore,
          maxPoints: d.maxPoints ?? item?.maxPoints,
        };
      });
      return {
        id: log.id,
        date: log.timestamp,
        dateLabel,
        title: t('scHistoryNewLevel'),
        subtitle: t('scHistoryLevelReached').replace('{n}', String(meta.newLevel ?? '')),
        kind: 'level',
        skillDeltas,
      };
    }
    case 'skill_scores_updated': {
      const skillDeltas = meta.skillDeltas?.map((d) => {
        const item = DEFAULT_SKILL_ITEMS.find((i) => i.id === d.itemId);
        return {
          itemId: d.itemId,
          title: d.title || item?.title || d.itemId,
          delta: d.delta,
          oldScore: d.oldScore,
          newScore: d.newScore,
          maxPoints: d.maxPoints ?? item?.maxPoints,
        };
      });
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
        skillDeltas,
      };
    }
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
  const fromLogs = activityLogs.map((log) =>
    mapActivityLogToHistoryEvent(log, language, t, bookings)
  );

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
      const timeRange = formatSessionTimeRange(b);
      const durationText = formatDurationLabel(b.durationHours, language);
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
        subtitle: `${t('scHistoryTimeLabel')}: ${timeRange} · ${t('scHistoryDurationLabel')}: ${durationText} · ${getDifficultyShort(b.difficulty)}`,
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
