import React from 'react';
import { Booking } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';

interface LessonRecommendationsListProps {
  booking: Booking;
  onToggle?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  compact?: boolean;
}

export const LessonRecommendationsList: React.FC<LessonRecommendationsListProps> = ({
  booking,
  onToggle,
  compact = false,
}) => {
  const { t } = useLanguage();
  const items = booking.recommendations ?? [];
  if (items.length === 0) return null;

  const completed = new Set(booking.completedRecommendationIds ?? []);

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {!compact && (
        <p className="text-xs text-[var(--ink-dim)] uppercase tracking-wider">
          {t('scRecommendations')}
        </p>
      )}
      <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
        {items.map((rec) => {
          const done = completed.has(rec.id);
          const canToggle = Boolean(onToggle);

          return (
            <li key={rec.id} className="flex items-start gap-2 text-sm text-[var(--ink)]">
              {canToggle ? (
                <button
                  type="button"
                  onClick={() => onToggle!(booking.id, rec.id, !done)}
                  className="text-[var(--ink-dim)] w-4 shrink-0 hover:text-[var(--accent)] transition leading-5"
                  aria-label={done ? t('scMarkRecommendationOpen') : t('scMarkRecommendationDone')}
                >
                  {done ? '✓' : '○'}
                </button>
              ) : (
                <span className="text-[var(--ink-dim)] w-4 shrink-0">{done ? '✓' : '○'}</span>
              )}
              <span className={done ? 'text-[var(--ink-dim)] line-through' : ''}>{rec.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
