import type { QueryInstructorParticipantRecommendationHistoryReadModelsResult } from '@ski-academy/shared-domain';
import type { Language } from '../../lib/i18n/translations';
import type { InstructorRecommendationHistoryInput } from './instructorLessonContextContracts';

export function presentRecommendationHistory(
  items: QueryInstructorParticipantRecommendationHistoryReadModelsResult['items'],
  language: Language,
  authors: InstructorRecommendationHistoryInput['authors'] = []
) {
  const names = new Map(authors.map(({ id, name }) => [id, name.trim()]));
  const format = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: language === 'ru' ? 'long' : 'short',
    day: 'numeric',
  });
  return items.map(({ feedbackId, instructorId, lessonDate, lessonStartsAt, items }) => {
    const date = lessonDate
      ? new Date(`${lessonDate}T00:00:00Z`)
      : new Date(lessonStartsAt.seconds * 1000 + lessonStartsAt.nanoseconds / 1e6);
    const validDate = Number.isFinite(date.getTime());
    return {
      id: feedbackId,
      authorName: names.get(instructorId),
      dateTime: validDate ? (lessonDate ?? date.toISOString()) : undefined,
      dateLabel: validDate ? format.format(date) : undefined,
      items,
    };
  });
}
