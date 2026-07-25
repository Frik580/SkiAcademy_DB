import React from 'react';
import { useCourseForm } from './useCourseForm';

interface CourseRichDetailsSectionProps {
  form: ReturnType<typeof useCourseForm>;
}

export const CourseRichDetailsSection: React.FC<CourseRichDetailsSectionProps> = ({ form }) => {
  const {
    t,
    courseVideoUrl,
    setCourseVideoUrl,
    courseBenefitsEn,
    setCourseBenefitsEn,
    courseBenefitsRu,
    setCourseBenefitsRu,
    courseProgramDays,
    setCourseProgramDays,
    courseFaq1,
    setCourseFaq1,
    courseFaq2,
    setCourseFaq2,
    courseFaq3,
    setCourseFaq3,
    courseGalleryPhotos,
    setCourseGalleryPhotos,
  } = form;

  const updateProgramDay = (
    idx: number,
    field: keyof (typeof courseProgramDays)[0],
    value: string
  ) => {
    const updated = [...courseProgramDays];
    updated[idx] = { ...updated[idx], [field]: value };
    setCourseProgramDays(updated);
  };

  const updateFaq = (
    faq: typeof courseFaq1,
    setFaq: (value: typeof courseFaq1) => void,
    field: keyof typeof courseFaq1,
    value: string
  ) => {
    setFaq({ ...faq, [field]: value });
  };

  return (
    <div className="space-y-4 p-3 border border-[var(--border)] bg-black/5 dark:bg-white/5 animate-fade-in font-mono text-xs">
      <p className="text-[9px] text-[var(--ink-dim)] uppercase tracking-widest font-bold border-b border-[var(--border)] pb-1.5 mb-2">
        {t('courseDetailsOverrides')}
      </p>

      {/* Video URL */}
      <div className="space-y-1">
        <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
          {t('promoVideoUrl')}
        </label>
        <input
          type="url"
          value={courseVideoUrl}
          onChange={(e) => setCourseVideoUrl(e.target.value)}
          placeholder="https://player.vimeo.com/external/...mp4 or other direct stream URL"
          className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
        />
      </div>

      {/* Benefits Section */}
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
            {t('benefitsEn')}
          </label>
          <textarea
            rows={3}
            value={courseBenefitsEn}
            onChange={(e) => setCourseBenefitsEn(e.target.value)}
            placeholder="e.g.&#10;Professional video analysis&#10;Custom ski tuning advice&#10;Skipass inclusion"
            className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
            {t('benefitsRu')}
          </label>
          <textarea
            rows={3}
            value={courseBenefitsRu}
            onChange={(e) => setCourseBenefitsRu(e.target.value)}
            placeholder="напр.&#10;Профессиональный видеоанализ&#10;Советы по подготовке лыж&#10;Скипасс включен в стоимость"
            className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
          />
        </div>
      </div>

      {/* Program Section */}
      <div className="border-t border-[var(--border)] pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold">
            {t('dayByDayProgram')}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (courseProgramDays.length > 1) {
                  setCourseProgramDays(courseProgramDays.slice(0, -1));
                }
              }}
              disabled={courseProgramDays.length <= 1}
              className="px-2 py-1 border border-[var(--border)] text-[9px] uppercase tracking-wider hover:border-[var(--ink)] disabled:opacity-50 disabled:cursor-not-allowed font-mono text-[var(--ink)] bg-transparent rounded-none transition cursor-pointer"
            >
              {t('removeDay')}
            </button>
            <button
              type="button"
              onClick={() => {
                setCourseProgramDays([
                  ...courseProgramDays,
                  { titleEn: '', descEn: '', titleRu: '', descRu: '' },
                ]);
              }}
              className="px-2 py-1 border border-[var(--border)] text-[9px] uppercase tracking-wider hover:border-[var(--ink)] font-mono text-[var(--ink)] bg-transparent rounded-none transition cursor-pointer"
            >
              {t('addDay')}
            </button>
          </div>
        </div>

        {courseProgramDays.map((day, idx) => (
          <div key={idx} className="space-y-2 border-l border-[var(--border)] pl-2.5">
            <p className="text-[9px] font-bold uppercase text-[var(--ink-dim)]">
              {`${t('dayPrefix')} ${idx + 1}`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={day.titleEn}
                onChange={(e) => updateProgramDay(idx, 'titleEn', e.target.value)}
                placeholder="Title (EN)"
                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
              />
              <input
                type="text"
                value={day.titleRu}
                onChange={(e) => updateProgramDay(idx, 'titleRu', e.target.value)}
                placeholder="Название (RU)"
                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <textarea
                rows={2}
                value={day.descEn}
                onChange={(e) => updateProgramDay(idx, 'descEn', e.target.value)}
                placeholder="Description (EN)"
                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
              />
              <textarea
                rows={2}
                value={day.descRu}
                onChange={(e) => updateProgramDay(idx, 'descRu', e.target.value)}
                placeholder="Описание (RU)"
                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      {/* FAQ 1-3 Section */}
      <div className="border-t border-[var(--border)] pt-3 space-y-3">
        <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block">
          {t('faqSection')}
        </span>

        {[courseFaq1, courseFaq2, courseFaq3].map((faq, faqIdx) => {
          const setFaq = [setCourseFaq1, setCourseFaq2, setCourseFaq3][faqIdx];
          const labelKey = faqIdx === 0 ? 'faq1' : faqIdx === 1 ? 'faq2' : 'faq3';
          return (
            <div key={faqIdx} className="space-y-2 border-l border-[var(--border)] pl-2.5">
              <p className="text-[9px] font-bold uppercase text-[var(--ink-dim)]">{t(labelKey)}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={faq.qEn}
                  onChange={(e) => updateFaq(faq, setFaq, 'qEn', e.target.value)}
                  placeholder="Question (EN)"
                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                />
                <input
                  type="text"
                  value={faq.qRu}
                  onChange={(e) => updateFaq(faq, setFaq, 'qRu', e.target.value)}
                  placeholder="Вопрос (RU)"
                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <textarea
                  rows={2}
                  value={faq.aEn}
                  onChange={(e) => updateFaq(faq, setFaq, 'aEn', e.target.value)}
                  placeholder="Answer (EN)"
                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                />
                <textarea
                  rows={2}
                  value={faq.aRu}
                  onChange={(e) => updateFaq(faq, setFaq, 'aRu', e.target.value)}
                  placeholder="Ответ (RU)"
                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Gallery Photos Section */}
      <div className="border-t border-[var(--border)] pt-3 space-y-1">
        <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
          {t('galleryPhotos')}
        </label>
        <textarea
          rows={3}
          value={courseGalleryPhotos}
          onChange={(e) => setCourseGalleryPhotos(e.target.value)}
          placeholder="https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800"
          className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
        />
      </div>
    </div>
  );
};
