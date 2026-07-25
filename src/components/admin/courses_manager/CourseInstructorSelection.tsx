import React from 'react';
import { Instructor } from '../../../types';
import { useLanguage, translateInstructorName } from '../../../lib/LanguageContext';
import { getSpecialtyLabel } from '../scheduleUtils';
import { useCourseForm } from './useCourseForm';

interface CourseInstructorSelectionProps {
  form: ReturnType<typeof useCourseForm>;
  instructors: Instructor[];
}

export const CourseInstructorSelection: React.FC<CourseInstructorSelectionProps> = ({
  form,
  instructors,
}) => {
  const { t, language } = useLanguage();
  const { selectedCourseInstructors, setSelectedCourseInstructors } = form;

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-[var(--ink-dim)] uppercase block font-bold">
        {t('assignedInstructors')}
      </label>
      <div className="grid grid-cols-2 gap-2">
        {instructors.map((ins) => {
          const isSelected = selectedCourseInstructors.includes(ins.id);
          return (
            <button
              key={ins.id}
              type="button"
              onClick={() => {
                if (isSelected) {
                  setSelectedCourseInstructors((prev) => prev.filter((id) => id !== ins.id));
                } else {
                  if (selectedCourseInstructors.length >= 2) {
                    setSelectedCourseInstructors((prev) => [prev[1], ins.id]);
                  } else {
                    setSelectedCourseInstructors((prev) => [...prev, ins.id]);
                  }
                }
              }}
              className={`flex items-center gap-2 p-2 border transition text-left cursor-pointer rounded-none ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] font-bold'
                  : 'border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)]'
              }`}
            >
              <img
                src={ins.avatarUrl}
                referrerPolicy="no-referrer"
                alt={ins.name}
                className={`w-6 h-6 object-cover border shrink-0 ${isSelected ? 'border-[var(--bg)]' : 'border-[var(--border)] grayscale'}`}
              />
              <div className="min-w-0 leading-tight">
                <p className="text-[9px] font-bold truncate">
                  {translateInstructorName(ins.name, language)}
                </p>
                <p
                  className={`text-[8px] truncate ${isSelected ? 'text-[var(--bg)]/80' : 'text-[var(--ink-dim)]'}`}
                >
                  {getSpecialtyLabel(ins.specialty, language)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-[var(--ink-dim)] italic">{t('instructorSelectHint')}</p>
    </div>
  );
};
