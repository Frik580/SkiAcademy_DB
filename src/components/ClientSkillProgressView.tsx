import React, { useMemo } from 'react';
import { UserProfile } from '../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../lib/skillData';
import { useLanguage } from '../lib/LanguageContext';
import { Target, EyeOff, Eye } from 'lucide-react';

interface ClientSkillProgressViewProps {
  userProfile: UserProfile;
  skillConfig?: SkillConfig;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
}

export const ClientSkillProgressView: React.FC<ClientSkillProgressViewProps> = ({
  userProfile,
  skillConfig = DEFAULT_SKILL_CONFIG,
  onUpdateProfile
}) => {
  const { language } = useLanguage();
  const currentLevel = userProfile.level || 1;

  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? 80;

  // Target stage transition: Level 1 -> Stage 1 (Beginner->Carve), Level 2 -> Stage 2, Level 3/4 -> Stage 3
  const targetStage = Math.min(currentLevel, 3);

  const progress = useMemo(() => {
    return calculateSkillProgress(userProfile.skillScores || {}, items, targetStage, passPercentage);
  }, [userProfile.skillScores, items, targetStage, passPercentage]);

  if (userProfile.hideProgressTracking) {
    return (
      <div className="border border-[var(--border)] p-6 bg-[var(--card-bg)] text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-black/30 border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--ink-dim)]">
          <EyeOff className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--ink)] font-bold">
            {language === 'ru' ? 'Отслеживание прогресса отключено' : 'Progress Tracking Disabled'}
          </h4>
          <p className="text-xs text-[var(--ink-dim)] max-w-md mx-auto mt-1">
            {language === 'ru' 
              ? 'Вы можете включить отображение рейтинга и упражнений обратно в любое время.'
              : 'You can enable rating and skill tracking back at any time.'}
          </p>
        </div>
        {onUpdateProfile && (
          <button
            onClick={() => onUpdateProfile({ hideProgressTracking: false })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600/10 dark:bg-indigo-600/30 border border-indigo-500 hover:bg-indigo-600/20 text-indigo-800 dark:text-indigo-200 text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            {language === 'ru' ? 'Включить отслеживание' : 'Enable Tracking'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] p-5 bg-[var(--card-bg)] rounded-none space-y-6">

      {/* Target Progress Requirement Banner */}
      {(() => {
        const maxPercentage = progress.targetMaxPoints > 0 
          ? Math.min(100, Math.round((progress.targetEarnedPoints / progress.targetMaxPoints) * 100))
          : 0;

        return (
          <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-xs font-mono font-bold text-[var(--ink)] uppercase tracking-wider">
                    {language === 'ru' ? 'Прогресс текущего уровня' : 'Current Level Progress'}
                  </span>
                </div>
                {onUpdateProfile && (
                  <button
                    onClick={() => onUpdateProfile({ hideProgressTracking: true })}
                    className="text-[10px] font-mono text-[var(--ink-dim)] hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                    title={language === 'ru' ? 'Отключить отслеживание прогресса' : 'Disable progress tracking'}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{language === 'ru' ? 'Скрыть' : 'Hide'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Circular Donut Progress Ring with percentage inside */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 72 72">
                {/* Background Track (Circle with Hole) */}
                <circle
                  cx="36"
                  cy="36"
                  r="28"
                  className="stroke-slate-200 dark:stroke-black/50 fill-none"
                  strokeWidth="7"
                />
                {/* Colored Progress Ring */}
                <circle
                  cx="36"
                  cy="36"
                  r="28"
                  className="stroke-indigo-600 dark:stroke-indigo-400 fill-none transition-all duration-700 ease-out"
                  strokeWidth="7"
                  strokeDasharray={175.93}
                  strokeDashoffset={175.93 - (175.93 * maxPercentage) / 100}
                  strokeLinecap="round"
                />
              </svg>
              {/* Centered % Value inside the Hole */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-serif font-bold text-indigo-900 dark:text-indigo-300 leading-none">
                  {maxPercentage}%
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📋 Relevant Exercises Tables grouped by Level */}
      <div className="space-y-6">
        <h5 className="text-xs font-mono text-[var(--ink)] font-bold uppercase tracking-wider">
          {language === 'ru' ? `Упражнения по уровням (${progress.displayItems.length} элементов)` : `Skill Exercises by Level (${progress.displayItems.length} items)`}
        </h5>

        {Array.from(new Set(progress.displayItems.map(i => i.levelTarget))).sort().map((levelNum) => {
          const levelItems = progress.displayItems.filter(i => i.levelTarget === levelNum);
          if (levelItems.length === 0) return null;

          return (
            <div key={`level-group-${levelNum}`} className="space-y-2">
              {/* Small Header before exercises for this level */}
              <div className="flex items-center gap-2 pt-1">
                <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400"></span>
                <h6 className="text-xs font-mono font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
                  {language === 'ru' ? `Уровень ${levelNum}` : `Level ${levelNum}`}
                </h6>
                <span className="text-[10px] font-mono text-[var(--ink-dim)]">
                  ({levelItems.length} {language === 'ru' ? 'упражнений' : 'exercises'})
                </span>
              </div>

              {/* Table for this level */}
              <div className="overflow-x-auto border border-[var(--border)] bg-[var(--card-bg)]">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-100/90 dark:bg-black/30 text-[9px] font-mono uppercase text-[var(--ink-dim)] tracking-wider border-b border-[var(--border)]">
                      <th className="p-2.5 border-r border-[var(--border)]/60">Наименование упражнения</th>
                      <th className="p-2.5 border-r border-[var(--border)]/60 w-28 text-center">Ваша оценка</th>
                      <th className="p-2.5 w-32 text-center">Прогресс</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/60 text-xs font-mono text-[var(--ink)]">
                    {levelItems.map((item) => {
                      const earned = userProfile.skillScores?.[item.id] ?? 0;
                      const percent = Math.min(100, Math.round((earned / item.maxPoints) * 100));

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-black/10 transition-colors">
                          <td className="p-2.5 border-r border-[var(--border)]/60 text-[11px]">
                            {item.title}
                          </td>
                          <td className="p-2.5 border-r border-[var(--border)]/60 text-center font-bold">
                            <span className={earned > 0 ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-[var(--ink-dim)]'}>
                              {earned} / {item.maxPoints}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-200 dark:bg-black/40 border border-[var(--border)]/60 h-2 overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-300 ${
                                    percent >= 100 ? 'bg-emerald-600 dark:bg-emerald-400' : percent > 0 ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-transparent'
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-[var(--ink-dim)] w-8 text-right font-mono">{percent}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
