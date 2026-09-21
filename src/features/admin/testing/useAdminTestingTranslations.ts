import { useLanguage } from '../../../app/providers/LanguageContext';

/** Feature boundary for Testing UI copy and locale-sensitive KZT/date formatting. */
export function useAdminTestingTranslations() {
  const { language, t } = useLanguage();
  const locale = language === 'ru' ? 'ru-KZ' : 'en-US';

  return {
    t,
    formatKzt: (amount: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'KZT',
        maximumFractionDigits: 0,
      }).format(amount),
    formatDate: (timestamp: { readonly seconds: number }) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(timestamp.seconds * 1_000)
      ),
  };
}
