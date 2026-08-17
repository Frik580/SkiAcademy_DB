import React from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { STUDENT_TAB_BAR_HEIGHT } from './StudentCabinetUI';

interface StudentBookNextFabProps {
  onClick: () => void;
}

/** Viewport-fixed circular FAB; portaled to escape transformed ancestors. */
export const StudentBookNextFab: React.FC<StudentBookNextFabProps> = ({ onClick }) => {
  const { t } = useLanguage();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <button
      type="button"
      onClick={onClick}
      className="student-book-fab fixed z-[60] right-4 sm:right-6"
      style={{
        bottom: `calc(${STUDENT_TAB_BAR_HEIGHT} + env(safe-area-inset-bottom, 0px) + 2.25rem)`,
      }}
      aria-label={t('bookLesson')}
      title={t('bookLesson')}
    >
      <CalendarPlus className="w-6 h-6 shrink-0" strokeWidth={2.25} aria-hidden />
    </button>,
    document.body
  );
};
