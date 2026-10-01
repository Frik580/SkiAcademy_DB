import React from 'react';
import { Calendar } from 'lucide-react';
import { useLanguage } from '../../app/providers/LanguageContext';
import type { CourseEnrollmentScheduleLine } from './courseEnrollmentListProjection';

export const CourseEnrollmentScheduleList: React.FC<{
  readonly lines: readonly CourseEnrollmentScheduleLine[];
}> = ({ lines }) => {
  const { t } = useLanguage();
  if (lines.length === 0) return null;

  return (
    <section className="space-y-3" data-testid="course-enrollment-schedule">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
        <Calendar className="w-4 h-4 text-violet-500" />
        <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
          {t('scCourseSchedule')}
        </h3>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.courseDayId} className="text-sm text-[var(--ink)]">
            {line.label}
          </li>
        ))}
      </ul>
    </section>
  );
};
