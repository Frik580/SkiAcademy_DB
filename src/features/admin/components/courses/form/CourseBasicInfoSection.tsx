import React from 'react';
import { useCourseForm } from './useCourseForm';
import { CourseBackgroundImageField } from '../CourseBackgroundImageField';
import { CourseDateRangePicker } from '../CourseDateRangePicker';
import { getCourseLevelCardClass } from '../../../../../lib/courseLevelStyles';

interface CourseBasicInfoSectionProps {
  form: ReturnType<typeof useCourseForm>;
}

export const CourseBasicInfoSection: React.FC<CourseBasicInfoSectionProps> = ({ form }) => {
  const {
    t,
    courseTitle,
    setCourseTitle,
    courseTitleRu,
    setCourseTitleRu,
    courseLevel,
    setCourseLevel,
    courseTotalSeats,
    setCourseTotalSeats,
    coursePrice,
    setCoursePrice,
    courseBgImageUrl,
    setCourseBgImageUrl,
    courseDateRange,
  } = form;

  return (
    <div className="space-y-4">
      {/* Title EN / RU */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
            {t('courseTitleFieldEn')}
          </label>
          <input
            type="text"
            required
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
            placeholder={t('courseTitlePlaceholder')}
            className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
            {t('courseTitleFieldRu')}
          </label>
          <input
            type="text"
            required
            value={courseTitleRu}
            onChange={(e) => setCourseTitleRu(e.target.value)}
            placeholder={t('courseTitlePlaceholderRu')}
            className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
          {t('durationDescription')}
        </label>
        <input
          type="text"
          required
          value={form.courseDuration}
          onChange={(e) => form.setCourseDuration(e.target.value)}
          placeholder={t('durationPlaceholder')}
          className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
        />
      </div>

      {/* Dates & Calendar Selection */}
      <CourseDateRangePicker dateRange={courseDateRange} />

      {/* Course Level (Difficulty) */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
          {t('courseDifficultyLevel')}
        </label>
        <select
          value={courseLevel}
          onChange={(e) => setCourseLevel(e.target.value as any)}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono"
        >
          <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
            {t('selectLevelNone')}
          </option>
          <option
            value="beginner"
            className={`bg-[var(--bg)] font-bold ${getCourseLevelCardClass('beginner')}`}
          >
            {t('courseLevelBeginner')}
          </option>
          <option
            value="intermediate"
            className={`bg-[var(--bg)] font-bold ${getCourseLevelCardClass('intermediate')}`}
          >
            {t('courseLevelIntermediate')}
          </option>
          <option
            value="advanced"
            className={`bg-[var(--bg)] font-bold ${getCourseLevelCardClass('advanced')}`}
          >
            {t('courseLevelAdvanced')}
          </option>
          <option
            value="expert"
            className={`bg-[var(--bg)] font-bold ${getCourseLevelCardClass('expert')}`}
          >
            {t('courseLevelExpert')}
          </option>
        </select>
      </div>

      {/* Grid for Seats & Price (USD / KZT) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
            {t('totalSeats')}
          </label>
          <input
            type="number"
            min="1"
            required
            value={courseTotalSeats}
            onChange={(e) => setCourseTotalSeats(Number(e.target.value))}
            className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
            {t('priceUsd')} ($ USD)
          </label>
          <input
            type="number"
            min="0"
            required
            value={coursePrice}
            onChange={(e) => setCoursePrice(Number(e.target.value))}
            className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
            {t('priceKztLabel') || 'Стоимость (₸ KZT)'}
          </label>
          <input
            type="number"
            min="0"
            value={form.coursePriceKZT}
            onChange={(e) => form.setCoursePriceKZT(e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>
      </div>

      {/* Background Image URL & File Upload */}
      <CourseBackgroundImageField
        value={courseBgImageUrl}
        onChange={setCourseBgImageUrl}
        courseId={form.editingCourse?.id}
      />
    </div>
  );
};
