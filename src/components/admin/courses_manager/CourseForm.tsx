import React from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { Instructor } from '../../../types';
import { ToggleSwitch } from '../../ToggleSwitch';
import { useCourseForm } from './useCourseForm';
import { CourseBasicInfoSection } from './CourseBasicInfoSection';
import { CourseTranslationsSection } from './CourseTranslationsSection';
import { CourseInstructorSelection } from './CourseInstructorSelection';
import { CourseRichDetailsSection } from './CourseRichDetailsSection';

interface CourseFormProps {
  form: ReturnType<typeof useCourseForm>;
  instructors: Instructor[];
}

export const CourseForm: React.FC<CourseFormProps> = ({ form, instructors }) => {
  const {
    t,
    showCourseForm,
    editingCourse,
    resetCourseForm,
    handleCourseSubmit,
    isSubmittingCourse,
    showRichCourseDetails,
    setShowRichCourseDetails,
    courseIsHidden,
    setCourseIsHidden,
  } = form;

  if (!showCourseForm) return null;

  return (
    <div className="lg:col-span-4 border border-[var(--border)] p-6 bg-transparent space-y-4 animate-fade-in shrink-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <h4 className="font-serif text-lg font-light text-[var(--ink)]">
          {editingCourse ? t('editCourseForm') : t('newCourseForm')}
        </h4>
        <button
          onClick={resetCourseForm}
          className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleCourseSubmit} className="space-y-4 font-mono text-xs">
        <CourseBasicInfoSection form={form} />
        <CourseTranslationsSection form={form} />

        <CourseInstructorSelection form={form} instructors={instructors} />

        {/* Rich Details Trigger Button */}
        <div className="pt-2 border-t border-[var(--border)]/40">
          <button
            type="button"
            onClick={() => setShowRichCourseDetails(!showRichCourseDetails)}
            className="w-full py-2 px-3 border border-[var(--border)] hover:border-[var(--ink)] bg-black/5 dark:bg-white/5 text-[var(--ink)] font-mono text-[10px] uppercase tracking-wider flex items-center justify-between transition rounded-none cursor-pointer"
          >
            <span>{t('editCoursePageDetails')}</span>
            <span className="font-bold text-xs">{showRichCourseDetails ? '−' : '+'}</span>
          </button>
        </div>

        {/* Collapsible Rich Details Section */}
        {showRichCourseDetails && <CourseRichDetailsSection form={form} />}

        {/* Visibility Toggle */}
        <div className="border border-[var(--border)] p-2.5 bg-black/5 dark:bg-white/5 transition">
          <ToggleSwitch
            checked={courseIsHidden}
            onChange={(checked) => setCourseIsHidden(checked)}
            label={t('hideCourseFromUsers')}
            activeColor="bg-rose-600"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmittingCourse}
          className="w-full py-2.5 px-4 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
        >
          {isSubmittingCourse ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4" />
              {editingCourse ? t('updateCourse') : t('createCourse')}
            </>
          )}
        </button>
      </form>
    </div>
  );
};
