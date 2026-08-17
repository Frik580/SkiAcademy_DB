import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { LessonRecommendation } from '../../../types';
import {
  createRecommendationId,
  sanitizeRecommendations,
} from '../../../lib/lessonRecommendations';
import { type TranslationKey } from '../../../lib/LanguageContext';

interface InstructorRecommendationsEditorProps {
  bookingId: string;
  initialItems: LessonRecommendation[];
  canEdit: boolean;
  t: (key: TranslationKey) => string;
  onSave: (bookingId: string, items: LessonRecommendation[]) => Promise<void>;
}

export const InstructorRecommendationsEditor: React.FC<InstructorRecommendationsEditorProps> = ({
  bookingId,
  initialItems,
  canEdit,
  t,
  onSave,
}) => {
  const [items, setItems] = useState<LessonRecommendation[]>(initialItems);
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(initialItems.length > 0);

  useEffect(() => {
    setItems(initialItems);
    if (initialItems.length > 0) setExpanded(true);
  }, [bookingId, initialItems]);

  const addItem = () => {
    setItems((prev) => [...prev, { id: createRecommendationId(), text: '' }]);
    setExpanded(true);
  };

  const updateText = (id: string, text: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    const cleaned = sanitizeRecommendations(items);
    setIsSaving(true);
    try {
      await onSave(bookingId, cleaned);
      setItems(cleaned);
    } finally {
      setIsSaving(false);
    }
  };

  if (!canEdit && items.length === 0) return null;

  return (
    <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-3 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] font-bold hover:text-[var(--ink)] transition"
      >
        {t('instructorRecommendations')} ({items.length})
      </button>

      {expanded && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[var(--ink-dim)] w-4 shrink-0">
                {index + 1}.
              </span>
              <input
                type="text"
                value={item.text}
                onChange={(e) => updateText(item.id, e.target.value)}
                disabled={!canEdit || isSaving}
                placeholder={t('instructorRecommendationPlaceholder')}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 rounded-xs text-[var(--ink)] disabled:opacity-60"
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={isSaving}
                  className="p-1 text-rose-500 hover:text-rose-600 transition disabled:opacity-50"
                  aria-label={t('deleteSlide')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={addItem}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase tracking-wider border border-slate-200/80 dark:border-slate-800/80 rounded-xs text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
              >
                <Plus className="w-3 h-3" />
                {t('instructorAddRecommendation')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase tracking-wider bg-[var(--ink)] text-[var(--bg)] rounded-xs font-bold transition disabled:opacity-60"
              >
                <Save className="w-3 h-3" />
                {isSaving ? t('saving') : t('saveChanges')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
