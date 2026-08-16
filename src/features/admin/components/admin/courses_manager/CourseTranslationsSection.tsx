import React from 'react';
import { useCourseForm } from './useCourseForm';

interface CourseTranslationsSectionProps {
  form: ReturnType<typeof useCourseForm>;
}

export const CourseTranslationsSection: React.FC<CourseTranslationsSectionProps> = ({ form }) => {
  const {
    t,
    courseBadge,
    setCourseBadge,
    courseBadgeRu,
    setCourseBadgeRu,
    courseShortDescription,
    setCourseShortDescription,
    courseShortDescriptionRu,
    setCourseShortDescriptionRu,
    courseDetailedDescription,
    setCourseDetailedDescription,
    courseDetailedDescriptionRu,
    setCourseDetailedDescriptionRu,
  } = form;

  return (
    <div className="border-t border-[var(--border)]/40 pt-4 space-y-4">
      <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block">
        {t('badgeDescriptionsSection')}
      </span>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] block">{t('cardBadgeEn')}</label>
          <input
            type="text"
            value={courseBadge}
            onChange={(e) => setCourseBadge(e.target.value)}
            placeholder="e.g. PRO or https://example.com/badge.png"
            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] block">{t('cardBadgeRu')}</label>
          <input
            type="text"
            value={courseBadgeRu}
            onChange={(e) => setCourseBadgeRu(e.target.value)}
            placeholder="напр. ПРО или https://example.com/badge.png"
            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs"
          />
        </div>
      </div>

      {/* Short Descriptions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] block">{t('shortDescEnCard')}</label>
          <textarea
            rows={2}
            value={courseShortDescription}
            onChange={(e) => setCourseShortDescription(e.target.value)}
            placeholder="Short catchy summary..."
            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] block">{t('shortDescRuCard')}</label>
          <textarea
            rows={2}
            value={courseShortDescriptionRu}
            onChange={(e) => setCourseShortDescriptionRu(e.target.value)}
            placeholder="Краткое описание на русском..."
            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
          />
        </div>
      </div>

      {/* Detailed Descriptions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] block">
            {t('detailedDescEnModal')}
          </label>
          <textarea
            rows={3}
            value={courseDetailedDescription}
            onChange={(e) => setCourseDetailedDescription(e.target.value)}
            placeholder="Full curriculum details..."
            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] block">
            {t('detailedDescRuModal')}
          </label>
          <textarea
            rows={3}
            value={courseDetailedDescriptionRu}
            onChange={(e) => setCourseDetailedDescriptionRu(e.target.value)}
            placeholder="Подробное описание на русском..."
            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
          />
        </div>
      </div>
    </div>
  );
};
