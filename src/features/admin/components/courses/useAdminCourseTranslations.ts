import { useLanguage } from '../../../../app/providers/LanguageContext';
import type { CommandErrorCode, CommandKind } from '@ski-academy/shared-domain';

const ACTION_LABELS: Partial<Record<CommandKind, { readonly en: string; readonly ru: string }>> = {
  change_course_title: { en: 'Change title', ru: 'Изменить название' },
  change_course_price: { en: 'Change KZT price', ru: 'Изменить цену в KZT' },
  change_course_capacity: { en: 'Change capacity', ru: 'Изменить вместимость' },
  archive_course: { en: 'Archive', ru: 'Архивировать' },
  reactivate_course: { en: 'Reactivate', ru: 'Вернуть из архива' },
  add_course_roster_instructor: { en: 'Add roster instructor', ru: 'Добавить инструктора' },
  remove_course_roster_instructor: {
    en: 'Remove roster instructor',
    ru: 'Убрать инструктора',
  },
  create_course_day: { en: 'Add CourseDay', ru: 'Добавить день курса' },
  reassign_course_day_instructor: {
    en: 'Change day instructor',
    ru: 'Сменить инструктора дня',
  },
  reschedule_course_day: { en: 'Reschedule day', ru: 'Перенести день' },
  remove_course_day: { en: 'Remove day', ru: 'Удалить день' },
  update_course_catalog_content: { en: 'Edit presentation', ru: 'Изменить презентацию' },
  apply_canonical_course_provisioning_manifest: {
    en: 'Create canonical Course',
    ru: 'Создать канонический курс',
  },
};

function commandErrorText(code: CommandErrorCode, ru: boolean): string {
  const messages: Partial<Record<CommandErrorCode, readonly [string, string]>> = {
    validation: [
      'Check the entered values and Course state.',
      'Проверьте введённые данные и состояние курса.',
    ],
    stale_version: [
      'The Course changed. Authoritative data was refreshed; review and retry.',
      'Курс был изменён. Актуальные данные загружены; проверьте их и повторите.',
    ],
    instructor_conflict: [
      'The instructor is already occupied at this time.',
      'Инструктор уже занят в это время.',
    ],
    resource_conflict: [
      'The requested schedule conflicts with an occupied resource.',
      'Новое расписание конфликтует с занятым ресурсом.',
    ],
    participant_conflict: [
      'A participant scheduling conflict was found.',
      'Обнаружен конфликт расписания участника.',
    ],
    idempotency_conflict: [
      'This save attempt was already used for different data. Edit the form and retry.',
      'Эта попытка сохранения уже использована для других данных. Измените форму и повторите.',
    ],
    invalid_transition: [
      'This lifecycle transition is not allowed.',
      'Этот переход жизненного цикла недоступен.',
    ],
    forbidden: ['Administrator permission is required.', 'Недостаточно прав администратора.'],
    unauthorized: ['Authentication is required.', 'Требуется авторизация.'],
    unavailable: [
      'The Course or related record was not found.',
      'Курс или связанная запись не найдены.',
    ],
    concurrent_modification: [
      'The Course is being changed. Refresh and retry.',
      'Курс сейчас изменяется. Обновите данные и повторите.',
    ],
  };
  const message = messages[code];
  return message ? message[ru ? 1 : 0] : ru ? 'Операция не выполнена.' : 'The operation failed.';
}

export function useAdminCourseTranslations() {
  const { language, t } = useLanguage();
  const ru = language === 'ru';
  return {
    language,
    t,
    actionLabel: (kind: CommandKind) => ACTION_LABELS[kind]?.[ru ? 'ru' : 'en'] ?? kind,
    commandError: (code: CommandErrorCode) => commandErrorText(code, ru),
    text: {
      loading: ru ? 'Загрузка canonical-курсов…' : 'Loading canonical courses…',
      retry: ru ? 'Повторить' : 'Retry',
      empty: ru ? 'Canonical-курсов пока нет.' : 'No canonical courses yet.',
      create: ru ? 'Создать canonical-курс' : 'Create canonical course',
      createClone: ru ? 'Создать копию курса' : 'Create course copy',
      cloneDraftReady: ru
        ? 'Черновик клона из detail. Проверьте расписание перед сохранением.'
        : 'Clone draft from detail. Review the schedule before saving.',
      refresh: ru ? 'Обновить' : 'Refresh',
      reason: ru ? 'Причина изменения' : 'Reason for change',
      mutationFailed: ru ? 'Операция не выполнена.' : 'The operation failed.',
      permissionDenied: ru
        ? 'Недостаточно прав администратора.'
        : 'Administrator permission required.',
      stale: ru
        ? 'Версия устарела; данные обновлены.'
        : 'The version was stale; data was refreshed.',
      pending: ru ? 'Сохранение…' : 'Saving…',
      details: ru ? 'Детали курса' : 'Course details',
      closeDetails: ru ? 'Закрыть детали' : 'Close details',
      lifecycle: ru ? 'Статус' : 'Lifecycle',
      enrollments: ru ? 'Записи на курс' : 'Course enrollments',
      activeEnrollments: ru ? 'Активные записи' : 'Active enrollments',
      totalEnrollments: ru ? 'Всего записей' : 'Total enrollments',
      courseDays: ru ? 'Дни курса' : 'Course days',
      presentation: ru ? 'Презентация / каталог' : 'Presentation / catalog',
      operationalSchedule: ru ? 'Операционное расписание' : 'Operational schedule',
      unavailableInstructor: ru
        ? 'Инструктор деактивирован: новые записи запрещены, существующие дни курса сохранены.'
        : 'Instructor is inactive: new bookings are blocked, existing CourseDays are preserved.',
      archiveHistoryPreserved: ru
        ? 'Курс исчезнет из активного списка, но записи, посещаемость и платежная история сохранятся.'
        : 'The Course will leave the active list; enrollments, attendance, and payment history remain.',
      manageEnrollments: ru ? 'Открыть записи и посещаемость' : 'Open enrollments and attendance',
      noSchedule: ru ? 'Операционные дни курса отсутствуют.' : 'No operational CourseDays.',
      capacityRange: ru
        ? 'Допустимая вместимость: от 1 до 64.'
        : 'Capacity must be between 1 and 64.',
    },
  };
}
