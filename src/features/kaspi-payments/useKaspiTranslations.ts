import { useLanguage } from '../../app/providers/LanguageContext';
export function useKaspiTranslations() {
  const { t, language } = useLanguage();
  return {
    t,
    language,
    formatKzt: (amount: number) =>
      `${new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(amount)} ₸`,
  };
}
