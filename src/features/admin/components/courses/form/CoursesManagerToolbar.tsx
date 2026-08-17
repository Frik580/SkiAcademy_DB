import React from 'react';
import { Plus, X } from 'lucide-react';
import { type TranslationKey } from '../../../../../app/providers/LanguageContext';

interface CoursesManagerToolbarProps {
  t: (key: TranslationKey) => string;
  showCourseForm: boolean;
  onToggle: () => void;
}

export const CoursesManagerToolbar: React.FC<CoursesManagerToolbarProps> = ({
  t,
  showCourseForm,
  onToggle,
}) => (
  <div className="flex items-center justify-end border-b border-[var(--border)] pb-3">
    <button
      onClick={onToggle}
      className="py-1.5 px-3 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer flex items-center gap-1.5"
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
