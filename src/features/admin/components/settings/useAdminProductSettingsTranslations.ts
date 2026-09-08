import { useLanguage } from '../../../../app/providers/LanguageContext';

export function useAdminProductSettingsTranslations() {
  const { language, t } = useLanguage();
  const ru = language === 'ru';
  return {
    t,
    text: {
      lessonPricingTitle: ru ? 'Настройки урока' : 'Lesson settings',
      lessonPricingSubtitle: ru
        ? 'Каноническая доплата и максимальный размер группы'
        : 'Canonical surcharge and maximum lesson party size',
      surchargeLabel: ru
        ? 'Доплата за дополнительного участника, ₸/час'
        : 'Additional participant surcharge, ₸/hour',
      maxParticipantsLabel: ru
        ? 'Максимум участников в одном уроке'
        : 'Maximum participants per lesson',
      reasonLabel: ru ? 'Причина изменения' : 'Reason for change',
      reasonPlaceholder: ru
        ? 'Например: обновление тарифа на сезон'
        : 'For example: seasonal tariff update',
      save: ru ? 'Сохранить настройки' : 'Save settings',
      saving: ru ? 'Сохранение…' : 'Saving…',
      loading: ru ? 'Загрузка canonical-настройки…' : 'Loading canonical setting…',
      unconfigured: ru
        ? 'Настройки урока ещё не заданы. Новое authenticated-бронирование закрыто fail-closed.'
        : 'Lesson settings are not configured. New authenticated booking is fail-closed.',
      saved: ru ? 'Канонические настройки сохранены.' : 'Canonical settings saved.',
      invalid: ru
        ? 'Введите целую неотрицательную доплату KZT, положительный целый максимум и причину.'
        : 'Enter a non-negative whole KZT surcharge, a positive whole maximum, and a reason.',
      stale: ru
        ? 'Настройка уже изменилась. Актуальное значение загружено.'
        : 'The setting changed. The current value has been reloaded.',
      failed: ru ? 'Не удалось сохранить настройку.' : 'Could not save the setting.',
      revision: ru ? 'Ревизия' : 'Revision',
    },
  };
}
