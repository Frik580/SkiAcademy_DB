import { useLanguage } from '../../../app/providers/LanguageContext';

export function useAdminIdentityTranslations() {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    text: {
      title: ru ? 'Учётные записи и участники' : 'Accounts and participants',
      subtitle: ru
        ? 'Canonical-администрирование Account, Participant и каталога инструкторов.'
        : 'Canonical administration of Accounts, Participants, and the instructor catalog.',
      accounts: ru ? 'Аккаунты' : 'Accounts',
      participants: ru ? 'Участники' : 'Participants',
      instructors: ru ? 'Инструкторы' : 'Instructors',
      search: ru ? 'Поиск' : 'Search',
      searchHint: ru
        ? 'ID, email или начало имени. Без полного сканирования.'
        : 'ID, email, or name prefix. No unbounded scan.',
      loading: ru ? 'Загрузка…' : 'Loading…',
      loadMore: ru ? 'Ещё' : 'Load more',
      empty: ru ? 'Ничего не найдено.' : 'Nothing found.',
      retry: ru ? 'Повторить' : 'Retry',
      refresh: ru ? 'Обновить' : 'Refresh',
      reason: ru ? 'Причина' : 'Reason',
      confirm: ru ? 'Подтвердить' : 'Confirm',
      cancel: ru ? 'Отмена' : 'Cancel',
      pending: ru ? 'Сохранение…' : 'Saving…',
      stale: ru
        ? 'Версия устарела; данные обновлены.'
        : 'The version was stale; data was refreshed.',
      permissionDenied: ru
        ? 'Недостаточно прав администратора.'
        : 'Administrator permission required.',
      mutationFailed: ru ? 'Операция не выполнена.' : 'The operation failed.',
      deactivate: ru ? 'Деактивировать' : 'Deactivate',
      activate: ru ? 'Активировать' : 'Activate',
      archive: ru ? 'Архивировать' : 'Archive',
      restore: ru ? 'Восстановить' : 'Restore',
      promote: ru ? 'Назначить admin' : 'Promote to admin',
      demote: ru ? 'Снять admin' : 'Demote to user',
      provisionSelf: ru ? 'Создать self Participant' : 'Provision self Participant',
      createDependent: ru ? 'Создать dependent' : 'Create dependent',
      assignManagement: ru ? 'Назначить менеджера' : 'Assign manager',
      revokeManagement: ru ? 'Отозвать management' : 'Revoke management',
      editProfile: ru ? 'Изменить профиль' : 'Edit profile',
      saveProfile: ru ? 'Сохранить профиль' : 'Save profile',
      birthDate: ru ? 'Дата рождения' : 'Birth date',
      displayName: ru ? 'Имя' : 'Name',
      skillLevel: ru ? 'Уровень' : 'Skill level',
      discipline: ru ? 'Дисциплина' : 'Discipline',
      createCatalog: ru ? 'Создать запись каталога' : 'Create catalog entry',
      updateCatalog: ru ? 'Обновить каталог' : 'Update catalog',
      deactivateCatalog: ru ? 'Выключить публичную доступность' : 'Turn off public availability',
      reactivateCatalog: ru ? 'Включить публичную доступность' : 'Turn on public availability',
      linkCatalog: ru ? 'Связать Account ↔ каталог' : 'Link Account ↔ catalog',
      unlinkCatalog: ru ? 'Отвязать Account ↔ каталог' : 'Unlink Account ↔ catalog',
      price: ru ? 'Цена, KZT/час' : 'Price, KZT/hour',
      diagnostics: ru ? 'Диагностика' : 'Diagnostics',
      noRepair: ru ? 'Безопасное восстановление недоступно' : 'No safe repair available',
      repair: ru ? 'Безопасное восстановление' : 'Safe repair',
      lifecycle: ru ? 'Статус' : 'Lifecycle',
      managed: ru ? 'Управляемые участники' : 'Managed participants',
      managers: ru ? 'Менеджеры' : 'Managers',
      archiveBlocked: ru
        ? 'Архивация закрыта: есть активные или будущие обязательства.'
        : 'Archive is blocked: active or future commitments exist.',
      selectAccount: ru ? 'Сначала выберите Account' : 'Select an Account first',
      eligibleParticipants: ru ? 'Управляемые участники Account' : 'Account-managed participants',
      noEligible: ru
        ? 'У этого Account нет активных управляемых участников.'
        : 'This Account has no active managed participants.',
      pickerAccount: ru ? 'Account для выбора участника' : 'Account for participant selection',
      pickerSearchHint: ru ? 'Поиск по ID, email или имени' : 'Search by ID, email, or name',
    },
  };
}
