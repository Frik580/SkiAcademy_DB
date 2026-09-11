import React from 'react';
import { useStudentCabinetTranslations } from './student/useStudentCabinetTranslations';

export interface ParticipantLessonFeedbackListItem {
  readonly itemId: string;
  readonly text: string;
  readonly completed: boolean;
}

interface ParticipantLessonFeedbackListProps {
  items: readonly ParticipantLessonFeedbackListItem[];
  pendingItemIds?: ReadonlySet<string>;
  onToggle?: (itemId: string, completed: boolean) => void;
  compact?: boolean;
}

export const ParticipantLessonFeedbackList: React.FC<ParticipantLessonFeedbackListProps> = ({
  items,
  pendingItemIds,
  onToggle,
  compact = false,
}) => {
  const { t } = useStudentCabinetTranslations();
  if (items.length === 0) return null;

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {!compact && (
        <p className="text-xs text-[var(--ink-dim)] uppercase tracking-wider">
          {t('scRecommendations')}
        </p>
      )}
      <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
        {items.map((item) => {
          const pending = pendingItemIds?.has(item.itemId) ?? false;
          const canToggle = Boolean(onToggle) && !pending;

          return (
            <li key={item.itemId} className="flex items-start gap-2 text-sm text-[var(--ink)]">
              {onToggle ? (
                <button
                  type="button"
                  disabled={!canToggle}
                  onClick={() => {
                    if (!canToggle) return;
                    onToggle(item.itemId, !item.completed);
                  }}
                  className="text-[var(--ink-dim)] w-4 shrink-0 hover:text-[var(--accent)] transition leading-5 disabled:opacity-50 disabled:pointer-events-none"
                  aria-label={
                    item.completed ? t('scMarkRecommendationOpen') : t('scMarkRecommendationDone')
                  }
                >
                  {item.completed ? '✓' : '○'}
                </button>
              ) : (
                <span className="text-[var(--ink-dim)] w-4 shrink-0">
                  {item.completed ? '✓' : '○'}
                </span>
              )}
              <span className={item.completed ? 'text-[var(--ink-dim)] line-through' : ''}>
                {item.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
