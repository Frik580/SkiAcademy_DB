import { useLanguage } from '../../../../app/providers/LanguageContext';

/** Schedule-facing translation boundary. */
export const useScheduleTranslations = () => {
  const { t, language } = useLanguage();
  return { t, language };
};
