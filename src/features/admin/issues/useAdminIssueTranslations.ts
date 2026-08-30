import { useLanguage } from '../../../app/providers/LanguageContext';

export function useAdminIssueTranslations() {
  return useLanguage();
}
