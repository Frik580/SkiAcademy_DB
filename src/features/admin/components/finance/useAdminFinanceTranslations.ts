import { useLanguage } from '../../../../app/providers/LanguageContext';

/** Finance-facing translation boundary for admin cash-flow and KPI panels. */
export const useAdminFinanceTranslations = () => {
  const { t, language } = useLanguage();
  return { t, language };
};
