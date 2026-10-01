export type OutboxMessageLocale = 'ru' | 'en';

export interface OutboxRenderedMessage {
  readonly title: string;
  readonly message: string;
}

interface OutboxMessageTemplate {
  readonly type: 'info' | 'success' | 'warning';
  readonly ru: OutboxRenderedMessage;
  readonly en: OutboxRenderedMessage;
}

const TEMPLATES: Record<string, OutboxMessageTemplate> = {
  booking_confirmed: {
    type: 'success',
    en: { title: 'Lesson booking confirmed', message: 'Your lesson booking is confirmed.' },
    ru: {
      title: 'Бронирование урока подтверждено',
      message: 'Ваше бронирование урока подтверждено.',
    },
  },
  booking_cancelled: {
    type: 'warning',
    en: { title: 'Lesson booking cancelled', message: 'Your lesson booking was cancelled.' },
    ru: { title: 'Бронирование урока отменено', message: 'Ваше бронирование урока отменено.' },
  },
  booking_pending_cancellation: {
    type: 'warning',
    en: {
      title: 'Cancellation requested',
      message: 'Your lesson cancellation request is waiting for review.',
    },
    ru: {
      title: 'Запрошена отмена',
      message: 'Запрос на отмену урока ожидает рассмотрения.',
    },
  },
  booking_cancellation_withdrawn: {
    type: 'info',
    en: {
      title: 'Cancellation withdrawn',
      message: 'Your lesson cancellation request was withdrawn.',
    },
    ru: {
      title: 'Отмена отозвана',
      message: 'Запрос на отмену урока отозван.',
    },
  },
  booking_rescheduled: {
    type: 'info',
    en: { title: 'Lesson rescheduled', message: 'Your lesson booking was rescheduled.' },
    ru: { title: 'Урок перенесён', message: 'Ваше бронирование урока перенесено.' },
  },
  booking_service_changed: {
    type: 'info',
    en: { title: 'Lesson updated', message: 'Your lesson booking details were updated.' },
    ru: { title: 'Урок изменён', message: 'Детали вашего бронирования урока обновлены.' },
  },
  booking_completed: {
    type: 'success',
    en: { title: 'Lesson completed', message: 'Your lesson booking is complete.' },
    ru: { title: 'Урок завершён', message: 'Ваше бронирование урока завершено.' },
  },
  course_enrollment_created: {
    type: 'success',
    en: { title: 'Course enrollment created', message: 'Your course enrollment was created.' },
    ru: { title: 'Запись на курс создана', message: 'Ваша запись на курс создана.' },
  },
  course_enrollment_cancelled: {
    type: 'warning',
    en: { title: 'Course enrollment cancelled', message: 'Your course enrollment was cancelled.' },
    ru: { title: 'Запись на курс отменена', message: 'Ваша запись на курс отменена.' },
  },
  course_enrollment_pending_cancellation: {
    type: 'warning',
    en: {
      title: 'Enrollment cancellation requested',
      message: 'Your course cancellation request is waiting for review.',
    },
    ru: {
      title: 'Запрошена отмена записи',
      message: 'Запрос на отмену записи на курс ожидает рассмотрения.',
    },
  },
  course_enrollment_cancellation_withdrawn: {
    type: 'info',
    en: {
      title: 'Enrollment cancellation withdrawn',
      message: 'Your course cancellation request was withdrawn.',
    },
    ru: {
      title: 'Отмена записи отозвана',
      message: 'Запрос на отмену записи на курс отозван.',
    },
  },
  course_enrollment_transferred: {
    type: 'info',
    en: { title: 'Course enrollment transferred', message: 'Your course enrollment was transferred.' },
    ru: { title: 'Запись на курс перенесена', message: 'Ваша запись на курс перенесена.' },
  },
  guest_booking_pending: {
    type: 'info',
    en: { title: 'Lesson request received', message: 'Your lesson request was received and is awaiting confirmation.' },
    ru: { title: 'Заявка на урок получена', message: 'Ваша заявка на урок получена и ожидает подтверждения.' },
  },
  guest_booking_confirmed: {
    type: 'success',
    en: { title: 'Lesson booking confirmed', message: 'Your lesson booking is confirmed.' },
    ru: { title: 'Бронирование урока подтверждено', message: 'Ваше бронирование урока подтверждено.' },
  },
  guest_booking_linked: {
    type: 'info',
    en: { title: 'Lesson linked to your account', message: 'A lesson booking is now linked to your account.' },
    ru: { title: 'Урок привязан к аккаунту', message: 'Бронирование урока привязано к вашему аккаунту.' },
  },
  guest_course_enrollment_confirmed: {
    type: 'success',
    en: { title: 'Course enrollment confirmed', message: 'Your course enrollment is confirmed.' },
    ru: { title: 'Запись на курс подтверждена', message: 'Ваша запись на курс подтверждена.' },
  },
  guest_course_enrollment_cancelled: {
    type: 'warning',
    en: { title: 'Course enrollment cancelled', message: 'Your course enrollment was cancelled.' },
    ru: { title: 'Запись на курс отменена', message: 'Ваша запись на курс отменена.' },
  },
  guest_course_enrollment_linked: {
    type: 'info',
    en: {
      title: 'Course enrollment linked',
      message: 'A course enrollment is now linked to your account.',
    },
    ru: {
      title: 'Запись на курс привязана',
      message: 'Запись на курс привязана к вашему аккаунту.',
    },
  },
  booking_proposal_created: {
    type: 'info',
    en: { title: 'Lesson proposal', message: 'A lesson proposal is waiting for your response.' },
    ru: { title: 'Предложение урока', message: 'Предложение урока ожидает вашего ответа.' },
  },
  booking_proposal_unavailable: {
    type: 'warning',
    en: { title: 'Lesson proposal unavailable', message: 'A lesson proposal is no longer available.' },
    ru: { title: 'Предложение урока недоступно', message: 'Предложение урока больше недоступно.' },
  },
  booking_proposal_accepted: {
    type: 'success',
    en: { title: 'Lesson proposal accepted', message: 'Your lesson proposal was accepted.' },
    ru: { title: 'Предложение урока принято', message: 'Ваше предложение урока принято.' },
  },
  booking_proposal_declined: {
    type: 'warning',
    en: { title: 'Lesson proposal declined', message: 'A lesson proposal was declined.' },
    ru: { title: 'Предложение урока отклонено', message: 'Предложение урока отклонено.' },
  },
  booking_proposal_cancelled: {
    type: 'warning',
    en: { title: 'Lesson proposal cancelled', message: 'A lesson proposal was cancelled.' },
    ru: { title: 'Предложение урока отменено', message: 'Предложение урока отменено.' },
  },
  booking_change_request_created: {
    type: 'info',
    en: { title: 'Change request received', message: 'Your lesson change request was received.' },
    ru: { title: 'Запрос на изменение получен', message: 'Ваш запрос на изменение урока получен.' },
  },
  booking_change_request_withdrawn: {
    type: 'info',
    en: { title: 'Change request withdrawn', message: 'Your lesson change request was withdrawn.' },
    ru: { title: 'Запрос на изменение отозван', message: 'Ваш запрос на изменение урока отозван.' },
  },
  booking_change_request_resolved: {
    type: 'info',
    en: { title: 'Change request resolved', message: 'Your lesson change request was resolved.' },
    ru: { title: 'Запрос на изменение рассмотрен', message: 'Ваш запрос на изменение урока рассмотрен.' },
  },
};

