import React, { useMemo, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { UserProfile } from '../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../lib/skillData';
import { useLanguage } from '../lib/LanguageContext';
import { Target } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';

interface ClientSkillProgressViewProps {
  userProfile: UserProfile;
  skillConfig?: SkillConfig;
}

export const ClientSkillProgressView: React.FC<ClientSkillProgressViewProps> = ({
  userProfile,
  skillConfig = DEFAULT_SKILL_CONFIG,
}) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.15 });
  const shouldReduceMotion = useReducedMotion();
  const currentLevel = userProfile.level || 1;

  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? 80;

  // Target stage transition: Level 1 -> Stage 1 (Beginner->Carve), Level 2 -> Stage 2, Level 3/4 -> Stage 3
  const targetStage = Math.min(currentLevel, 3);

  const progress = useMemo(() => {
    return calculateSkillProgress(
      userProfile.skillScores || {},
      items,
      targetStage,
      passPercentage
    );
  }, [userProfile.skillScores, items, targetStage, passPercentage]);

  const maxPercentage =
    progress.targetMaxPoints > 0
      ? Math.min(100, Math.round((progress.targetEarnedPoints / progress.targetMaxPoints) * 100))
      : 0;
  const ringCircumference = 175.93;

  return (
    <div
      ref={containerRef}
      className="border border-slate-200/70 dark:border-slate-800/70 p-5 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-6"
    >
      {/* Target Progress Requirement Banner */}
      <div className="p-4 surface-accent rounded-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-accent shrink-0" />
            <span className="text-xs font-mono font-bold text-[var(--ink)] uppercase tracking-wider">
              {t('currentLevelProgress')}
            </span>
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
              className="stroke-slate-200 dark:stroke-slate-800 fill-none"
              strokeWidth="7"
            />
            {/* Colored Progress Ring */}
            <motion.circle
              cx="36"
              cy="36"
              r="28"
              className="stroke-[var(--accent)] fill-none"
              strokeWidth="7"
              strokeDasharray={ringCircumference}
              initial={false}
              animate={{
                strokeDashoffset:
                  shouldReduceMotion || isInView
                    ? ringCircumference - (ringCircumference * maxPercentage) / 100
                    : ringCircumference,
              }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
              strokeLinecap="round"
            />
          </svg>
          {/* Centered % Value inside the Hole */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-serif font-bold text-accent leading-none">
              <AnimatedNumber value={maxPercentage} duration={0.9} />%
            </span>
          </div>
        </div>
      </div>

      {/* 📋 Relevant Exercises Tables grouped by Level */}
      <div className="space-y-6">
        <h5 className="text-xs font-mono text-[var(--ink)] font-bold uppercase tracking-wider">
          {t('skillExercisesByLevel')} ({progress.displayItems.length} {t('items')})
        </h5>

        {Array.from(new Set(progress.displayItems.map((i) => i.levelTarget)))
          .sort()
          .map((levelNum) => {
            const levelItems = progress.displayItems.filter((i) => i.levelTarget === levelNum);
            if (levelItems.length === 0) return null;

            return (
              <div key={`level-group-${levelNum}`} className="space-y-2">
                {/* Small Header before exercises for this level */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)]"></span>
                  <h6 className="text-xs font-mono font-bold text-accent uppercase tracking-wider">
                    {t('instructorLevel')} {levelNum}
                  </h6>
                  <span className="text-[10px] font-mono text-[var(--ink-dim)]">
                    ({levelItems.length} {t('exercises')})
                  </span>
                </div>

                {/* Table for this level */}
                <div className="overflow-x-auto border border-slate-200/60 dark:border-slate-800/60 rounded-xs bg-[var(--card-bg)]">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-100/70 dark:bg-slate-900/40 text-[9px] font-mono uppercase text-[var(--ink-dim)] tracking-wider border-b border-slate-200/60 dark:border-slate-800/60">
                        <th className="p-2.5">Наименование упражнения</th>
                        <th className="p-2.5 w-28 text-center">Ваша оценка</th>
                        <th className="p-2.5 w-32 text-center">Прогресс</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50 text-xs font-mono text-[var(--ink)]">
                      {levelItems.map((item, itemIndex) => {
                        const earned = userProfile.skillScores?.[item.id] ?? 0;
                        const percent = Math.min(100, Math.round((earned / item.maxPoints) * 100));

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                          >
                            <td className="p-2.5 text-[11px]">{item.title}</td>
                            <td className="p-2.5 text-center font-bold">
                              <span
                                className={
                                  earned > 0
                                    ? 'text-amber-700 dark:text-amber-400 font-bold'
                                    : 'text-[var(--ink-dim)]'
                                }
                              >
                                {earned} / {item.maxPoints}
                              </span>
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <motion.div
                                    className={`h-full rounded-full ${
                                      percent >= 100
                                        ? 'bg-emerald-600 dark:bg-emerald-400'
                                        : percent > 0
                                          ? 'bg-[var(--accent)]'
                                          : 'bg-transparent'
                                    }`}
                                    initial={false}
                                    animate={{
                                      width: shouldReduceMotion || isInView ? `${percent}%` : '0%',
                                    }}
                                    transition={{
                                      duration: shouldReduceMotion ? 0 : 0.7,
                                      delay: shouldReduceMotion
                                        ? 0
                                        : Math.min(itemIndex * 0.05, 0.25),
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  />
                                </div>
                                <span className="text-[9px] text-[var(--ink-dim)] w-8 text-right font-mono">
                                  <AnimatedNumber value={percent} duration={0.7} />%
                                </span>
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
