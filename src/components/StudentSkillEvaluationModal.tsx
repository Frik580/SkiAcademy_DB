import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateStudentLevel, calculateSkillProgress } from '../lib/skillData';
import { useLanguage } from '../lib/LanguageContext';
import { X, Save, Award, CheckCircle2, AlertCircle } from 'lucide-react';

interface StudentSkillEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentUid: string;
  studentName: string;
  studentLevel: number;
  existingScores?: Record<string, number>;
  skillConfig?: SkillConfig;
  onSaveScores: (studentUid: string, updatedScores: Record<string, number>, calculatedLevel: number) => Promise<void>;
}

export const StudentSkillEvaluationModal: React.FC<StudentSkillEvaluationModalProps> = ({
  isOpen,
  onClose,
  studentUid,
  studentName,
  studentLevel,
  existingScores = {},
  skillConfig = DEFAULT_SKILL_CONFIG,
  onSaveScores
}) => {
  const { language } = useLanguage();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [activeTargetLevel, setActiveTargetLevel] = useState<number>(Math.min(studentLevel || 1, 3));
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setScores(existingScores || {});
      setActiveTargetLevel(Math.min(studentLevel || 1, 3));
    }
  }, [isOpen, existingScores, studentLevel]);

  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? 80;

  // Filter items by selected stage
  const stageItems = useMemo(() => {
    return items.filter(item => item.levelTarget === activeTargetLevel);
  }, [items, activeTargetLevel]);

  // Calculate current progress for this target level
  const progress = useMemo(() => {
    return calculateSkillProgress(scores, items, activeTargetLevel, passPercentage);
  }, [scores, items, activeTargetLevel, passPercentage]);

  // Projected new overall level for student
  const projectedLevel = useMemo(() => {
    return calculateStudentLevel(scores, items, passPercentage);
  }, [scores, items, passPercentage]);

  if (!isOpen) return null;

  const handleScoreChange = (itemId: string, val: number, maxPoints: number) => {
    const safeVal = Math.max(0, Math.min(maxPoints, val));
    setScores(prev => ({
      ...prev,
      [itemId]: safeVal
    }));
  };

  const handleFillAllMax = () => {
    const updated = { ...scores };
    stageItems.forEach(item => {
      updated[item.id] = item.maxPoints;
    });
    setScores(updated);
  };

  const handleClearStage = () => {
    const updated = { ...scores };
    stageItems.forEach(item => {
      updated[item.id] = 0;
    });
    setScores(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveScores(studentUid, scores, projectedLevel);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-4xl max-h-[90vh] my-auto flex flex-col shadow-2xl rounded-none overflow-hidden text-[var(--ink)] relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-black/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                {language === 'ru' ? `Оценка навыков ученика: ${studentName}` : `Student Skill Evaluation: ${studentName}`}
              </h3>
              <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                {language === 'ru' 
                  ? `Текущий уровень: ${studentLevel} • Прогнозируемый уровень: ${projectedLevel}` 
                  : `Current Level: ${studentLevel} • Projected Level: ${projectedLevel}`}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level Transition Tabs */}
        <div className="flex border-b border-[var(--border)] bg-black/10 px-4 pt-3 gap-2">
          <button
            onClick={() => setActiveTargetLevel(1)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTargetLevel === 1 
                ? 'border-indigo-500 font-bold text-indigo-400 bg-black/20' 
                : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            Beginner → Carve (Уровень 1 → 2)
          </button>
          <button
            onClick={() => setActiveTargetLevel(2)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTargetLevel === 2 
                ? 'border-indigo-500 font-bold text-indigo-400 bg-black/20' 
                : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            Carve → Performance (Уровень 2 → 3)
          </button>
          <button
            onClick={() => setActiveTargetLevel(3)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTargetLevel === 3 
                ? 'border-indigo-500 font-bold text-indigo-400 bg-black/20' 
                : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            Performance → Expert (Уровень 3 → 4)
          </button>
        </div>

        {/* Summary Bar */}
        <div className="p-4 bg-black/30 border-b border-[var(--border)] grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {language === 'ru' ? 'Набрано баллов' : 'Earned Points'}
            </span>
            <span className="text-xl font-serif font-bold text-[var(--ink)]">
              {progress.targetEarnedPoints} / <span className="text-sm text-[var(--ink-dim)]">{progress.targetMaxPoints}</span>
            </span>
          </div>

          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {language === 'ru' ? 'Необходимо для перехода' : 'Required to Level Up'}
            </span>
            <span className="text-xl font-serif font-bold text-amber-400">
              {progress.targetRequiredPoints} <span className="text-xs text-[var(--ink-dim)]">({passPercentage}%)</span>
            </span>
          </div>

          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {language === 'ru' ? 'Статус перехода' : 'Advancement Status'}
            </span>
            {progress.targetEarnedPoints >= progress.targetRequiredPoints ? (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                {language === 'ru' ? 'Готов к переходу!' : 'Ready to Advance!'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4" />
                {language === 'ru' ? `Осталось ${progress.targetRequiredPoints - progress.targetEarnedPoints} б.` : `${progress.targetRequiredPoints - progress.targetEarnedPoints} pts left`}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleFillAllMax}
              className="px-2.5 py-1 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 text-[9px] font-mono uppercase tracking-wider transition cursor-pointer"
            >
              {language === 'ru' ? 'Заполнить макс.' : 'Fill Max'}
            </button>
            <button
              onClick={handleClearStage}
              className="px-2.5 py-1 border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)] text-[9px] font-mono uppercase tracking-wider transition cursor-pointer"
            >
              {language === 'ru' ? 'Очистить' : 'Clear'}
            </button>
          </div>
        </div>

        {/* Exercise Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {stageItems.length === 0 ? (
            <div className="py-12 text-center text-[var(--ink-dim)] font-mono text-xs">
              {language === 'ru' ? 'Упражнения для данного уровня не найдены' : 'No skill items found for this level stage'}
            </div>
          ) : (
            stageItems.map((item) => {
              const currentScore = scores[item.id] ?? 0;
              return (
                <div 
                  key={item.id} 
                  className="p-3 bg-black/10 border border-[var(--border)]/60 hover:border-[var(--border)] transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-indigo-400 block font-semibold">
                      {item.section}
                    </span>
                    <h5 className="text-xs font-medium text-[var(--ink)] leading-snug">
                      {item.title}
                    </h5>
                    <div className="flex gap-2 text-[9px] font-mono text-[var(--ink-dim)]">
                      <span className="text-cyan-300">Контроль: {item.controlPoints || 0}</span>
                      <span className="text-amber-300">Скорость: {item.speedPoints || 0}</span>
                      <span className="text-purple-300">Техника: {item.techniquePoints || 0}</span>
                    </div>
                  </div>

                  {/* Rating Controls */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 bg-black/30 border border-[var(--border)] p-1">
                      {[...Array(item.maxPoints + 1)].map((_, val) => (
                        <button
                          key={val}
                          onClick={() => handleScoreChange(item.id, val, item.maxPoints)}
                          className={`w-6 h-6 text-[10px] font-mono font-bold transition cursor-pointer ${
                            currentScore === val 
                              ? 'bg-indigo-600 text-white shadow' 
                              : val <= currentScore 
                                ? 'bg-indigo-900/40 text-indigo-200' 
                                : 'bg-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>

                    <div className="text-right w-14">
                      <span className="text-xs font-mono font-bold text-amber-400">{currentScore}</span>
                      <span className="text-[10px] font-mono text-[var(--ink-dim)]"> / {item.maxPoints}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-black/20 flex justify-between items-center">
          <div className="text-xs font-mono text-[var(--ink-dim)]">
            {language === 'ru' 
              ? `После сохранения уровень ученика станет ${projectedLevel}` 
              : `After saving, student level will become ${projectedLevel}`}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border)] text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer"
            >
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono uppercase tracking-wider font-bold transition flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? (language === 'ru' ? 'Сохранение...' : 'Saving...') : (language === 'ru' ? 'Сохранить оценки' : 'Save Ratings')}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
