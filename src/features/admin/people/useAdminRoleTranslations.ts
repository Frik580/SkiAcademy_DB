import { useLanguage } from '../../../app/providers/LanguageContext';

export function useAdminRoleTranslations() {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    locale: ru ? 'ru-RU' : 'en-US',
    text: {
      currentAdministrators: ru ? 'Действующие администраторы' : 'Current administrators',
      noAdministrators: ru ? 'Администраторы не найдены.' : 'No administrators found.',
      loading: ru ? 'Загрузка…' : 'Loading…',
      loadMore: ru ? 'Ещё' : 'Load more',
      retry: ru ? 'Повторить' : 'Retry',
      permissionDenied: ru
        ? 'Недостаточно прав администратора.'
        : 'Administrator permission required.',
      readFailed: ru
        ? 'Не удалось загрузить список администраторов.'
        : 'Could not load the administrator list.',
      ownerOnlyMutations: ru
        ? 'Только владелец системы может назначать и снимать администраторов.'
        : 'Only the system owner can promote or demote administrators.',
      ownerBadge: ru ? 'Владелец' : 'Owner',
      instructorBadge: ru ? 'Инструктор' : 'Instructor',
      roleAdmin: ru ? 'Администратор' : 'Administrator',
      roleUser: ru ? 'Пользователь' : 'User',
      lifecycleActive: ru ? 'Активен' : 'Active',
      lifecycleDisabled: ru ? 'Отключён' : 'Disabled',
      lifecycleUninitialized: ru ? 'Не инициализирован' : 'Uninitialized',
      openClient: ru ? 'Открыть клиента' : 'Open client',
      revokeAdmin: ru ? 'Снять права администратора' : 'Remove administrator rights',
      revokeConfirmPrefix: ru
        ? 'Снять права администратора с'
        : 'Remove administrator rights from',
      addAdministrator: ru ? 'Добавить администратора' : 'Add administrator',
      cancelAdd: ru ? 'Отмена' : 'Cancel',
      pickAccount: ru ? 'Выберите аккаунт' : 'Choose an account',
      accountSearch: ru ? 'Поиск аккаунтов' : 'Search accounts',
      accountSearchHint: ru
        ? 'Имя, email, телефон или ID. Текущие администраторы и владелец скрыты.'
        : 'Name, email, phone, or ID. Current admins and owner are hidden.',
      emptyCandidates: ru ? 'Подходящих аккаунтов нет.' : 'No eligible accounts.',
      confirmPromote: ru ? 'Назначить администратором' : 'Make administrator',
      promoteConfirmPrefix: ru
        ? 'Назначить администратором'
        : 'Promote to administrator',
      saved: ru ? 'Сохранено.' : 'Saved.',
      mutationFailed: ru ? 'Операция не выполнена.' : 'The operation failed.',
      stale: ru
        ? 'Данные устарели и были обновлены. Повторите действие.'
        : 'The data was stale and refreshed. Try again.',
      pending: ru ? 'Сохранение…' : 'Saving…',
      unnamed: ru ? 'Без имени' : 'Unnamed',
      unavailableForPromote: ru
        ? 'Недоступен для назначения'
        : 'Unavailable for promotion',
    },
  };
}
