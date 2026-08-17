import React, { createContext, useContext, useState } from 'react';
import {
  translations,
  type Language,
  type TranslationKey,
  isUiLanguage,
  resolveUiLanguage,
  UI_LANGUAGES,
} from '../../lib/i18n/translations';

export type { Language, TranslationKey };
export { translations, isUiLanguage, resolveUiLanguage, UI_LANGUAGES };
export * from '../../lib/i18n/courseDates';
export * from '../../lib/i18n/contentTranslation';
export * from '../../lib/i18n/bookingLabels';
export { useTranslatedBookings } from '../../lib/useTranslatedBookings';
export type {
  TranslatedBooking,
  UseTranslatedBookingsOptions,
} from '../../lib/useTranslatedBookings';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() =>
    resolveUiLanguage(localStorage.getItem('alpine_glide_lang'))
  );

  const setLanguage = (lang: Language) => {
    if (!isUiLanguage(lang)) return;
    setLanguageState(lang);
    localStorage.setItem('alpine_glide_lang', lang);
  };

  const t = (key: TranslationKey): string => {
    const translationSet = translations[language];
    return translationSet[key] || translations['en'][key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
