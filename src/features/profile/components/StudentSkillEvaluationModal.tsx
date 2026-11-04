import { SkillRadarChart } from '../../student-cabinet/components/student/SkillRadarChart';
import { formatSkillScore } from '../../../lib/i18n/skillScore';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import {
  SkillConfig,
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
  classifySkillItemToRadarDimension,
  getSkillItemTitle,
  getSkillItemSection,
  getRadarDimensionLabel,
} from '../../../domain/achievements';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { Save, Award, CheckCircle2, AlertCircle } from 'lucide-react';
import { AdminModal } from '../../admin/components/AdminModal';
import { ActionButton } from '../../../ui/ActionButton';

const EMPTY_SCORES: Record<string, number> = {};
const EMPTY_COMMENTS: Record<string, string> = {};

interface StudentSkillEvaluationModalProps {
  isOpen: boolean;
  readOnly?: boolean;
  onClose: () => void;
  participantId: string;
  studentName: string;
  studentLevel: number;
  existingScores?: Record<string, number>;
  existingComments?: Record<string, string>;
  skillConfig?: SkillConfig;
  onReload?: () => Promise<void>;
  onSaveScores: (
    participantId: string,
    updatedScores: Record<string, number>,
    calculatedLevel: number,
    updatedComments: Record<string, string>,
    correctionReason?: string
  ) => Promise<void>;
}

