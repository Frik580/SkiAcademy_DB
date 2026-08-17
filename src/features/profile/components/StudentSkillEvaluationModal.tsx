import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  SkillConfig,
  DEFAULT_SKILL_CONFIG,
  calculateStudentLevel,
  calculateSkillProgress,
  classifySkillItemToRadarDimension,
  getSkillItemTitle,
  getSkillItemSection,
  getRadarDimensionLabel,
} from '../../../lib/skillData';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { X, Save, Award, CheckCircle2, AlertCircle } from 'lucide-react';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';

interface StudentSkillEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentUid: string;
  studentName: string;
  studentLevel: number;
  existingScores?: Record<string, number>;
  existingComments?: Record<string, string>;
  skillConfig?: SkillConfig;
  onSaveScores: (
    studentUid: string,
    updatedScores: Record<string, number>,
    calculatedLevel: number,
    updatedComments: Record<string, string>
  ) => Promise<void>;
}

export const StudentSkillEvaluationModal: React.FC<StudentSkillEvaluationModalProps> = ({
  isOpen,
  onClose,
  studentUid,
  studentName,
  studentLevel,
  existingScores = {},
  existingComments = {},
  skillConfig = DEFAULT_SKILL_CONFIG,
  onSaveScores,
}) => {
  const { t, language } = useLanguage();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [activeTargetLevel, setActiveTargetLevel] = useState<number>(
    Math.min(studentLevel || 1, 3)
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setScores(existingScores || {});
      setComments(existingComments || {});
      setActiveTargetLevel(Math.min(studentLevel || 1, 3));
    }
  }, [isOpen, existingScores, existingComments, studentLevel]);

  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? 80;

  // Filter items by selected stage
  const stageItems = useMemo(() => {
    return items.filter((item) => item.levelTarget === activeTargetLevel);
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
    setScores((prev) => ({
      ...prev,
      [itemId]: safeVal,
    }));
    if (safeVal === 0) {
      setComments((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  const handleCommentChange = (itemId: string, value: string) => {
    setComments((prev) => {
      const trimmed = value.trim();
      if (!trimmed) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: value };
    });
  };

  const pruneComments = (raw: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(raw)
        .map(([id, text]) => [id, text.trim()] as const)
        .filter(([, text]) => text.length > 0)
    );

  const handleFillAllMax = () => {
    const updated = { ...scores };
    stageItems.forEach((item) => {
      updated[item.id] = item.maxPoints;
    });
    setScores(updated);
  };

  const handleClearStage = () => {
    const updated = { ...scores };
    const clearedComments = { ...comments };
    stageItems.forEach((item) => {
      updated[item.id] = 0;
      delete clearedComments[item.id];
    });
    setScores(updated);
    setComments(clearedComments);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveScores(studentUid, scores, projectedLevel, pruneComments(comments));
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <BodyScrollLock />
      <div className="ui-modal w-full max-w-4xl max-h-[80vh] my-auto flex flex-col shadow-2xl overflow-hidden rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-muted border border-accent/40 text-accent rounded-lg">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                {t('studentSkillEvaluation')}: {studentName}
              </h3>
              <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                {t('instructorCurrentLevel')}: {studentLevel} • {t('projectedLevel')}:{' '}
                {projectedLevel}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
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
                ? 'border-accent font-bold text-accent bg-black/20'
                : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            Beginner → Carve ({t('levelStage')} 1 → 2)
          </button>
          <button
            onClick={() => setActiveTargetLevel(2)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTargetLevel === 2
                ? 'border-accent font-bold text-accent bg-black/20'
                : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            Carve → Performance ({t('levelStage')} 2 → 3)
          </button>
          <button
            onClick={() => setActiveTargetLevel(3)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTargetLevel === 3
                ? 'border-accent font-bold text-accent bg-black/20'
                : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            Performance → Expert ({t('levelStage')} 3 → 4)
          </button>
        </div>

        {/* Summary Bar */}
        <div className="p-4 bg-black/30 border-b border-[var(--border)] grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {t('earnedPoints')}
            </span>
            <span className="text-xl font-serif font-bold text-[var(--ink)]">
              {progress.targetEarnedPoints} /{' '}
              <span className="text-sm text-[var(--ink-dim)]">{progress.targetMaxPoints}</span>
            </span>
          </div>

          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {t('requiredToLevelUp')}
            </span>
            <span className="text-xl font-serif font-bold text-amber-400">
              {progress.targetRequiredPoints}{' '}
              <span className="text-xs text-[var(--ink-dim)]">({passPercentage}%)</span>
            </span>
          </div>

          <div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
              {t('advancementStatus')}
            </span>
            {progress.targetEarnedPoints >= progress.targetRequiredPoints ? (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                {t('readyToAdvance')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4" />
                {progress.targetRequiredPoints - progress.targetEarnedPoints} {t('pointsLeft')}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleFillAllMax}
              className="px-2.5 py-1 border border-accent/40 text-accent hover:bg-accent-muted text-[9px] font-mono uppercase tracking-wider transition cursor-pointer"
            >
              {t('fillMax')}
            </button>
            <button
              onClick={handleClearStage}
              className="px-2.5 py-1 border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)] text-[9px] font-mono uppercase tracking-wider transition cursor-pointer"
            >
              {t('clear')}
            </button>
          </div>
        </div>

        {/* Exercise Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {stageItems.length === 0 ? (
            <div className="py-12 text-center text-[var(--ink-dim)] font-mono text-xs">
              {t('noSkillItemsForLevel')}
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
                    <span className="text-[9px] font-mono uppercase tracking-wider text-accent block font-semibold">
                      {getSkillItemSection(item, language)}
                    </span>
                    <h5 className="text-xs font-medium text-[var(--ink)] leading-snug">
                      {getSkillItemTitle(item, language)}
                    </h5>
                    <div className="text-[9px] font-mono text-[var(--ink-dim)]">
                      {t('radarAxisCol')}:{' '}
                      {getRadarDimensionLabel(classifySkillItemToRadarDimension(item), language)}
                    </div>
                  </div>

                  {/* Rating Controls */}
                  <div className="flex flex-col items-end gap-2 shrink-0 w-full md:w-auto">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-black/30 border border-[var(--border)] p-1">
                        {[...Array(item.maxPoints + 1)].map((_, val) => (
                          <button
                            key={val}
                            onClick={() => handleScoreChange(item.id, val, item.maxPoints)}
                            className={`w-6 h-6 text-[10px] font-mono font-bold transition cursor-pointer ${
                              currentScore === val
                                ? 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow'
                                : val <= currentScore
                                  ? 'bg-accent-muted text-accent'
                                  : 'bg-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>

                      <div className="text-right w-14">
                        <span className="text-xs font-mono font-bold text-amber-400">
                          {currentScore}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--ink-dim)]">
                          {' '}
                          / {item.maxPoints}
                        </span>
                      </div>
                    </div>

                    {currentScore > 0 && (
                      <textarea
                        value={comments[item.id] ?? ''}
                        onChange={(e) => handleCommentChange(item.id, e.target.value)}
                        placeholder={t('instructorExerciseCommentPlaceholder')}
                        rows={2}
                        className="w-full md:w-72 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)] resize-y min-h-[2.5rem]"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-black/20 flex justify-between items-center">
          <div className="text-xs font-mono text-[var(--ink-dim)]">
            {t('studentLevelAfterSaving')} {projectedLevel}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border)] text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 btn-primary text-xs flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? t('saving') : t('saveRatings')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
