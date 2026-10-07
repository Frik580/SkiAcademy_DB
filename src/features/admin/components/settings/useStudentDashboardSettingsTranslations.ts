import { useLanguage } from '../../../../app/providers/LanguageContext';

export function useStudentDashboardSettingsTranslations() {
  const { language } = useLanguage();
  const lang: 'ru' | 'en' = language === 'ru' ? 'ru' : 'en';
  const ru = lang === 'ru';
  return {
    lang,
    title: ru ? 'Кабинет ученика → Главная' : 'Student cabinet → Home',
    description: ru
      ? 'Порядок карточек внутри фиксированных колонок.'
      : 'Card order within fixed columns.',
    column: (column: 'left' | 'right') =>
      column === 'left'
        ? ru
          ? 'Левая колонка · 1/3'
          : 'Left column · 1/3'
        : ru
          ? 'Основная колонка · 2/3'
          : 'Main column · 2/3',
    preview: ru ? 'Предпросмотр desktop' : 'Desktop preview',
    save: ru ? 'Сохранить' : 'Save',
    saving: ru ? 'Сохранение…' : 'Saving…',
    cancel: ru ? 'Отменить изменения' : 'Cancel changes',
    reset: ru ? 'Восстановить стандартную раскладку' : 'Restore default layout',
    saved: ru ? 'Раскладка сохранена.' : 'Layout saved.',
    error: ru
      ? 'Не удалось сохранить раскладку. Изменения остались в черновике. Повторите сохранение.'
      : 'Could not save the layout. Your draft is preserved. Try saving again.',
    moveUp: (label: string) => (ru ? `Переместить «${label}» выше` : `Move “${label}” up`),
    moveDown: (label: string) => (ru ? `Переместить «${label}» ниже` : `Move “${label}” down`),
    drag: (label: string) => (ru ? `Перетащить «${label}»` : `Drag “${label}”`),
  };
}
