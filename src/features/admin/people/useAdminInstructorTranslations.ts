import { useLanguage } from '../../../app/providers/LanguageContext';

export function useAdminInstructorTranslations() {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    locale: ru ? 'ru-RU' : 'en-US',
    text: {
      search: ru ? 'Поиск инструкторов' : 'Search instructors',
      searchHint: ru
        ? 'Имя (начало) или ID. Не полный каталог.'
        : 'Name prefix or ID. Not a full-directory scan.',
      loading: ru ? 'Загрузка…' : 'Loading…',
      loadMore: ru ? 'Ещё' : 'Load more',
      retry: ru ? 'Повторить' : 'Retry',
      emptyDirectory: ru ? 'Инструкторов пока нет.' : 'No instructors yet.',
      emptySearch: ru ? 'Инструкторы не найдены.' : 'No instructors found.',
      permissionDenied: ru
        ? 'Недостаточно прав администратора.'
        : 'Administrator permission required.',
      readFailed: ru
        ? 'Не удалось загрузить список инструкторов.'
        : 'Could not load the instructor list.',
      detailFailed: ru
        ? 'Не удалось загрузить карточку инструктора.'
        : 'Could not load the instructor.',
      missingInstructor: ru ? 'Инструктор недоступен.' : 'Instructor is unavailable.',
      stale: ru
        ? 'Данные устарели и были обновлены. Повторите действие.'
        : 'The data was stale and refreshed. Try again.',
      mutationFailed: ru ? 'Операция не выполнена.' : 'The operation failed.',
      saved: ru ? 'Сохранено.' : 'Saved.',
      instructor: ru ? 'Инструктор' : 'Instructor',
      specialty: ru ? 'Специализация' : 'Specialty',
      rate: ru ? 'Ставка (₸/ч)' : 'Rate (₸/hr)',
      availability: ru ? 'Приём записей' : 'Bookings',
      account: ru ? 'Аккаунт' : 'Account',
      actions: ru ? 'Действия' : 'Actions',
      openDetail: ru ? 'Открыть' : 'Open',
      closeDetail: ru ? 'Закрыть карточку' : 'Close detail',
      unnamed: ru ? 'Без имени' : 'Unnamed',
      available: ru ? 'Принимает записи' : 'Accepting bookings',
      paused: ru ? 'Приём приостановлен' : 'Bookings paused',
      specialtySki: ru ? 'Лыжи' : 'Ski',
      specialtySnowboard: ru ? 'Сноуборд' : 'Snowboard',
      specialtyBoth: ru ? 'Лыжи и сноуборд' : 'Ski & snowboard',
      addInstructor: ru ? 'Добавить инструктора' : 'Add instructor',
      cancelAdd: ru ? 'Отмена' : 'Cancel',
      createInstructor: ru ? 'Создать инструктора' : 'Create instructor',
      pickAccount: ru ? 'Выберите аккаунт' : 'Choose an account',
      accountSearch: ru ? 'Поиск аккаунтов' : 'Search accounts',
      accountSearchHint: ru
        ? 'Имя, email или ID. Уже привязанные аккаунты скрыты.'
        : 'Name, email, or ID. Already-linked accounts are hidden.',
      emptyAccounts: ru ? 'Подходящих аккаунтов нет.' : 'No matching accounts.',
      accountDisabled: ru ? 'Отключён' : 'Disabled',
      accountUninitialized: ru ? 'Не инициализирован' : 'Uninitialized',
      accountActive: ru ? 'Активен' : 'Active',
      accountUnavailableForLink: ru
        ? 'Недоступен для привязки'
        : 'Unavailable for linking',
      accountAlreadyLinked: ru ? 'Уже привязан' : 'Already linked',
      accountNotLinked: ru ? 'Аккаунт не привязан' : 'Account not linked',
      linkAccount: ru ? 'Привязать аккаунт' : 'Link account',
      confirmLink: ru ? 'Привязать' : 'Link',
      stopBeingInstructor: ru ? 'Перестать быть инструктором' : 'Stop being instructor',
      confirmStopBeingInstructor: ru
        ? 'Отвязать аккаунт и остановить приём новых записей? Существующие обязательства не удаляются.'
        : 'Unlink the account and stop accepting new bookings? Existing commitments are not deleted.',
      unlinkBlocked: ru
        ? 'Отвязка закрыта: есть будущие уроки или дни курсов.'
        : 'Unlink is blocked: future lessons or course days exist.',
      pauseNewBookings: ru ? 'Приостановить приём записей' : 'Pause new bookings',
      resumeNewBookings: ru ? 'Возобновить приём записей' : 'Resume new bookings',
      confirmPauseWithFuture: ru
        ? 'У инструктора есть будущие уроки или дни курсов. Они останутся; новые записи будут недоступны. Продолжить?'
        : 'This instructor has future lessons or course days. They remain; new bookings will stop. Continue?',
      confirmPause: ru ? 'Приостановить приём новых записей?' : 'Pause accepting new bookings?',
      editProfile: ru ? 'Редактировать профиль' : 'Edit profile',
      saveProfile: ru ? 'Сохранить профиль' : 'Save profile',
      cancel: ru ? 'Отмена' : 'Cancel',
      displayName: ru ? 'Имя' : 'Name',
      languages: ru ? 'Языки' : 'Languages',
      languagesHint: ru ? 'Через запятую' : 'Comma-separated',
      experienceYears: ru ? 'Опыт (лет)' : 'Experience (years)',
      bio: ru ? 'О себе' : 'Bio',
      phone: ru ? 'Телефон' : 'Phone',
      pricePerHourKZT: ru ? 'Ставка ₸/час' : 'Rate ₸/hour',
      priceRequired: ru ? 'Укажите ставку в тенге.' : 'Enter a rate in tenge.',
      nameRequired: ru ? 'Укажите имя.' : 'Enter a name.',
      accountRequired: ru ? 'Выберите аккаунт.' : 'Choose an account.',
      avatarUrl: ru ? 'URL аватара' : 'Avatar URL',
      uploadPhoto: ru ? 'Загрузить фото' : 'Upload photo',
      uploading: ru ? 'Загрузка фото…' : 'Uploading photo…',
      openClient: ru ? 'Открыть клиента' : 'Open client',
      openPlanner: ru ? 'Открыть в планере' : 'Open planner',
      futureLessons: ru ? 'Будущие уроки' : 'Future lessons',
      futureCourseDays: ru ? 'Будущие дни курсов' : 'Future course days',
      linkedAccountLifecycle: ru ? 'Статус аккаунта' : 'Account status',
      pending: ru ? 'Сохранение…' : 'Saving…',
      profile: ru ? 'Профиль' : 'Profile',
      commitments: ru ? 'Обязательства' : 'Commitments',
    },
  };
}
