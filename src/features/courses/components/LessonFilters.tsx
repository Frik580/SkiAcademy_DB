import React from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../../app/providers/LanguageContext';

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
    <div className="ui-card p-5 lg:p-6 space-y-5 bg-transparent shadow-none bg-[var(--profile-bg)]">
      <div className="flex items-center gap-2 pb-1">
        <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--ink)]" />
        <h3 className="ui-section-eyebrow text-[var(--ink)] font-bold">{t('filterInstructors')}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="space-y-2">
          <label className="ui-label block">{t('searchCoach')}</label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="ui-field-plain pl-9 focus:outline-none focus:border-[var(--ink)] focus:border-[var(--accent)]"
            />
            <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="ui-label block">{t('discipline')}</label>
          <div className="ui-chip-group grid-cols-4 grid-cols-none">
            {(['all', 'ski', 'snowboard', 'both'] as const).map((spec) => (
              <button
                key={spec}
                type="button"
                onClick={() => setSelectedSpecialty(spec)}
                className={`ui-chip ${selectedSpecialty === spec ? 'ui-chip-active' : ''}`}
              >
                {getSpecialtyLabel(spec)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="ui-label block">{t('coachLanguage')}</label>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="ui-select focus:outline-none focus:border-[var(--ink)]"
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

        <div className="space-y-2">
          <label className="ui-label block">{t('sortBy')}</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="ui-select focus:outline-none focus:border-[var(--ink)]"
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
