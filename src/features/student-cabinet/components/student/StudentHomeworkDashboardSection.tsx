import { useEffect, useMemo, useState } from 'react';
import type { InstructorHomeworkSourceInput } from '../../../instructor-workspace/instructorLessonContextContracts';
import { useLessonHomeworkHistory } from '../../../instructor-workspace/useLessonHomeworkHistory';
import { ChatMedia } from '../../../bookings/components/booking_chat/ChatMedia';
import { StudentDashboardTileBody, StudentDashboardTileHeader } from './StudentDashboardTile';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import { ScTextButton } from './StudentCabinetUI';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import './studentLatestRecommendation.css';

export const STUDENT_HOMEWORK_TILE_PAGE_SIZE = 5;

interface Props {
  accountId: string;
  participantId?: string;
  scopeParticipant?: SessionParticipantInput;
  sources: readonly InstructorHomeworkSourceInput[];
  sourceFeedback?: { loading: boolean; denied: readonly string[]; error: boolean; retry: () => void };
}

function safeHomeworkLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Shares the instructor lesson card's authorized multi-thread homework history model. */
export function StudentHomeworkDashboardSection({
  accountId,
  participantId,
  scopeParticipant,
  sources,
  sourceFeedback,
}: Props) {
  const { lang, t } = useStudentCabinetTranslations();
  const [pageIndex, setPageIndex] = useState(0);
  const eligible = useMemo(
    () => sources.filter((source) => participantId && source.participantIds.includes(participantId)),
    [sources, participantId]
  );
  const threadIds = useMemo(() => [...new Set(eligible.map((source) => source.threadId))], [eligible]);
  const sourceLabels = useMemo(
    () => new Map(eligible.map(({ threadId, label }) => [threadId, label])),
    [eligible]
  );
  const history = useLessonHomeworkHistory(
    threadIds,
    participantId ?? '',
    JSON.stringify([accountId, participantId, 'student-homework-tile']),
    Boolean(participantId && eligible.length)
  );
  const visibleItems = history.items.slice(
    pageIndex * STUDENT_HOMEWORK_TILE_PAGE_SIZE,
    (pageIndex + 1) * STUDENT_HOMEWORK_TILE_PAGE_SIZE
  );
  const hasPrevious = pageIndex > 0;
  const hasNext =
    history.items.length > (pageIndex + 1) * STUDENT_HOMEWORK_TILE_PAGE_SIZE ||
    (visibleItems.length > 0 && history.hasMore);

  // A page from the shared source history can contain assignments for other
  // participants. Scan the next bounded source batch instead of exposing empty pages.
  useEffect(() => {
    if (!participantId || !eligible.length || !history.signedIn || history.loading || history.error)
      return;
    if (
      history.hasMore &&
      history.items.length < (pageIndex + 1) * STUDENT_HOMEWORK_TILE_PAGE_SIZE
    )
      history.loadMore();
  }, [
    participantId,
    eligible.length,
    history.signedIn,
    history.loading,
    history.error,
    history.hasMore,
    history.items.length,
    history.loadMore,
    pageIndex,
  ]);

  useEffect(() => {
    if (!history.loading && !history.hasMore && visibleItems.length === 0 && pageIndex > 0) {
      setPageIndex(Math.max(0, Math.ceil(history.items.length / STUDENT_HOMEWORK_TILE_PAGE_SIZE) - 1));
    }
  }, [history.loading, history.hasMore, history.items.length, visibleItems.length, pageIndex]);

  const pendingPage = sourceFeedback?.loading || (
    history.loading &&
    history.items.length <= pageIndex * STUDENT_HOMEWORK_TILE_PAGE_SIZE &&
    Boolean(threadIds.length));
  const hasDeniedSources = history.denied.length > 0 || Boolean(sourceFeedback?.denied.length);
  const hasError = history.error || sourceFeedback?.error;

  return (
    <section className="sc-latest-recommendation" aria-label={t('scCoachHomework')}>
      <StudentDashboardTileHeader
        title={t('scCoachHomework')}
        actions={
          <ParticipantScopeIndicator
            participant={scopeParticipant}
            visible={Boolean(scopeParticipant)}
          />
        }
      />
      <StudentDashboardTileBody>
        {!history.signedIn ? (
          <p role="status" className="sc-latest-recommendation-state">{t('lessonContextDenied')}</p>
        ) : pendingPage ? (
          <p role="status" className="sc-latest-recommendation-state">{t('loading')}</p>
        ) : visibleItems.length === 0 && !history.hasMore && !hasError && !hasDeniedSources ? (
          <p className="sc-latest-recommendation-state">{t('scCoachNoHomework')}</p>
        ) : (
          <ul className="sc-latest-recommendation-list">
            {visibleItems.map((item) => {
              const link =
                item.attachmentType === 'link' && item.attachmentUrl
                  ? safeHomeworkLink(item.attachmentUrl)
                  : undefined;
              return (
                <li
                  key={JSON.stringify([item.threadId, item.id])}
                  className="sc-latest-recommendation-content"
                >
                  <div className="sc-latest-recommendation-meta">
                    <p className="type-caption text-[var(--ink-dim)]">
                      <time dateTime={item.timestamp}>
                        {new Date(item.timestamp).toLocaleString(
                          lang === 'ru' ? 'ru-RU' : 'en-GB',
                          { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                        )}
                      </time>
                        {item.archived && ` · ${t('chatArchivedHomeworkBadge')}`}
                    </p>
                    {sourceLabels.get(item.threadId) && (
                      <p className="type-caption text-[var(--ink-dim)] break-words">
                        {sourceLabels.get(item.threadId)}
                      </p>
                    )}
                  </div>
                  <blockquote className="sc-latest-recommendation-quote whitespace-pre-wrap">
                    {item.text}
                  </blockquote>
                  {item.attachmentUrl && (item.attachmentType === 'image' || item.attachmentType === 'video') && (
                    <ChatMedia
                      value={item.attachmentUrl}
                      type={item.attachmentType}
                      name={item.attachmentName || t('scCoachHomework')}
                      className="max-w-full"
                    />
                  )}
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                       className="type-button text-[var(--accent)] underline break-all">
                      {item.attachmentName || link}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {hasDeniedSources && <p role="alert">{t('lessonContextDenied')}</p>}
        {hasError && (
          <div role="alert">
            <p className="sc-latest-recommendation-state">{t('requestFailed')}</p>
            <ScTextButton onClick={() => {
              if (history.error) history.loadMore();
              if (sourceFeedback?.error) sourceFeedback.retry();
            }}>{t('retry')}</ScTextButton>
          </div>
        )}
        {history.signedIn && (hasPrevious || hasNext) && (
          <div className="sc-latest-recommendation-pagination">
            {hasPrevious && (
              <ScTextButton
                className="sc-latest-recommendation-action"
                onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
              >
                {t('scRecommendationPrevious')}
              </ScTextButton>
            )}
            {hasNext && (
              <ScTextButton
                className="sc-latest-recommendation-action sc-latest-recommendation-next"
                aria-disabled={pendingPage || history.error}
                onClick={() => {
                  if (!pendingPage && !history.error) setPageIndex(pageIndex + 1);
                }}
              >
                {t('scRecommendationNext')}
              </ScTextButton>
            )}
          </div>
        )}
      </StudentDashboardTileBody>
    </section>
  );
}
