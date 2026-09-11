import React from 'react';
import { createPortal } from 'react-dom';
import { Plus, Save, Trash2, X } from 'lucide-react';
import {
  PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX,
  PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH,
} from '@ski-academy/shared-domain';
import { type TranslationKey } from '../../../app/providers/LanguageContext';
import { useAuthStore } from '../../auth/authStore';
import { ActionButton } from '../../../ui/ActionButton';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import { createParticipantLessonFeedbackItemId } from '../../participant-lesson-feedback';
import { useInstructorParticipantLessonFeedbackEditor } from '../useInstructorParticipantLessonFeedbackEditor';

interface InstructorParticipantLessonFeedbackEditorProps {
  participantId: string;
  lessonBookingId: string;
  studentName: string;
  t: (key: TranslationKey) => string;
  onClose: () => void;
}

export const InstructorParticipantLessonFeedbackEditor: React.FC<
  InstructorParticipantLessonFeedbackEditorProps
> = ({ participantId, lessonBookingId, studentName, t, onClose }) => {
  const accountId = useAuthStore((state) => state.firebaseUser?.uid);
  const editor = useInstructorParticipantLessonFeedbackEditor({
    participantId,
    lessonBookingId,
    accountId,
  });

  const addItem = () => {
    if (editor.savePending || editor.drafts.length >= PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX) {
      return;
    }
    editor.setDrafts((prev) => [
      ...prev,
      { itemId: createParticipantLessonFeedbackItemId(), text: '' },
    ]);
  };

  const updateText = (itemId: string, text: string) => {
    editor.setDrafts((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, text } : item))
    );
  };

  const removeItem = (itemId: string) => {
    if (editor.savePending) return;
    editor.setDrafts((prev) => prev.filter((item) => item.itemId !== itemId));
  };

  const titleId = `instructor-lesson-feedback-title-${participantId}`;
  const canEdit = editor.loadState === 'ready' && !editor.savePending;

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <BodyScrollLock />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ui-modal w-full max-w-lg max-h-[80vh] my-auto flex flex-col shadow-2xl overflow-hidden rounded-xs bg-[var(--card-bg)] text-[var(--ink)] border border-slate-200/70 dark:border-slate-800/70 relative"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200/70 dark:border-slate-800/70">
          <div>
            <h3 id={titleId} className="text-sm font-mono font-bold text-[var(--ink)]">
              {t('instructorRecommendations')}: {studentName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
            aria-label={t('instructorRecommendations')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {editor.loadState === 'loading' ? (
            <p className="text-xs font-mono text-[var(--ink-dim)]">{t('loading')}</p>
          ) : null}

          {editor.loadState === 'error' ? (
            <div className="space-y-2">
              <p className="text-xs font-mono text-rose-600">{t('requestFailed')}</p>
              {editor.loadError ? (
                <p className="text-[10px] font-mono text-[var(--ink-dim)]">{editor.loadError}</p>
              ) : null}
              <ActionButton type="button" size="sm" onClick={() => void editor.retryLoad()}>
                {t('retry')}
              </ActionButton>
            </div>
          ) : null}

          {editor.loadState === 'ready' ? (
            <div className="space-y-2">
              {editor.drafts.map((item, index) => (
                <div key={item.itemId} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--ink-dim)] w-4 shrink-0">
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    value={item.text}
                    onChange={(event) => updateText(item.itemId, event.target.value)}
                    disabled={!canEdit}
                    maxLength={PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH}
                    placeholder={t('instructorRecommendationPlaceholder')}
                    className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 rounded-xs text-[var(--ink)] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.itemId)}
                    disabled={!canEdit}
                    className="p-1 text-rose-500 hover:text-rose-600 transition disabled:opacity-50"
                    aria-label={t('instructorRemoveRecommendation')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={addItem}
                  disabled={
                    !canEdit || editor.drafts.length >= PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase tracking-wider border border-slate-200/80 dark:border-slate-800/80 rounded-xs text-[var(--ink-dim)] hover:text-[var(--ink)] transition disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  {t('instructorAddRecommendation')}
                </button>
                <ActionButton
                  type="button"
                  unstyled
                  pending={editor.savePending}
                  pendingLabel={t('saving')}
                  onClick={() => void editor.save()}
                  disabled={editor.loadState !== 'ready'}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase tracking-wider bg-[var(--ink)] text-[var(--bg)] rounded-xs font-bold transition disabled:opacity-60"
                >
                  <Save className="w-3 h-3" />
                  {t('saveChanges')}
                </ActionButton>
              </div>

              {editor.saveError ? (
                <p className="text-xs font-mono text-rose-600">{editor.saveError}</p>
              ) : null}
              {editor.saveSuccess ? (
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-300">
                  {t('instructorRecommendationsSaved')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};
