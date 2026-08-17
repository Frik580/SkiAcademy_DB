import { useLanguage } from '../../../../app/providers/LanguageContext';

/** Student-cabinet boundary for the application-wide language provider. */
export const useStudentCabinetTranslations = () => {
  const { language, t } = useLanguage();
  return { language, t, lang: language === 'ru' ? ('ru' as const) : ('en' as const) };
};