export const StudentSkillEvaluationModal: React.FC<StudentSkillEvaluationModalProps> = ({
  isOpen,
  readOnly = false,
  onClose,
  participantId,
  studentName,
  studentLevel,
  existingScores = EMPTY_SCORES,
  existingComments = EMPTY_COMMENTS,
  skillConfig = DEFAULT_SKILL_CONFIG,
  onSaveScores,
  onReload,
}) => {
  const { t, language } = useLanguage();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [activeTargetLevel, setActiveTargetLevel] = useState<number>(
    Math.min(studentLevel || 1, 3)
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);
  const conflictCopy =
    language === 'ru'
      ? {
          message:
            'Оценки или комментарии этого участника были изменены другим инструктором. Ваши изменения не сохранены. Обновите данные и проверьте их перед повторным сохранением',
          refresh: 'Загрузить актуальные данные',
          replace:
            'Ваш черновик сохранён в форме. Загрузка актуальных данных заменит несохранённые изменения.',
        }
      : {
          message:
            "This participant's scores or comments were changed by another instructor. Your changes were not saved. Refresh the data and review it before saving again.",
          refresh: 'Load current data',
          replace:
            'Your draft remains in the form. Loading current data will replace your unsaved changes.',
        };

  useEffect(() => {
    if (isOpen) {
      setCorrectionReason('');
      setSaveError('');
      setConflict(false);
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

  const [correctionReason, setCorrectionReason] = useState('');
  const correcting = Object.entries(existingScores).some(([id, score]) => scores[id] !== score);

  if (!isOpen) return null;

  const handleScoreChange = (itemId: string, val: number, maxPoints: number) => {
    const safeVal = Math.max(0, Math.min(maxPoints, val));
    setScores((prev) => ({
      ...prev,
      [itemId]: safeVal,
    }));
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
      delete updated[item.id];
      delete clearedComments[item.id];
    });
    setScores(updated);
    setComments(clearedComments);
  };

  const handleSave = async () => {
    if (readOnly || busy.current || conflict) return;
    busy.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      await onSaveScores(
        participantId,
        scores,
        studentLevel,
        pruneComments(comments),
        correcting ? correctionReason.trim() : undefined
      );
      onClose();
    } catch (error) {
      const stale =
        error instanceof CanonicalCommandClientError &&
        (error.code === 'stale_version' || error.code === 'concurrent_modification');
      setConflict(stale);
      setSaveError(stale ? '' : error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
      busy.current = false;
    }
  };

  const handleReload = async () => {
    if (!onReload || busy.current) return;
    busy.current = true;
    setIsReloading(true);
    try {
      await onReload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      setIsReloading(false);
    }
  };

  return (
    <AdminModal
      width="2xl"
      onClose={onClose}
      closeLabel={t('cancel')}
      closeDisabled={isSaving || isReloading}
      title={
        <span className="flex items-center gap-3">
          <span className="p-2 bg-accent-muted border border-accent/40 text-accent rounded-lg">
            <Award className="w-5 h-5" />
          </span>
          <span>
            <span className="block type-section-title text-[var(--ink)]">
              {t('studentSkillEvaluation')}: {studentName}
            </span>
            <span className="block type-caption text-[var(--ink-dim)] uppercase">
              {t('instructorCurrentLevel')}: {studentLevel}
            </span>
          </span>
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap justify-between items-center gap-3">
          <span className="type-caption text-[var(--ink-dim)]">
            {t('instructorCurrentLevel')}: {studentLevel}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving || isReloading}
              className="px-4 py-2 border border-[var(--border)] type-button uppercase text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer"
            >
              {t('cancel')}
            </button>
            {!readOnly && (
              <ActionButton
                onClick={handleSave}
                disabled={conflict || isReloading || (correcting && !correctionReason.trim())}
                pending={isSaving}
                pendingLabel={t('saving')}
                className="btn-primary px-5 py-2 type-button shadow-lg"
              >
                <Save className="w-4 h-4" />
                {t('saveRatings')}
              </ActionButton>
            )}
          </div>
        </div>
      }
    >
      {readOnly && (
        <p role="status" className="p-4 type-compact">
          {t('instructorProgressReadOnly')}
        </p>
      )}
      <SkillRadarChart
        userProfile={{
          level: studentLevel,
          skillScores: existingScores,
          skillComments: existingComments,
        }}
        skillConfig={skillConfig}
        compact
        embed
      />
      {/* Level Transition Tabs */}
      <div className="flex overflow-x-auto border-b border-[var(--border)] bg-black/10 px-4 pt-3 gap-2">
        <button
          onClick={() => setActiveTargetLevel(1)}
          className={`shrink-0 sm:shrink max-w-full px-4 py-2 type-button uppercase border-b-2 transition cursor-pointer ${
            activeTargetLevel === 1
              ? 'border-accent font-bold text-accent bg-black/20'
              : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          Beginner → Carve ({t('levelStage')} 1 → 2)
        </button>
        <button
          onClick={() => setActiveTargetLevel(2)}
          className={`shrink-0 sm:shrink max-w-full px-4 py-2 type-button uppercase border-b-2 transition cursor-pointer ${
            activeTargetLevel === 2
              ? 'border-accent font-bold text-accent bg-black/20'
              : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          Carve → Performance ({t('levelStage')} 2 → 3)
        </button>
        <button
          onClick={() => setActiveTargetLevel(3)}
          className={`shrink-0 sm:shrink max-w-full px-4 py-2 type-button uppercase border-b-2 transition cursor-pointer ${
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
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('earnedPoints')}
          </span>
          <span className="type-card-title text-[var(--ink)]">
            {progress.targetEarnedPoints} /{' '}
            <span className="type-compact text-[var(--ink-dim)]">{progress.targetMaxPoints}</span>
          </span>
        </div>

        <div>
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('requiredToLevelUp')}
          </span>
          <span className="type-card-title text-amber-400">
            {progress.targetRequiredPoints}{' '}
            <span className="type-caption text-[var(--ink-dim)]">({passPercentage}%)</span>
          </span>
        </div>

        <div className="col-span-2 md:col-span-1">
          <span className="type-caption text-[var(--ink-dim)] uppercase block">
            {t('advancementStatus')}
          </span>
          {progress.targetMaxPoints > 0 &&
          progress.targetEarnedPoints >= progress.targetRequiredPoints ? (
            <span className="inline-flex items-center gap-1 type-caption font-medium text-emerald-400 uppercase">
              <CheckCircle2 className="w-4 h-4" />
              {t('readyToAdvance')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 type-caption font-medium text-amber-400 uppercase">
              <AlertCircle className="w-4 h-4" />
              {progress.targetRequiredPoints - progress.targetEarnedPoints} {t('pointsLeft')}
            </span>
          )}
        </div>

        <div className="col-span-2 md:col-span-1 flex flex-wrap items-center md:justify-end gap-2">
          <button
            disabled={readOnly || isSaving || isReloading}
            onClick={handleFillAllMax}
            className="px-2.5 py-1 border border-accent/40 text-accent hover:bg-accent-muted type-button uppercase transition cursor-pointer"
          >
            {t('fillMax')}
          </button>
          <button
            disabled={readOnly || isSaving || isReloading}
            onClick={handleClearStage}
            className="px-2.5 py-1 border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)] type-button uppercase transition cursor-pointer"
          >
            {t('clear')}
          </button>
        </div>
      </div>

      {/* Exercise Items List */}
      <div className="p-4 space-y-3">
        {stageItems.length === 0 ? (
          <div className="py-12 text-center text-[var(--ink-dim)] type-caption">
            {t('noSkillItemsForLevel')}
          </div>
        ) : (
          stageItems.map((item) => {
            const currentScore = scores[item.id] ?? 0;
            const hasScore = Object.hasOwn(scores, item.id);
            return (
              <div
                key={item.id}
                className="p-3 bg-black/10 border border-[var(--border)]/60 hover:border-[var(--border)] transition flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1 flex-1">
                  <span className="type-caption uppercase text-accent block font-medium">
                    {getSkillItemSection(item, language)}
                  </span>
                  <h5 className="type-compact text-[var(--ink)] font-medium">
                    {getSkillItemTitle(item, language)}
                  </h5>
                  <div className="type-caption text-[var(--ink-dim)]">
                    {t('radarAxisCol')}:{' '}
                    {getRadarDimensionLabel(classifySkillItemToRadarDimension(item), language)}
                  </div>
                </div>

                {/* Rating Controls */}
                <div className="flex flex-col items-end gap-2 shrink-0 min-w-0 w-full md:w-80">
                  <div className="flex flex-wrap w-full items-center justify-end gap-3">
                    <div className="flex flex-wrap items-center gap-1.5 bg-black/30 border border-[var(--border)] p-1">
                      {[...Array(item.maxPoints + 1)].map((_, val) => (
                        <button
                          key={val}
                          disabled={readOnly || isSaving || isReloading}
                          aria-label={`${getSkillItemTitle(item, language)}: ${val} / ${item.maxPoints}`}
                          aria-pressed={hasScore && currentScore === val}
                          onClick={() => handleScoreChange(item.id, val, item.maxPoints)}
                          className={`w-6 h-6 type-button transition cursor-pointer ${
                            hasScore && currentScore === val
                              ? 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow'
                              : hasScore && val <= currentScore
                                ? 'bg-accent-muted text-accent'
                                : 'bg-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>

                    <div className="text-right min-w-0">
                      <span className="type-caption font-medium text-amber-400">
                        {formatSkillScore(
                          { hasScore, earned: currentScore, maxPoints: item.maxPoints },
                          language
                        )}
                      </span>
                    </div>
                  </div>

                  <textarea
                    readOnly={readOnly || isSaving || isReloading}
                    value={comments[item.id] ?? ''}
                    onChange={(e) => handleCommentChange(item.id, e.target.value)}
                    placeholder={t('instructorExerciseCommentPlaceholder')}
                    rows={2}
                    className="w-full md:w-72 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 type-body text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)] resize-y min-h-[2.5rem]"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {!readOnly && correcting && (
        <label className="p-4 type-caption">
          {language === 'ru' ? 'Причина исправления оценок' : 'Reason for correcting scores'}
          <textarea
            value={correctionReason}
            readOnly={isSaving || isReloading}
            maxLength={2000}
            onChange={(e) => setCorrectionReason(e.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--card-bg)] p-2"
          />
        </label>
      )}
      {(saveError || conflict) && (
        <div role="alert" className="p-4 text-red-600 dark:text-red-300 space-y-3">
          {conflict && <p>{conflictCopy.message}</p>}
          {saveError}
          {conflict && onReload && (
            <>
              <p className="type-compact text-[var(--ink-dim)]">{conflictCopy.replace}</p>
              <button
                type="button"
                onClick={() => void handleReload()}
                disabled={isSaving || isReloading}
                className="btn-primary px-4 py-2 type-button"
              >
                {isReloading ? t('loading') : conflictCopy.refresh}
              </button>
            </>
          )}
        </div>
      )}
    </AdminModal>
  );
};
