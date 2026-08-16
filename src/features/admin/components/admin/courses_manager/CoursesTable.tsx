import React from 'react';
import { Booking, Course, Instructor, UserProfile } from '../../../../../types';
import { type TranslationKey, type Language } from '../../../../../lib/LanguageContext';
import { CourseTableRow } from './CourseTableRow';

interface CoursesTableProps {
  courses: Course[];
  bookings: Booking[];
  usersList: UserProfile[];
  instructors: Instructor[];
  language: Language;
  t: (key: TranslationKey) => string;
  onToggleVisibility: (course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onClone: (course: Course) => void;
  onMove: (course: Course, direction: 'up' | 'down') => void;
}

export const CoursesTable: React.FC<CoursesTableProps> = ({
  courses,
  bookings,
  usersList,
  instructors,
  language,
  t,
  onToggleVisibility,
  onEdit,
  onDelete,
  onClone,
  onMove,
}) => {
  const sortedCourses = [...courses].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 999;
    const orderB = b.order !== undefined ? b.order : 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="overflow-x-auto border border-[var(--border)]">
      <table className="w-full text-left border-collapse font-mono text-[11px]">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-[var(--border)] text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">
            <th className="px-4 py-3 font-bold w-[60px]">{t('courseImageColumn')}</th>
            <th className="px-4 py-3 font-bold">{t('courseTitleColumn')}</th>
            <th className="px-4 py-3 font-bold w-[120px]">{t('durationColumn')}</th>
            <th className="px-4 py-3 font-bold w-[140px]">{t('datesColumn')}</th>
            <th className="px-4 py-3 font-bold w-[100px]">{t('seatsColumn')}</th>
            <th className="px-4 py-3 font-bold w-[80px]">{t('priceColumn')}</th>
            <th className="px-4 py-3 font-bold w-[80px] text-center">{t('orderColumn')}</th>
            <th className="px-4 py-3 font-bold w-[90px] text-right">{t('actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]/40">
          {sortedCourses.map((course, idx) => (
            <CourseTableRow
              key={course.id}
              course={course}
              idx={idx}
              sortedLength={sortedCourses.length}
              instructors={instructors}
              usersList={usersList}
              bookings={bookings}
              language={language}
              t={t}
              onToggleVisibility={onToggleVisibility}
              onEdit={onEdit}
              onDelete={onDelete}
              onClone={onClone}
              onMove={onMove}
            />
          ))}
          {courses.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-8 text-xs text-[var(--ink-dim)]">
                {t('noCoursesFound')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
