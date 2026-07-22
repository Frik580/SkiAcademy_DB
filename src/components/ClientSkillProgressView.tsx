import React, { useMemo } from 'react';
import { UserProfile } from '../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../lib/skillData';
import { useLanguage } from '../lib/LanguageContext';
import { Award, CheckCircle2, ShieldCheck, Target, Zap, Activity, BarChart2 } from 'lucide-react';

interface ClientSkillProgressViewProps {
  userProfile: UserProfile;
  skillConfig?: SkillConfig;
}

export const ClientSkillProgressView: React.FC<ClientSkillProgressViewProps> = ({
  userProfile,
  skillConfig = DEFAULT_SKILL_CONFIG
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

  const levelTitles: Record<number, { titleRu: string; titleEn: string }> = {
    1: { titleRu: 'Beginner → Carve (Уровень 2)', titleEn: 'Beginner → Carve (Level 2)' },
    2: { titleRu: 'Carve → Performance (Уровень 3)', titleEn: 'Carve → Performance (Level 3)' },
    3: { titleRu: 'Performance → Expert (Уровень 4)', titleEn: 'Performance → Expert (Level 4)' }
  };

  const currentStageTitle = levelTitles[targetStage] || levelTitles[1];
  const pointsRemaining = Math.max(0, progress.targetRequiredPoints - progress.targetEarnedPoints);

  return (
    <div className="border border-[var(--border)] p-5 bg-black/10 rounded-none space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-none"></span>
            <h4 className="font-serif text-lg font-light text-[var(--ink)]">
              {language === 'ru' ? 'Прогресс рейтинга и переход на следующий уровень' : 'Skill Progress & Next Level Milestone'}
            </h4>
          </div>
          <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">
            {language === 'ru' ? currentStageTitle.titleRu : currentStageTitle.titleEn}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-black/20 p-2 border border-[var(--border)]/60 shrink-0">
          <Award className="w-5 h-5 text-indigo-400" />
          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {language === 'ru' ? 'Текущий рейтинг' : 'Current Points'}
            </span>
            <span className="text-sm font-serif font-bold text-[var(--ink)]">
              {progress.targetEarnedPoints} / <span className="text-xs text-[var(--ink-dim)]">{progress.targetMaxPoints} б.</span>
            </span>
          </div>
        </div>
      </div>

      {/* Target Progress Requirement Banner */}
      <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs font-mono font-bold text-[var(--ink)] uppercase tracking-wider">
              {language === 'ru' ? 'Критерий перехода на следующий уровень' : 'Advancement Requirement'}
            </span>
          </div>

          <span className="text-xs font-mono font-bold text-amber-400">
            {progress.targetEarnedPoints} / {progress.targetRequiredPoints} {language === 'ru' ? 'баллов' : 'pts'} ({passPercentage}% {language === 'ru' ? 'порог' : 'min'})
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-black/40 border border-[var(--border)]/50 h-3 relative overflow-hidden">
          <div 
            className="bg-gradient-to-r from-indigo-600 to-emerald-500 h-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.round((progress.targetEarnedPoints / progress.targetRequiredPoints) * 100))}%` }}
          />
        </div>

        <p className="text-[10px] font-mono text-[var(--ink-dim)]">
          {pointsRemaining === 0 ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {language === 'ru' 
                ? 'Вы успешно набрали необходимый балл для перехода! Попросите инструктора подтвердить ваш уровень.' 
                : 'Requirement met! Ask your instructor to confirm your level advancement.'}
            </span>
          ) : (
            language === 'ru'
              ? `Для перехода на след. уровень необходимо набрать еще ${pointsRemaining} б. (минимум ${progress.targetRequiredPoints} из ${progress.targetMaxPoints} баллов этапа).`
              : `To advance to next level, you need ${pointsRemaining} more pts (min ${progress.targetRequiredPoints} out of ${progress.targetMaxPoints} pts for this stage).`
          )}
        </p>
      </div>

      {/* 📊 Category Breakdown Grid (Control, Speed, Technique) */}
      <div className="space-y-3">
        <h5 className="text-xs font-mono text-[var(--ink)] font-bold uppercase tracking-wider flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          {language === 'ru' ? 'Распределение показателей (Контроль, Скорость, Техника)' : 'Skill Breakdown (Control, Speed, Technique)'}
        </h5>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          {/* Контроль */}
          <div className="p-3 bg-black/20 border border-cyan-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {language === 'ru' ? 'Контроль' : 'Control'}
              </span>
              <span className="text-xs font-serif font-bold text-cyan-300">
                {progress.control.earned} / {progress.control.max} б.
              </span>
            </div>
            <div className="w-full bg-black/40 border border-[var(--border)]/40 h-2 overflow-hidden">
              <div className="bg-cyan-400 h-full transition-all duration-300" style={{ width: `${progress.control.percentage}%` }} />
            </div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] block text-right">
              {progress.control.percentage}% {language === 'ru' ? `от максимум ${progress.control.max} б.` : `of max ${progress.control.max} pts`}
            </span>
          </div>

          {/* Скорость */}
          <div className="p-3 bg-black/20 border border-amber-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {language === 'ru' ? 'Скорость' : 'Speed'}
              </span>
              <span className="text-xs font-serif font-bold text-amber-300">
                {progress.speed.earned} / {progress.speed.max} б.
              </span>
            </div>
            <div className="w-full bg-black/40 border border-[var(--border)]/40 h-2 overflow-hidden">
              <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${progress.speed.percentage}%` }} />
            </div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] block text-right">
              {progress.speed.percentage}% {language === 'ru' ? `от максимум ${progress.speed.max} б.` : `of max ${progress.speed.max} pts`}
            </span>
          </div>

          {/* Техника */}
          <div className="p-3 bg-black/20 border border-purple-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" />
                {language === 'ru' ? 'Техника' : 'Technique'}
              </span>
              <span className="text-xs font-serif font-bold text-purple-300">
                {progress.technique.earned} / {progress.technique.max} б.
              </span>
            </div>
            <div className="w-full bg-black/40 border border-[var(--border)]/40 h-2 overflow-hidden">
              <div className="bg-purple-400 h-full transition-all duration-300" style={{ width: `${progress.technique.percentage}%` }} />
            </div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] block text-right">
              {progress.technique.percentage}% {language === 'ru' ? `от максимум ${progress.technique.max} б.` : `of max ${progress.technique.max} pts`}
            </span>
          </div>

        </div>
      </div>

      {/* 📋 Relevant Exercises Table for Next Level Transition */}
      <div className="space-y-3">
        <h5 className="text-xs font-mono text-[var(--ink)] font-bold uppercase tracking-wider">
          {language === 'ru' ? `Упражнения этапа (${progress.targetItems.length} элементов)` : `Target Stage Exercises (${progress.targetItems.length} items)`}
        </h5>

        <div className="overflow-x-auto border border-[var(--border)]">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-black/30 text-[9px] font-mono uppercase text-[var(--ink-dim)] tracking-wider border-b border-[var(--border)]">
                <th className="p-2.5 border-r border-[var(--border)]/40">Категория / Раздел</th>
                <th className="p-2.5 border-r border-[var(--border)]/40">Наименование упражнения</th>
                <th className="p-2.5 border-r border-[var(--border)]/40 w-28 text-center">Ваша оценка</th>
                <th className="p-2.5 w-32 text-center">Прогресс</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 text-xs font-mono text-[var(--ink)]">
              {progress.targetItems.map((item) => {
                const earned = userProfile.skillScores?.[item.id] ?? 0;
                const percent = Math.min(100, Math.round((earned / item.maxPoints) * 100));

                return (
                  <tr key={item.id} className="hover:bg-black/10 transition-colors">
                    <td className="p-2.5 border-r border-[var(--border)]/40 text-indigo-300 font-semibold text-[11px]">
                      {item.section}
                    </td>
                    <td className="p-2.5 border-r border-[var(--border)]/40 text-[11px]">
                      {item.title}
                    </td>
                    <td className="p-2.5 border-r border-[var(--border)]/40 text-center font-bold">
                      <span className={earned > 0 ? 'text-amber-400' : 'text-[var(--ink-dim)]'}>
                        {earned} / {item.maxPoints}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-black/40 border border-[var(--border)]/40 h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              percent >= 100 ? 'bg-emerald-400' : percent > 0 ? 'bg-indigo-500' : 'bg-transparent'
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

    </div>
  );
};
