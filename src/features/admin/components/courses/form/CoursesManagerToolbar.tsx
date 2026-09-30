import React from 'react';
import { Plus, X } from 'lucide-react';
import { type TranslationKey } from '../../../../../app/providers/LanguageContext';

interface CoursesManagerToolbarProps {
  t: (key: TranslationKey) => string;
  showCourseForm: boolean;
  onToggle: () => void;
  className?: string;
}

export const CoursesManagerToolbar: React.FC<CoursesManagerToolbarProps> = ({
  t,
  showCourseForm,
  onToggle,
  className = 'flex items-center',
}) => (
  <div className={className}>
    <button
      type="button"
      onClick={onToggle}
      className={
        showCourseForm
          ? 'inline-flex items-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--ink)] transition-colors hover:border-[var(--ink)]'
          : 'inline-flex items-center gap-1.5 border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] transition-colors hover:opacity-85'
      }
    >
      {showCourseForm ? (
        <>
          <X className="w-3.5 h-3.5" />
          {t('closeForm')}
        </>
      ) : (
        <>
          <Plus className="w-3.5 h-3.5" />
          {t('addCourse')}
        </>
      )}
    </button>
  </div>
);
