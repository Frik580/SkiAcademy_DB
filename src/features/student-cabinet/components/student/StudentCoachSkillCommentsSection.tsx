import React, { useEffect, useMemo, useState } from 'react';
import type { SkillConfig } from '../../../../domain/achievements';
import type { Instructor } from '../../../../types';
import { formatSkillScore } from '../../../../lib/i18n/skillScore';
import type { ParticipantProgressView } from '../../../participant-progress/applyParticipantProgressToProfile';
import { StudentDashboardTileBody, StudentDashboardTileHeader } from './StudentDashboardTile';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import { ScTextButton } from './StudentCabinetUI';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { getCurrentSkillComments } from './coachUtils';
import './studentLatestRecommendation.css';

const PAGE_SIZE = 5;

interface StudentCoachSkillCommentsSectionProps {
  participantId?: string;
  progress?: ParticipantProgressView;
  scopeParticipant?: SessionParticipantInput;
  skillConfig?: SkillConfig;
  instructors: readonly Pick<Instructor, 'id' | 'name'>[];
}

/** Current canonical comments, not historical revisions of a changed skill comment. */
export const StudentCoachSkillCommentsSection: React.FC<StudentCoachSkillCommentsSectionProps> = ({
  participantId,
  progress,
  scopeParticipant,
  skillConfig,
  instructors,
}) => {
  const { lang, language, t } = useStudentCabinetTranslations();
  const [pageIndex, setPageIndex] = useState(0);
  const comments = useMemo(() => {
    if (!participantId || progress?.participantId !== participantId) return [];
    return getCurrentSkillComments(progress, skillConfig, lang, instructors).sort((left, right) => {
      const leftAt = left.attribution?.updatedAt;
      const rightAt = right.attribution?.updatedAt;
      if (leftAt && rightAt) {
        if (leftAt.seconds !== rightAt.seconds) return rightAt.seconds - leftAt.seconds;
        if (leftAt.nanoseconds !== rightAt.nanoseconds)
          return rightAt.nanoseconds - leftAt.nanoseconds;
      } else if (leftAt || rightAt) {
        return leftAt ? -1 : 1;
      }
      return left.skillId.localeCompare(right.skillId);
    });
  }, [participantId, progress, skillConfig, lang, instructors]);

  const lastPage = Math.max(0, Math.ceil(comments.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(pageIndex, lastPage);
  useEffect(() => {
    if (pageIndex > lastPage) setPageIndex(lastPage);
  }, [pageIndex, lastPage]);
  const visible = comments.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hasPrevious = currentPage > 0;
  const hasNext = currentPage < lastPage;

  return (
    <section className="sc-latest-recommendation" aria-label={t('scCoachExerciseComments')}>
      <StudentDashboardTileHeader
        title={t('scCoachExerciseComments')}
        actions={
          <ParticipantScopeIndicator
            participant={scopeParticipant}
            visible={Boolean(scopeParticipant)}
          />
        }
      />
      <StudentDashboardTileBody>
        {visible.length === 0 ? (
          <p className="sc-latest-recommendation-state">{t('scNoCoachExerciseComments')}</p>
        ) : (
          <ul className="sc-latest-recommendation-list">
            {visible.map((item) => (
              <li key={item.skillId} className="sc-latest-recommendation-content">
                <div className="sc-latest-recommendation-meta">
                  <p className="type-caption font-medium text-[var(--ink-dim)] break-words min-w-0">
                    {item.title}
                  </p>
                  {item.maxPoints > 0 && (
                    <p className="type-caption tabular-nums text-[var(--ink-dim)] shrink-0">
                      {formatSkillScore(
                        { hasScore: item.hasScore, earned: item.score, maxPoints: item.maxPoints },
                        language
                      )}
                    </p>
                  )}
                </div>
                <blockquote className="sc-latest-recommendation-quote">{item.comment}</blockquote>
                <p className="sc-latest-recommendation-state">
                  {item.authorName}
                  {item.updatedAtLabel ? ` · ${item.updatedAtLabel}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {(hasPrevious || hasNext) && (
          <div className="sc-latest-recommendation-pagination">
            {hasPrevious && (
              <ScTextButton
                className="sc-latest-recommendation-action"
                onClick={() => setPageIndex(currentPage - 1)}
              >
                {t('scRecommendationPrevious')}
              </ScTextButton>
            )}
            {hasNext && (
              <ScTextButton
                className="sc-latest-recommendation-action sc-latest-recommendation-next"
                onClick={() => setPageIndex(currentPage + 1)}
              >
                {t('scRecommendationNext')}
              </ScTextButton>
            )}
          </div>
        )}
      </StudentDashboardTileBody>
    </section>
  );
};
