import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../../../lib/skillData';
import { ClientSkillProgressView } from '../../ClientSkillProgressView';
import { StudentCabinetContext } from './StudentCabinetHome';
import {
  getLevelLabel,
  getLevelProgressPercent,
  getPrioritySkillItems,
  SkillRingFilter,
} from './studentCabinetUtils';
import { ScDivider, ScProgressBar, ScSectionTitle, StudentPanelBackLink } from './StudentCabinetUI';

interface StudentDevelopmentPanelProps extends StudentCabinetContext {
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
}

const RING_FILTERS: { id: SkillRingFilter; labelKey: 'scDevFilterAll' | 'technique' | 'control' | 'speed' }[] = [
  { id: 'all', labelKey: 'scDevFilterAll' },
  { id: 'technique', labelKey: 'technique' },
  { id: 'control', labelKey: 'control' },
  { id: 'speed', labelKey: 'speed' },
];

export const StudentDevelopmentPanel: React.FC<StudentDevelopmentPanelProps> = ({
  userProfile,
  skillConfig,
  activityLogs = [],
  onToggleSkillToday,
  onGoToTab,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const level = userProfile.level || 1;
  const hideProgress = Boolean(userProfile.hideProgressTracking);
  const [ringFilter, setRingFilter] = useState<SkillRingFilter>('all');

  const { percent, remaining } = getLevelProgressPercent(userProfile, skillConfig);
  const skillItems = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? DEFAULT_SKILL_CONFIG.passPercentage;
  const skillProgress = useMemo(
    () => calculateSkillProgress(userProfile.skillScores || {}, skillItems, level, passPercentage),
    [userProfile.skillScores, skillItems, level, passPercentage]
  );

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

  const ringStats = useMemo(
    () => ({
      technique: skillProgress.technique.percentage,
      control: skillProgress.control.percentage,
      speed: skillProgress.speed.percentage,
    }),
    [skillProgress]
  );

  return (
    <div className="space-y-0 pb-24 max-w-2xl mx-auto px-4 sm:px-6 w-full min-w-0">
      <section className="py-6 space-y-4">
        <StudentPanelBackLink onClick={() => onGoToTab('home')} />
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
                {t('scPointsToNextLevel').replace('{n}', String(remaining))}
              </p>
            </>
          )}
        </div>
      </section>

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
                      <p className="text-sm text-[var(--ink)] leading-snug">{item.title}</p>
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

      <ScDivider />

      <section className="py-6 space-y-4">
        <div className="space-y-3">
          <ScSectionTitle>{t('scDevAllExercises')}</ScSectionTitle>
          <div className="flex flex-wrap gap-2">
            {RING_FILTERS.map(({ id, labelKey }) => {
              const active = ringFilter === id;
              const stat =
                id === 'technique' || id === 'control' || id === 'speed'
                  ? ringStats[id]
                  : null;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRingFilter(id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {t(labelKey)}
                  {!hideProgress && stat !== null && (
                    <span className="ml-1 tabular-nums opacity-80">{stat}%</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--ink-dim)]">{t('scDevPinHint')}</p>
        </div>
        <ClientSkillProgressView
          userProfile={userProfile}
          skillConfig={skillConfig}
          ringFilter={ringFilter}
          hideScores={hideProgress}
          onToggleSkillToday={onToggleSkillToday}
        />
      </section>
    </div>
  );
};
