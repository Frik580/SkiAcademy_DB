import { useLanguage } from '../../app/providers/LanguageContext';

export function useLevelProgressionTranslations() {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    text: {
      title: ru ? 'Официальный уровень мастерства' : 'Official mastery level',
      stage: ru ? 'XP текущего этапа' : 'Current stage XP',
      required: ru ? 'Порог повышения' : 'Promotion threshold',
      ready: ru
        ? 'Готов к повышению · ожидается подтверждение инструктора'
        : 'Ready for promotion · awaiting instructor confirmation',
      review: ru
        ? 'Оценки предыдущего этапа исправлены. Квалификация требует пересмотра; уровень сохранён.'
        : 'Earlier stage scores were corrected. Qualification needs review; the official level is preserved.',
      max: ru ? 'Достигнут максимальный уровень' : 'Maximum level reached',
      assigned: ru
        ? 'Предыдущие этапы пройдены через определение квалификации. XP начисляются только за оценки.'
        : 'Earlier stages passed by qualification assignment. Only evaluated exercises earn XP.',
      confirm: ru ? 'Подтвердить повышение' : 'Confirm promotion',
      retain: ru
        ? 'Сохранить квалификацию с обоснованием'
        : 'Retain qualification with justification',
      request: ru ? 'Запросить изменение уровня' : 'Request level change',
      assign: ru ? 'Назначить уровень' : 'Assign level',
      reason: ru ? 'Обязательная причина' : 'Required reason',
      comment: ru ? 'Дополнительный комментарий' : 'Additional comment',
      initial: ru ? 'Первичное определение квалификации' : 'Initial qualification',
      correction: ru ? 'Исправление ошибки' : 'Correction',
      expert: ru ? 'Экспертная оценка' : 'Expert assessment',
      other: ru ? 'Другое' : 'Other',
      approve: ru ? 'Одобрить' : 'Approve',
      reject: ru ? 'Отклонить с причиной' : 'Reject with reason',
      cancel: ru ? 'Отозвать запрос' : 'Withdraw request',
      pending: ru ? 'Ожидает рассмотрения' : 'Pending',
      approved: ru ? 'Одобрен' : 'Approved',
      rejected: ru ? 'Отклонён' : 'Rejected',
      cancelled: ru ? 'Отозван' : 'Withdrawn',
      stale: ru ? 'Устарел: создайте новый запрос' : 'Stale: create a new request',
      refresh: ru ? 'Обновить' : 'Refresh',
      loading: ru ? 'Загрузка…' : 'Loading…',
      requests: ru ? 'Запросы на изменение уровня' : 'Level change requests',
      more: ru ? 'Следующая страница' : 'Next page',
      empty: ru ? 'Нет ожидающих запросов' : 'No pending requests',
    },
  };
}
