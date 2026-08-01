import React, { useMemo } from 'react';
import { Booking, Course, Review } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import {
  filterHistoryEvents,
  getHistoryEventPrefix,
  groupHistoryByMonth,
  HistoryEvent,
  HistoryEventAction,
  HistoryFilter,
} from './studentCabinetUtils';
import { ScTextButton } from './StudentCabinetUI';
import { HistoryLessonCard } from './HistoryLessonCard';

const HISTORY_FILTERS: HistoryFilter[] = ['all', 'training', 'progress', 'homework'];

const FILTER_LABEL_KEYS = {
  all: 'scHistoryFilterAll',
  training: 'scHistoryFilterTraining',
  progress: 'scHistoryFilterProgress',
  homework: 'scHistoryFilterHomework',
} as const;

interface StudentHistoryListProps {
  events: HistoryEvent[];
  bookings: Booking[];
  courses?: Course[];
  reviews?: Review[];
  dismissedReviewIds?: string[];
  filter: HistoryFilter;
  onFilterChange?: (filter: HistoryFilter) => void;
  showFilters?: boolean;
  groupByMonth?: boolean;
  limit?: number;
  showDateLabels?: boolean;
  expandedTrainingCards?: boolean;
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onOpenDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
}

export const StudentHistoryList: React.FC<StudentHistoryListProps> = ({
  events,
  bookings,
  courses = [],
  reviews = [],
  dismissedReviewIds = [],
  filter,
  onFilterChange,
  showFilters = false,
  groupByMonth = false,
  limit,
  showDateLabels = true,
  expandedTrainingCards = false,
  onOpenLesson,
  onWriteReview,
  onOpenDevelopment,
  onToggleRecommendation,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const filteredEvents = useMemo(
    () => filterHistoryEvents(events, filter).slice(0, limit ?? events.length),
    [events, filter, limit]
  );

  const groups = useMemo(() => {
    if (!groupByMonth) return null;
    return groupHistoryByMonth(filteredEvents, lang);
  }, [filteredEvents, groupByMonth, lang]);

  const handleAction = (action: HistoryEventAction) => {
    if (action.type === 'open_development') {
      onOpenDevelopment();
      return;
    }
    const booking = bookings.find((item) => item.id === action.bookingId);
    if (!booking) return;
    if (action.type === 'write_review') {
      onWriteReview(booking);
      return;
    }
    onOpenLesson(booking);
  };

  const renderEvent = (event: HistoryEvent, showDivider: boolean) => {
    const linkedBooking = event.bookingId
      ? bookings.find((booking) => booking.id === event.bookingId)
      : undefined;

    if (expandedTrainingCards && event.kind === 'training' && linkedBooking) {
      return (
        <div key={event.id}>
          {showDateLabels && (
            <p className="text-xs text-[var(--ink-dim)] pt-2">{event.dateLabel}</p>
          )}
          <HistoryLessonCard
            booking={linkedBooking}
            courses={courses}
            reviews={reviews}
            dismissedReviewIds={dismissedReviewIds}
            onOpenLesson={onOpenLesson}
            onWriteReview={onWriteReview}
            onToggleRecommendation={onToggleRecommendation}
          />
          {showDivider && <div className="h-px bg-[var(--border-subtle)]" />}
        </div>
      );
    }

    const prefix = getHistoryEventPrefix(event.kind);

    return (
      <div key={event.id}>
        <div className="py-4 space-y-2">
          {showDateLabels && <p className="text-xs text-[var(--ink-dim)]">{event.dateLabel}</p>}
          {linkedBooking && !event.cta ? (
            <button
              type="button"
              onClick={() => onOpenLesson(linkedBooking)}
              className="text-left text-sm text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
            >
              {prefix}
              {event.title}
            </button>
          ) : (
            <p className="text-sm text-[var(--ink)]">
              {prefix}
              {event.title}
            </p>
          )}
          {event.subtitle && <p className="text-sm text-[var(--ink-dim)]">{event.subtitle}</p>}
          {event.cta && (
            <ScTextButton arrow onClick={() => handleAction(event.cta!.action)}>
              {t(event.cta.labelKey)}
            </ScTextButton>
          )}
        </div>
        {showDivider && <div className="h-px bg-[var(--border-subtle)]" />}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {showFilters && onFilterChange && (
        <div className="flex flex-wrap gap-2">
          {HISTORY_FILTERS.map((item) => {
            const active = filter === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onFilterChange(item)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
              >
                {t(FILTER_LABEL_KEYS[item])}
              </button>
            );
          })}
        </div>
      )}

      {filteredEvents.length === 0 ? (
        <p className="text-sm text-[var(--ink-dim)] py-2">{t('scHistoryEmpty')}</p>
      ) : groupByMonth && groups ? (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.monthKey} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-dim)] pb-2">
                {group.monthLabel}
              </h3>
              {group.events.map((event, idx) => renderEvent(event, idx < group.events.length - 1))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-0">
          {filteredEvents.map((event, idx) => renderEvent(event, idx < filteredEvents.length - 1))}
        </div>
      )}
    </div>
  );
};
