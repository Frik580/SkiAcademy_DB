import { useLanguage } from '../../../app/providers/LanguageContext';

export function useAdminClientTranslations() {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    locale: ru ? 'ru-RU' : 'en-US',
    text: {
      search: ru ? 'Поиск клиентов' : 'Search clients',
      searchHint: ru
        ? 'Имя (начало), точный email, точный телефон или ID. Не полный каталог.'
        : 'Name prefix, exact email, exact phone, or ID. Not a full-directory scan.',
      loading: ru ? 'Загрузка…' : 'Loading…',
      loadMore: ru ? 'Ещё' : 'Load more',
      retry: ru ? 'Повторить' : 'Retry',
      emptyDirectory: ru ? 'Клиентов пока нет.' : 'No clients yet.',
      emptySearch: ru ? 'Клиенты не найдены.' : 'No clients found.',
      permissionDenied: ru
        ? 'Недостаточно прав администратора.'
        : 'Administrator permission required.',
      readFailed: ru ? 'Не удалось загрузить список клиентов.' : 'Could not load the client list.',
      detailFailed: ru ? 'Не удалось загрузить карточку клиента.' : 'Could not load the client.',
      missingAccount: ru ? 'Аккаунт недоступен.' : 'Account is unavailable.',
      missingParticipant: ru ? 'Участник недоступен.' : 'Participant is unavailable.',
      stale: ru
        ? 'Данные устарели и были обновлены. Повторите действие.'
        : 'The data was stale and refreshed. Try again.',
      mutationFailed: ru ? 'Операция не выполнена.' : 'The operation failed.',
      saved: ru ? 'Сохранено.' : 'Saved.',
      client: ru ? 'Клиент' : 'Client',
      contact: ru ? 'Контакт' : 'Contact',
      participants: ru ? 'Участники' : 'Participants',
      actions: ru ? 'Действия' : 'Actions',
      openDetail: ru ? 'Открыть' : 'Open',
      closeDetail: ru ? 'Закрыть карточку' : 'Close detail',
      backToAccount: ru ? 'К аккаунту' : 'Back to account',
      unnamed: ru ? 'Без имени' : 'Unnamed',
      youBadge: ru ? 'Вы' : 'You',
      lifecycle: ru ? 'Статус аккаунта' : 'Account status',
      lifecycleActive: ru ? 'Активен' : 'Active',
      lifecycleDisabled: ru ? 'Отключён' : 'Disabled',
      lifecycleUninitialized: ru ? 'Не инициализирован' : 'Uninitialized',
      participantActive: ru ? 'Активен' : 'Active',
      participantArchived: ru ? 'В архиве' : 'Archived',
      roleAdmin: ru ? 'Админ' : 'Admin',
      roleOwner: ru ? 'Владелец' : 'Owner',
      coachBadge: ru ? 'Инструктор' : 'Instructor',
      contactDetails: ru ? 'Контактные данные' : 'Contact details',
      editContact: ru ? 'Редактировать контакт' : 'Edit contact',
      saveContact: ru ? 'Сохранить контакт' : 'Save contact',
      cancel: ru ? 'Отмена' : 'Cancel',
      displayName: ru ? 'Имя' : 'Name',
      email: ru ? 'Email' : 'Email',
      phone: ru ? 'Телефон' : 'Phone',
      noPhone: ru ? 'Телефон не указан' : 'No phone',
      emailReadOnly: ru
        ? 'Email принадлежит учётной записи входа и здесь не меняется.'
        : 'Email is owned by sign-in identity and cannot be edited here.',
      enable: ru ? 'Включить' : 'Enable',
      disable: ru ? 'Отключить' : 'Disable',
      confirmDisable: ru
        ? 'Отключить этот аккаунт? Участники и занятия не удаляются.'
        : 'Disable this account? Participants and lessons are not deleted.',
      finance: ru ? 'Финансы' : 'Finance',
      openFinance: ru ? 'Открыть Finance' : 'Open Finance',
      wallet: ru ? 'Кошелёк' : 'Wallet',
      walletMissing: ru ? 'Кошелёк не создан' : 'Wallet is not created',
      walletUnavailable: ru ? 'Кошелёк недоступен' : 'Wallet is unavailable',
      addParticipant: ru ? 'Добавить участника' : 'Add participant',
      provisionSelf: ru ? 'Создать участника для аккаунта' : 'Create participant for this account',
      missingSelf: ru
        ? 'У этого аккаунта нет собственного участника.'
        : 'This account has no self participant.',
      relationship: ru ? 'Связь' : 'Relationship',
      relationshipSelf: ru ? 'Сам клиент' : 'Self',
      relationshipGuardian: ru ? 'Родитель / опекун' : 'Parent / guardian',
      openParticipant: ru ? 'Открыть участника' : 'Open participant',
      participantSkillLevel: ru ? 'Уровень участника' : 'Participant skill level',
      discipline: ru ? 'Дисциплина' : 'Discipline',
      ski: ru ? 'Лыжи' : 'Ski',
      snowboard: ru ? 'Сноуборд' : 'Snowboard',
      birthDate: ru ? 'Дата рождения' : 'Birth date',
      age: ru ? 'Возраст' : 'Age',
      ageYears: ru ? 'лет' : 'years',
      instructorComment: ru ? 'Комментарий инструктора' : 'Instructor comment',
      saveParticipant: ru ? 'Сохранить участника' : 'Save participant',
      archiveParticipant: ru ? 'В архив' : 'Archive',
      restoreParticipant: ru ? 'Восстановить' : 'Restore',
      archiveBlocked: ru
        ? 'Архивация закрыта: есть активные или будущие обязательства.'
        : 'Archive is blocked: active or future commitments exist.',
      noParticipants: ru ? 'Управляемых участников нет.' : 'No managed participants.',
      pending: ru ? 'Сохранение…' : 'Saving…',
    },
  };
}
