import React, { useMemo } from 'react';
import { formatPointsCount } from '../../../../lib/i18n/pluralize';
import {
  getLevelLabel,
  getLevelProgressPercent,
  getPrioritySkillItems,
} from './studentCabinetUtils';
import { ScDivider, ScProgressBar, ScSectionTitle, StudentPanelBackLink } from './StudentCabinetUI';
import { SkillRadarChart } from './SkillRadarChart';
import { getSkillItemTitle } from '../../../../domain/achievements';
import type { StudentDevelopmentPanelInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export const StudentDevelopmentPanel: React.FC<StudentDevelopmentPanelInput> = ({
  userProfile,
  skillConfig,
  activityLogs = [],
  onToggleSkillToday,
  onPinSkillsToday,
  onGoToTab,
}) => {
  const { language, t, lang } = useStudentCabinetTranslations();
  const level = userProfile.level || 1;
  const hideProgress = Boolean(userProfile.hideProgressTracking);

  const { percent, remaining } = getLevelProgressPercent(userProfile, skillConfig);

  const priorityItems = useMemo(
    () => getPrioritySkillItems(userProfile, skillConfig),
    [userProfile, skillConfig]
  );

  const lastSkillUpdate = useMemo(
    () =>
      activityLogs
        .filter((log) => log.type === 'skill_scores_updated')
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0],
    [activityLogs]
  );

  return (
    <div className="space-y-0 pb-24 max-w-3xl mx-auto px-4 sm:px-6 w-full min-w-0">
      <section className="py-6 space-y-4">
        <StudentPanelBackLink onClick={() => onGoToTab('training')} labelKey="scNavTraining" />
        <div className="space-y-1">
          <h1 className="text-2xl font-serif font-light text-[var(--ink)]">
            {t('scDevelopmentDetail')}
          </h1>
          <p className="text-xs tracking-widest text-[var(--ink-dim)] uppercase">
            LEVEL {level} · {getLevelLabel(level, lang)}
          </p>
        </div>
        <div className="space-y-2">
          {!hideProgress && (
            <>
              <ScProgressBar percent={percent} variant="apple" showLabel />
              <p className="text-sm text-[var(--ink-dim)]">
                {t('scPointsToNextLevel').replace(
                  '{pointsLabel}',
                  formatPointsCount(remaining, lang)
                )}
              </p>
            </>
          )}
        </div>
      </section>

      {!hideProgress && (
        <>
          <ScDivider />
          <section className="py-6 space-y-4">
            <div className="space-y-1">
              <ScSectionTitle>{t('scRadarTitle')}</ScSectionTitle>
              <p className="text-sm text-[var(--ink-dim)]">{t('scRadarSubtitle')}</p>
            </div>
            <SkillRadarChart
              userProfile={userProfile}
              skillConfig={skillConfig}
              onToggleSkillToday={onToggleSkillToday}
              onPinSkillsToday={onPinSkillsToday}
            />
          </section>
        </>
      )}

      {lastSkillUpdate && !hideProgress && (
        <>
          <ScDivider />
          <section className="py-6">
            <p className="text-sm text-[var(--ink)]">
              {t('scDevLastScoreUpdate')}
              {lastSkillUpdate.metadata?.pointsDelta
                ? ` +${lastSkillUpdate.metadata.pointsDelta}`
                : ''}
            </p>
            {lastSkillUpdate.metadata?.instructorName && (
              <p className="text-xs text-[var(--ink-dim)] mt-1">
                {lastSkillUpdate.metadata.instructorName}
              </p>
            )}
          </section>
        </>
      )}

      {priorityItems.length > 0 && (
        <>
          <ScDivider />
          <section className="py-6 space-y-3">
            <div className="space-y-1">
              <ScSectionTitle>{t('scDevPriorityExercises')}</ScSectionTitle>
              <p className="text-sm text-[var(--ink-dim)]">{t('scDevPrioritySub')}</p>
            </div>
            <ul className="space-y-2">
              {priorityItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--ink)] leading-snug">
                        {getSkillItemTitle(item, language)}
                      </p>
                      {!hideProgress && (
                        <p className="text-xs text-[var(--ink-dim)] tabular-nums mt-1">
                          {item.earned} / {item.maxPoints} · {item.percent}%
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSkillToday?.(item.id, !item.pinned)}
                      disabled={!onToggleSkillToday}
                      className={`shrink-0 text-xs font-medium transition ${
                        item.pinned
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--ink-dim)] hover:text-[var(--accent)]'
                      } disabled:opacity-50`}
                    >
                      {item.pinned ? t('scRemoveFromToday') : t('scAddToToday')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
};
