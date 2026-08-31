import { useLanguage } from '../../../../app/providers/LanguageContext';

export function useAdminCourseTranslations() {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    text: {
      loading: ru ? 'Загрузка canonical-курсов…' : 'Loading canonical courses…',
      retry: ru ? 'Повторить' : 'Retry',
      empty: ru ? 'Canonical-курсов пока нет.' : 'No canonical courses yet.',
      create: ru ? 'Создать canonical-курс' : 'Create canonical course',
      refresh: ru ? 'Обновить' : 'Refresh',
      reason: ru ? 'Причина изменения' : 'Reason for change',
      mutationFailed: ru ? 'Операция не выполнена.' : 'The operation failed.',
      permissionDenied: ru ? 'Недостаточно прав администратора.' : 'Administrator permission required.',
      stale: ru ? 'Версия устарела; данные обновлены.' : 'The version was stale; data was refreshed.',
      pending: ru ? 'Сохранение…' : 'Saving…',
    },
  };
}
