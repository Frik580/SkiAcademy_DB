import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ActionButton } from '../../../ui/ActionButton';
import { useAuthStore } from '../../auth/authStore';
import { useParticipantProgressStore } from '../../participant-progress';
import type { InstructorRecommendationHistoryInput } from '../instructorLessonContextContracts';
import { presentRecommendationHistory } from '../instructorRecommendationHistoryPresentation';
import { useInstructorLessonContextTranslations } from '../useInstructorLessonContextTranslations';
import { useInstructorRecommendationHistory } from '../useInstructorRecommendationHistory';

export function InstructorRecommendationHistorySection(
  props: InstructorRecommendationHistoryInput
) {
  const auth = useAuthStore((state) => state.authGeneration);
  const sync = useParticipantProgressStore((state) => state.syncGeneration);
  return (
    <HistorySection
      key={JSON.stringify([props.participantId, props.bookingId, props.bookingStatus, auth, sync])}
      {...props}
    />
  );
}

function HistorySection({
  participantId,
  bookingId,
  authors,
}: InstructorRecommendationHistoryInput) {
  const { t, language } = useInstructorLessonContextTranslations();
  const [expanded, setExpanded] = useState(false);
  const [actionUsed, setActionUsed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const actionHadFocus = useRef(false);
  const id = useId();
  const history = useInstructorRecommendationHistory(participantId, bookingId);
  const items = expanded ? presentRecommendationHistory(history.items, language, authors) : [];
  const loading = history.status === 'loading';
  const showAction = history.status === 'error' || !!history.nextCursor || (loading && actionUsed);

  useLayoutEffect(() => {
    if (showAction) return;
    if (expanded && actionHadFocus.current && document.activeElement === document.body) {
      heading.current?.querySelector('button')?.focus();
    }
    actionHadFocus.current = false;
  }, [expanded, showAction]);

  function toggle() {
    setExpanded(!expanded);
    if (!expanded && history.status === 'idle') void history.load();
  }

  return (
    <section aria-label={t('recommendationHistory')} className="space-y-3 min-w-0">
      <h3 ref={heading}>
        <ActionButton type="button" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
          {t('recommendationHistory')}
        </ActionButton>
      </h3>
      <div id={id} hidden={!expanded}>
        {expanded && (
          <div className="space-y-3 min-w-0 [overflow-wrap:anywhere]">
            <div className="space-y-3" aria-busy={loading}>
              {items.map((lesson) => (
                <article
                  key={lesson.id}
                  className="space-y-2 rounded-lg border border-[var(--border)] p-3"
                >
                  <h4 className="type-caption font-medium">
                    {lesson.dateLabel && (
                      <>
                        <time dateTime={lesson.dateTime}>{lesson.dateLabel}</time> ·{' '}
                      </>
                    )}
                    {lesson.authorName
                      ? `${t('instructorColumn')} · ${lesson.authorName}`
                      : t('recommendationHistoryInstructorNameUnavailable')}
                  </h4>
                  <ul className="space-y-2">
                    {lesson.items.map((item) => (
                      <li key={item.itemId}>
                        <p className="type-body whitespace-pre-wrap">{item.text}</p>
                        <p className="type-caption text-[var(--ink-dim)]">
                          {t(
                            item.completed
                              ? 'recommendationMarkedComplete'
                              : 'recommendationNotMarkedComplete'
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            {loading && <p role="status">{t('recommendationHistoryLoading')}</p>}
            {history.status === 'ready' && !items.length && !history.nextCursor && (
              <p role="status">{t('recommendationHistoryEmpty')}</p>
            )}
            {history.status === 'denied' && <p role="alert">{t('lessonContextDenied')}</p>}
            {history.status === 'signedOut' && <p role="alert">{t('signInRequired')}</p>}
            {history.status === 'error' && <p role="alert">{t('recommendationHistoryError')}</p>}
            {showAction && (
              <ActionButton
                type="button"
                aria-disabled={loading}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                onFocus={() => {
                  actionHadFocus.current = true;
                }}
                onBlur={() => {
                  actionHadFocus.current = false;
                }}
                onClick={() => {
                  if (loading) return;
                  setActionUsed(true);
                  void history.load();
                }}
              >
                {t(history.status === 'error' || !history.nextCursor ? 'retry' : 'historyShowMore')}
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
