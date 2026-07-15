import React from 'react';
import { Instructor } from '../types';
import { Star, Globe } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

interface InstructorCardProps {
  instructor: Instructor;
  onBook: (instructor: Instructor) => void;
  onViewReviews?: (instructor: Instructor) => void;
}

export const InstructorCard: React.FC<InstructorCardProps> = ({ instructor, onBook, onViewReviews }) => {
  const { t, language } = useLanguage();

  const getSpecialtyLabel = (spec: Instructor['specialty']) => {
    if (language === 'ru') {
      switch (spec) {
        case 'ski': return 'Лыжи';
        case 'snowboard': return 'Сноуборд';
        case 'both': return 'Лыжи и Сноуборд';
      }
    }
    switch (spec) {
      case 'ski': return 'Ski';
      case 'snowboard': return 'Snowboard';
      case 'both': return 'Ski & Board';
    }
  };

  const getLanguageLabel = (lang: string) => {
    if (language === 'ru') {
      const mapping: { [key: string]: string } = {
        'English': 'Англ',
        'German': 'Нем',
        'French': 'Франц',
        'Russian': 'Рус',
        'Italian': 'Итал',
        'Spanish': 'Исп'
      };
      return mapping[lang] || lang;
    }
    return lang.substring(0, 3);
  };

  const specialtyText = getSpecialtyLabel(instructor.specialty);

  return (
    <div 
      className={`border-b border-[var(--border)] py-6 flex flex-col md:grid md:grid-cols-[100px_1fr_180px_200px] items-center gap-6 transition duration-300 group ${
        !instructor.isAvailable ? 'opacity-60' : ''
      }`}
    >
      {/* 1. Grayscale Image */}
      <div className="relative w-24 h-24 md:w-20 md:h-20 bg-slate-900 rounded-none overflow-hidden shrink-0 border border-[var(--border)]">
        <img
          src={instructor.avatarUrl}
          alt={instructor.name}
          className="w-full h-full object-cover filter grayscale group-hover:grayscale-0 transition duration-500"
        />
        {!instructor.isAvailable && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-[9px] font-mono tracking-wider text-rose-400 font-bold uppercase rotate-12">
              {language === 'en' ? 'OFFLINE' : 'ЗАНЯТ'}
            </span>
          </div>
        )}
      </div>

      {/* 2. Title & Short Bio */}
      <div className="flex-1 text-center md:text-left space-y-1.5 w-full">
        <div className="flex flex-col md:flex-row md:items-baseline gap-2 justify-center md:justify-start">
          <h3 className="font-serif text-2xl font-light text-[var(--ink)] tracking-tight group-hover:text-[var(--accent)] transition">
            {instructor.name}
          </h3>
          <button
            onClick={() => onViewReviews && onViewReviews(instructor)}
            className="inline-flex items-center gap-1 self-center md:self-baseline text-[10px] font-mono text-amber-500 hover:underline transition select-none"
            title={language === 'en' ? 'Read reviews' : 'Читать отзывы'}
          >
            <Star className="w-3 h-3 fill-amber-400 stroke-amber-500" />
            <span>{instructor.rating.toFixed(1)} ({instructor.reviewsCount})</span>
          </button>
        </div>
        <p className="text-xs text-[var(--ink-dim)] md:max-w-xl leading-relaxed">
          {instructor.bio}
        </p>
      </div>

      {/* 3. Specialty / Experience / Languages */}
      <div className="text-center md:text-left space-y-1.5 w-full md:w-auto font-mono text-xs text-[var(--ink-dim)] uppercase tracking-wider">
        <div className="text-[var(--ink)] font-bold">
          {specialtyText} • {instructor.experienceYears}{language === 'en' ? 'Y' : 'Л'}
        </div>
        <div className="flex flex-wrap gap-1 items-center justify-center md:justify-start text-[10px] lowercase text-[var(--ink-dim)]">
          <Globe className="w-3 h-3 shrink-0" />
          <span>
            {instructor.languages.map(getLanguageLabel).join(', ')}
          </span>
        </div>
      </div>

      {/* 4. Price & CTA Actions */}
      <div className="text-center md:text-right w-full md:w-auto space-y-3">
        <div className="font-mono text-sm tracking-widest text-[var(--ink)] font-medium">
          ${instructor.pricePerHour.toFixed(2)} <span className="text-[9px] text-[var(--ink-dim)]">/ {t('hr')}</span>
        </div>
        
        <div className="flex gap-2 justify-center md:justify-end">
          <button
            onClick={() => onViewReviews && onViewReviews(instructor)}
            className="px-3 py-1.5 bg-transparent border border-[var(--border)] hover:border-[var(--ink)] text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] transition cursor-pointer"
          >
            {language === 'en' ? 'Reviews' : 'Отзывы'}
          </button>

          <button
            onClick={() => instructor.isAvailable && onBook(instructor)}
            disabled={!instructor.isAvailable}
            className={`px-4 py-1.5 border font-mono text-[10px] uppercase tracking-wider transition ${
              instructor.isAvailable
                ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer"
                : "bg-transparent border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed"
            }`}
          >
            {instructor.isAvailable 
              ? t('bookNow') 
              : (language === 'en' ? 'Full' : 'Занят')}
          </button>
        </div>
      </div>
    </div>
  );
};
