import { useId, useState } from 'react';
import { useAuthStore } from '../../auth/authStore';
import { useParticipantProgressStore } from '../../participant-progress';
import { ActionButton } from '../../../ui/ActionButton';
import type { InstructorProgressHistoryProps } from '../instructorLessonContextContracts';
import { useInstructorLessonContextTranslations } from '../useInstructorLessonContextTranslations';
import { useInstructorParticipantProgressHistory } from '../useInstructorParticipantProgressHistory';
import { presentProgressHistory } from '../instructorProgressHistoryPresentation';

export function InstructorParticipantProgressHistorySection(props: InstructorProgressHistoryProps) {
  const auth = useAuthStore((state) => state.authGeneration);
  const sync = useParticipantProgressStore((state) => state.syncGeneration);
  return (
    <HistorySection
      key={JSON.stringify([props.participantId, props.bookingId, props.bookingStatus, auth, sync])}
      {...props}
    />
  );
}

function HistorySection({ participantId, skillConfig, authors }: InstructorProgressHistoryProps) {
  const { t, language } = useInstructorLessonContextTranslations();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const history = useInstructorParticipantProgressHistory(participantId);
  const items = presentProgressHistory(history.items, skillConfig, language, authors);
  function toggle() {
    setExpanded(!expanded);
    if (!expanded && history.status === 'idle') void history.load();
  }
  return (
    <section aria-label={t('learningHistory')} className="learning-history space-y-3 min-w-0">
      <h3>
        <ActionButton type="button" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
          {t('learningHistory')}
        </ActionButton>
      </h3>
      <div id={id} hidden={!expanded}>
        {expanded && (
          <div className="space-y-3" aria-busy={history.status === 'loading'}>
            <p className="type-caption text-[var(--ink-dim)]">{t('historyParticipantScope')}</p>
            {items.map((item) => (
              <article
                key={item.id}
                className="space-y-3 border-l-2 border-[var(--accent)] pl-3 min-w-0"
              >
                <p className="type-caption text-[var(--ink-dim)]">
                  {item.dateLabel && (
                    <>
                      <time dateTime={item.dateTime}>{item.dateLabel}</time> ·{' '}
                    </>
                  )}
                  <span data-instructor-id={item.instructorId}>
                    {item.authorName || t('historyAuthorUnknown')}
                  </span>
                </p>
                {item.scores.map((score) => (
                  <div key={score.skillId}>
                    <h4 className="type-body font-medium">{score.title}</h4>
                    <p className="type-caption">
                      <span aria-label={t('historyPreviousScore')}>{score.previous}</span> →{' '}
                      <span aria-label={t('historyNewScore')}>{score.next}</span>
                    </p>
                  </div>
                ))}
                {item.comments.map((comment) => (
                  <div key={comment.skillId} className="space-y-1">
                    <h4 className="type-body font-medium">
                      {comment.title} · {t(comment.label)}
                    </h4>
                    {comment.newText !== undefined && (
                      <p className="whitespace-pre-wrap break-words">{comment.newText}</p>
                    )}
                    {comment.previousText !== undefined && (
                      <details>
                        <summary tabIndex={0}>{t('historyPreviousVersion')}</summary>
                        <p className="whitespace-pre-wrap break-words">{comment.previousText}</p>
                      </details>
                    )}
                  </div>
                ))}
              </article>
            ))}
            {history.status === 'loading' && <p role="status">{t('historyLoading')}</p>}
            {history.status === 'ready' && !items.length && !history.nextCursor && (
              <p role="status">{t('historyEmpty')}</p>
            )}
            {history.status === 'denied' && <p role="alert">{t('lessonContextDenied')}</p>}
            {history.status === 'error' && (
              <div role="alert">
                <p>{t('historyError')}</p>
                <ActionButton type="button" onClick={() => void history.load()}>
                  {t('retry')}
                </ActionButton>
              </div>
            )}
            {history.nextCursor && history.status !== 'error' && (
              <ActionButton
                type="button"
                disabled={history.status === 'loading'}
                onClick={() => void history.load()}
              >
                {t('historyShowMore')}
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
