import React, { createContext, useContext, useState } from 'react';
import { translations, type Language, type TranslationKey } from './i18n/translations';

export type { Language, TranslationKey };
export { translations };
export * from './i18n/courseDates';
export * from './i18n/contentTranslation';
export * from './i18n/bookingLabels';
export { useTranslatedBookings } from './useTranslatedBookings';
export type { TranslatedBooking, UseTranslatedBookingsOptions } from './useTranslatedBookings';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('alpine_glide_lang');
    if (saved === 'ru' || saved === 'en') return saved;
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith('ru') ? 'ru' : 'en';
  });

  const setLanguage = (lang: Language) => {
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