export function outboxMessageTemplate(templateId: string): OutboxMessageTemplate | undefined {
  return TEMPLATES[templateId];
}

export function renderOutboxMessage(
  templateId: string,
  locale: OutboxMessageLocale
): OutboxRenderedMessage | undefined {
  const template = TEMPLATES[templateId];
  if (!template) return undefined;
  return template[locale];
}

export function outboxMessageType(templateId: string): 'info' | 'success' | 'warning' {
  return TEMPLATES[templateId]?.type ?? 'info';
}

export function renderOutboundEmail(
  templateId: string,
  locale: OutboxMessageLocale | 'bilingual'
): { readonly subject: string; readonly text: string } | undefined {
  const ru = renderOutboxMessage(templateId, 'ru');
  const en = renderOutboxMessage(templateId, 'en');
  if (!ru || !en) return undefined;
  if (locale === 'ru') return { subject: ru.title, text: ru.message };
  if (locale === 'en') return { subject: en.title, text: en.message };
  return {
    subject: `${ru.title} / ${en.title}`,
    text: `${ru.title}\n${ru.message}\n\n${en.title}\n${en.message}`,
  };
}

export function outboxLocaleFromRenderInputs(
  renderInputs: Record<string, string | number | boolean>
): OutboxMessageLocale | undefined {
  const locale = renderInputs.locale;
  if (locale === 'ru' || locale === 'en') return locale;
  return undefined;
}
