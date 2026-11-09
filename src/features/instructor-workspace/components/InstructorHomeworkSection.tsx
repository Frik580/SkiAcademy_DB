import { useId, useState } from 'react';
import { useAuthStore } from '../../auth/authStore';
import { ChatMedia } from '../../bookings/components/booking_chat/ChatMedia';
import { ActionButton } from '../../../ui/ActionButton';
import type { InstructorHomeworkSourceInput } from '../instructorLessonContextContracts';
import { useInstructorLessonContextTranslations } from '../useInstructorLessonContextTranslations';
import { useLessonHomeworkHistory } from '../useLessonHomeworkHistory';

type Props = {
  participantId: string;
  bookingId: string;
  sources: readonly InstructorHomeworkSourceInput[];
};

export function InstructorHomeworkSection(props: Props) {
  const generation = useAuthStore((state) => state.authGeneration);
  // Remount before rendering when identity, lesson, principal or membership changes.
  return <HomeworkSection key={JSON.stringify([props, generation])} {...props} />;
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function HomeworkSection({ participantId, bookingId, sources }: Props) {
  const { t, language } = useInstructorLessonContextTranslations();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const eligible = [
    ...new Map(
      sources
        .filter((source) => source.participantIds.includes(participantId))
        .map((source) => [source.threadId, source])
    ).values(),
  ];
  const history = useLessonHomeworkHistory(
    eligible.map((source) => source.threadId),
    participantId,
    bookingId,
    expanded
  );
  return (
    <section
      aria-label={t('scCoachHomework')}
      className="space-y-3 min-w-0 [overflow-wrap:anywhere]"
    >
      <h3>
        <ActionButton
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {t('scCoachHomework')}
        </ActionButton>
      </h3>
      <p className="type-caption text-[var(--ink-dim)]">{t('lessonHomeworkScope')}</p>
      <div id={id} hidden={!expanded}>
        {expanded && (
          <div className="space-y-3 min-w-0" aria-busy={history.loading}>
            {!history.signedIn ? (
              <p role="alert">{t('lessonContextDenied')}</p>
            ) : !eligible.length ? (
              <p role="status">{t('lessonContextUnavailable')}</p>
            ) : (
              <>
                {history.items.map((item) => {
                  const link =
                    item.attachmentType === 'link' && item.attachmentUrl
                      ? safeLink(item.attachmentUrl)
                      : undefined;
                  return (
                    <article
                      key={JSON.stringify([item.threadId, item.id])}
                      className="space-y-2 min-w-0 border-l-2 border-[var(--accent)] pl-3"
                    >
                      <p className="type-caption text-[var(--ink-dim)]">
                        <time dateTime={item.timestamp}>
                          {new Date(item.timestamp).toLocaleString(
                            language === 'ru' ? 'ru-RU' : 'en-US'
                          )}
                        </time>
                        {' · '}
                        {item.senderName?.trim()
                          ? `${t('lessonHomeworkSender')}: ${item.senderName}`
                          : t('historyAuthorUnknown')}
                      </p>
                      <p className="type-caption">
                        {eligible.find((source) => source.threadId === item.threadId)?.label}
                      </p>
                      <p className="whitespace-pre-wrap type-body">{item.text}</p>
                      {item.attachmentUrl &&
                        (item.attachmentType === 'image' || item.attachmentType === 'video') && (
                          <ChatMedia
                            value={item.attachmentUrl}
                            type={item.attachmentType}
                            name={item.attachmentName || t('scCoachHomework')}
                          />
                        )}
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {item.attachmentName || link}
                        </a>
                      )}
                    </article>
                  );
                })}
                {history.loading && <p role="status">{t('historyLoading')}</p>}
                {history.denied.length > 0 && <p role="alert">{t('lessonHomeworkDenied')}</p>}
                {!history.loading &&
                  !history.error &&
                  !history.items.length &&
                  (history.hasMore || !history.denied.length) && (
                    <p role="status">
                      {t(history.hasMore ? 'lessonHomeworkEmptyPage' : 'lessonHomeworkEmpty')}
                    </p>
                  )}
                {history.error && (
                  <div role="alert">
                    <p>{t('historyError')}</p>
                    <ActionButton
                      type="button"
                      disabled={history.loading}
                      onClick={history.loadMore}
                    >
                      {t('retry')}
                    </ActionButton>
                  </div>
                )}
                {history.hasMore && !history.error && (
                  <ActionButton type="button" disabled={history.loading} onClick={history.loadMore}>
                    {t('historyShowMore')}
                  </ActionButton>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
