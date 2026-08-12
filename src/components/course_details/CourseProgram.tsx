import React from 'react';
import { Award, BookOpen, Layers } from 'lucide-react';
import { Course } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import type { CourseProgramStep } from './courseEnrichedData';

interface CourseProgramProps {
  course: Course;
  benefits: string[];
  program: CourseProgramStep[];
}

export const CourseProgram: React.FC<CourseProgramProps> = ({ course, benefits, program }) => {
  const { t } = useLanguage();

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <BookOpen className="w-4 h-4 text-sky-500" />
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
            {t('courseOverview')}
          </h3>
        </div>
        <p className="text-sm sm:text-base text-[var(--ink)] leading-relaxed font-sans font-light">
          {course.detailedDescription || course.description}
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <Award className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
            {t('courseMastery')}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {benefits.map((benefit, idx) => (
            <div
              key={idx}
              className="p-4 border border-[var(--border)] bg-black/5 dark:bg-white/5 flex flex-col gap-3 group transition hover:border-[var(--ink)] duration-300"
            >
              <div className="w-8 h-8 rounded-none border border-[var(--border)] flex items-center justify-center font-mono text-xs text-[var(--ink-dim)] bg-transparent">
                0{idx + 1}
              </div>
              <p className="text-xs text-[var(--ink)] leading-relaxed font-sans font-medium">
                {benefit}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <Layers className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
            {t('courseDayByDay')}
          </h3>
        </div>
        <div className="relative border-l border-[var(--border)]/70 pl-6 ml-3 space-y-6 py-1">
          {program.map((step, idx) => (
            <div key={idx} className="relative group">
              <div className="absolute -left-9.5 top-0.5 w-7 h-7 border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center font-mono text-[9px] font-bold text-[var(--ink)] transition group-hover:border-[var(--ink)]">
                {idx + 1}
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-mono uppercase tracking-wider text-sky-500 font-bold">
                  {step.day}
                </span>
                <h4 className="text-sm font-bold text-[var(--ink)]">{step.title}</h4>
                <p className="text-xs text-[var(--ink-dim)] leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};
