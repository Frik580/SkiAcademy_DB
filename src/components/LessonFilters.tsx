import React from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../lib/LanguageContext';

interface LessonFiltersProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  selectedSpecialty: 'all' | 'ski' | 'snowboard' | 'both';
  setSelectedSpecialty: (val: 'all' | 'ski' | 'snowboard' | 'both') => void;
  selectedLanguage: string;
  setSelectedLanguage: (val: string) => void;
  sortBy: 'rating' | 'priceAsc' | 'priceDesc' | 'experience';
  setSortBy: (val: 'rating' | 'priceAsc' | 'priceDesc' | 'experience') => void;
}

export const LessonFilters: React.FC<LessonFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  selectedSpecialty,
  setSelectedSpecialty,
  selectedLanguage,
  setSelectedLanguage,
  sortBy,
  setSortBy,
}) => {
  const { t } = useLanguage();

  const getLanguageLabel = (lang: string) => {
    if (lang === 'All Languages' || lang === 'all') return t('allLanguages');
    const mapping: Record<string, TranslationKey> = {
      English: 'languageEnglish',
      German: 'languageGerman',
      French: 'languageFrench',
      Russian: 'languageRussian',
      Italian: 'languageItalian',
      Spanish: 'languageSpanish',
    };
    return mapping[lang] ? t(mapping[lang]) : lang;
  };

  const getSpecialtyLabel = (spec: 'all' | 'ski' | 'snowboard' | 'both') => {
    const mapping: Record<'all' | 'ski' | 'snowboard' | 'both', TranslationKey> = {
      all: 'allFilter',
      ski: 'specialtySki',
      snowboard: 'filterSnowboardShort',
      both: 'specialtyBoth',
    };
    return t(mapping[spec]);
  };

  const languagesList = [
    'All Languages',
    'English',
    'German',
    'French',
    'Russian',
    'Italian',
    'Spanish',
  ];

  return (
    <div className="border border-[var(--border)] p-5 space-y-4 bg-transparent transition duration-300">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 mb-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--ink)]" />
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink)]">
          {t('filterInstructors')}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search Input */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('searchCoach')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 border border-[var(--border)] focus:border-[var(--ink)] text-xs bg-transparent text-[var(--ink)] focus:outline-none transition font-sans rounded-none"
            />
            <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Specialty Filter */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('discipline')}
          </label>
          <div className="grid grid-cols-4 gap-1 p-1 border border-[var(--border)]">
            {(['all', 'ski', 'snowboard', 'both'] as const).map((spec) => (
              <button
                key={spec}
                type="button"
                onClick={() => setSelectedSpecialty(spec)}
                className={`py-1 text-[9px] font-mono uppercase tracking-wider transition cursor-pointer rounded-none ${
                  selectedSpecialty === spec
                    ? 'bg-[var(--ink)] text-[var(--bg)] font-bold'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--border)]'
                }`}
              >
                {getSpecialtyLabel(spec)}
              </button>
            ))}
          </div>
        </div>

        {/* Language Filter */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('coachLanguage')}
          </label>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="w-full px-3 py-1.5 border border-[var(--border)] focus:border-[var(--ink)] text-xs bg-[var(--bg)] text-[var(--ink)] focus:outline-none transition cursor-pointer font-sans rounded-none"
          >
            {languagesList.map((lang) => (
              <option
                key={lang}
                value={lang === 'All Languages' ? 'all' : lang}
                className="bg-[var(--bg)] text-[var(--ink)]"
              >
                {getLanguageLabel(lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('sortBy')}
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full px-3 py-1.5 border border-[var(--border)] focus:border-[var(--ink)] text-xs bg-[var(--bg)] text-[var(--ink)] focus:outline-none transition cursor-pointer font-sans rounded-none"
          >
            <option value="rating" className="bg-[var(--bg)] text-[var(--ink)]">
              ★ {t('ratingHighToLow')}
            </option>
            <option value="priceAsc" className="bg-[var(--bg)] text-[var(--ink)]">
              $ {t('priceLowToHigh')}
            </option>
            <option value="priceDesc" className="bg-[var(--bg)] text-[var(--ink)]">
              $ {t('priceHighToLow')}
            </option>
            <option value="experience" className="bg-[var(--bg)] text-[var(--ink)]">
              ⚙ {t('experienceYears')}
            </option>
          </select>
        </div>
      </div>
    </div>
  );
};
