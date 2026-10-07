import { useLanguage } from '../../../../app/providers/LanguageContext';

export function useLessonLevelsTranslations() {
  const { language } = useLanguage();
  return language === 'ru'
    ? {
        title: 'Уровни занятий',
        subtitle: 'Названия, порядок и архив уровней индивидуальных занятий',
        add: 'Добавить уровень',
        edit: 'Редактировать',
        archive: 'Архивировать',
        restore: 'Восстановить',
        active: 'Активен',
        archived: 'В архиве',
        save: 'Сохранить',
        cancel: 'Отмена',
        marker: 'Маркер / emoji',
        ru: 'Название RU',
        en: 'Название EN',
        up: 'Выше',
        down: 'Ниже',
        loading: 'Загрузка…',
        failed: 'Не удалось сохранить. Проверьте подключение и повторите.',
        invalid: 'Введите оба названия и emoji. Минимум один уровень должен быть активен.',
        stale: 'Каталог изменился. Проверьте актуальные значения и повторите.',
        hint: 'Архив сохраняет уровень в истории. ID создаётся автоматически и не меняется.',
        unavailable: 'Каталог недоступен. Обновите страницу или проверьте подключение.',
      }
    : {
        title: 'Lesson levels',
        subtitle: 'Names, order and archive for individual lesson levels',
        add: 'Add level',
        edit: 'Edit',
        archive: 'Archive',
        restore: 'Restore',
        active: 'Active',
        archived: 'Archived',
        save: 'Save',
        cancel: 'Cancel',
        marker: 'Marker / emoji',
        ru: 'RU name',
        en: 'EN name',
        up: 'Move up',
        down: 'Move down',
        loading: 'Loading…',
        failed: 'Could not save. Check your connection and retry.',
        invalid: 'Enter both names and an emoji. At least one level must stay active.',
        stale: 'The catalog changed. Check the current values and retry.',
        hint: 'Archiving preserves lesson history. IDs are generated automatically and stay immutable.',
        unavailable: 'Catalog unavailable. Reload the page or check your connection.',
      };
}
