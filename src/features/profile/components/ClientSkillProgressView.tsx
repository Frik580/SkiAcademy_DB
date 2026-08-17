import React, { useMemo } from 'react';
import { UserProfile } from '../../../types';
import {
  SkillConfig,
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
  getSkillItemTitle,
} from '../../../lib/skillData';
import { useLanguage } from '../../../lib/LanguageContext';
import {
  matchesSkillRingFilter,
  SkillRingFilter,
} from '../../../features/student-cabinet/components/student/studentCabinetUtils';

interface ClientSkillProgressViewProps {
  userProfile: UserProfile;
  skillConfig?: SkillConfig;
  ringFilter?: SkillRingFilter;
  hideScores?: boolean;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
}

export const ClientSkillProgressView: React.FC<ClientSkillProgressViewProps> = ({
  userProfile,
  skillConfig = DEFAULT_SKILL_CONFIG,
  ringFilter = 'all',
  hideScores = false,
  onToggleSkillToday,
}) => {
  const { t, language } = useLanguage();
  const currentLevel = userProfile.level || 1;
  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? 80;
  const pinnedIds = new Set(userProfile.todaySkillItemIds ?? []);

  const targetStage = Math.min(currentLevel, 3);

  const progress = useMemo(
    () => calculateSkillProgress(userProfile.skillScores || {}, items, targetStage, passPercentage),
    [userProfile.skillScores, items, targetStage, passPercentage]
  );

  const levelGroups = Array.from(new Set(progress.displayItems.map((i) => i.levelTarget))).sort();

  return (
    <div className="space-y-8">
      {levelGroups.map((levelNum) => {
        const levelItems = progress.displayItems.filter((i) => i.levelTarget === levelNum);
        const filteredLevelItems = levelItems.filter((item) =>
          matchesSkillRingFilter(item, ringFilter)
        );
        if (filteredLevelItems.length === 0) return null;

        return (
          <div key={`level-group-${levelNum}`} className="space-y-1">
            <h3 className="text-xs font-medium text-[var(--ink-dim)] uppercase tracking-wider px-1 pb-2">
              {t('instructorLevel')} {levelNum}
            </h3>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {filteredLevelItems.map((item) => {
                const earned = userProfile.skillScores?.[item.id] ?? 0;
                const pinned = pinnedIds.has(item.id);
                const isMaxScore = item.maxPoints > 0 && earned >= item.maxPoints;

                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 py-3.5 px-1 text-sm text-[var(--ink)]"
                  >
                    {isMaxScore ? (
                      <span
                        className="w-4 shrink-0 leading-5 text-emerald-600 dark:text-emerald-400"
                        aria-label={t('scExerciseCompleted')}
                        title={t('scExerciseCompleted')}
                      >
                        ✓
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleSkillToday?.(item.id, !pinned)}
                        disabled={!onToggleSkillToday}
                        className={`w-4 shrink-0 leading-5 transition ${
                          pinned
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--ink-dim)] hover:text-[var(--accent)]'
                        } disabled:opacity-50`}
                        aria-label={pinned ? t('scRemoveFromToday') : t('scAddToToday')}
                      >
                        {pinned ? '●' : '○'}
                      </button>
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`leading-snug ${isMaxScore ? 'text-[var(--ink-dim)]' : ''}`}>
                        {getSkillItemTitle(item, language)}
                      </p>
                      {!hideScores && (
                        <p
                          className={`text-xs tabular-nums ${
                            isMaxScore
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : 'text-[var(--ink-dim)]'
                          }`}
                        >
                          {earned} / {item.maxPoints}
                        </p>
                      )}
                      {userProfile.skillComments?.[item.id]?.trim() && (
                        <div className="pt-1 space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-dim)]">
                            {t('scCoachExerciseComment')}
                          </p>
                          <p className="text-xs text-[var(--ink)] italic leading-relaxed">
                            &ldquo;{userProfile.skillComments[item.id].trim()}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};
