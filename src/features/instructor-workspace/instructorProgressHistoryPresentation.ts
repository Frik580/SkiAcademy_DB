import type { ParticipantProgressHistoryItem } from '@ski-academy/shared-domain';
import { getSkillItemTitle, type SkillConfig } from '../../domain/achievements';
import { formatSkillScore } from '../../lib/i18n/skillScore';
import type { Language } from '../../lib/i18n/translations';

export function presentProgressHistory(
  items: readonly ParticipantProgressHistoryItem[],
  config: SkillConfig,
  language: Language,
  authors: readonly { readonly id: string; readonly name: string }[] = []
) {
  const skill = (id: string) => config.items.find((item) => item.id === id);
  const title = (id: string) => {
    const item = skill(id);
    return item ? getSkillItemTitle(item, language) : id;
  };
  const score = (id: string, value: number | undefined) => {
    const item = skill(id);
    // Retired/unknown skills have no known maximum; never invent a denominator.
    if (!item)
      return value === undefined
        ? language === 'ru'
          ? 'Нет оценки'
          : 'Not evaluated'
        : String(value);
    return formatSkillScore(
      { hasScore: value !== undefined, earned: value ?? 0, maxPoints: item.maxPoints },
      language
    );
  };
  return items.map((item) => {
    const milliseconds = item.at.seconds * 1000 + item.at.nanoseconds / 1e6;
    const date = new Date(milliseconds);
    return {
      id: item.id,
      instructorId: item.instructorId,
      authorName: item.instructorId
        ? authors.find((author) => author.id === item.instructorId)?.name.trim()
        : undefined,
      dateTime: Number.isNaN(date.getTime()) ? undefined : date.toISOString(),
      dateLabel: Number.isNaN(date.getTime())
        ? undefined
        : new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
            timeZone: 'Asia/Almaty',
            year: 'numeric',
            month: language === 'ru' ? 'long' : 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(date),
      scores: item.skillChanges.map((change) => ({
        skillId: change.skillId,
        title: title(change.skillId),
        previous: score(change.skillId, change.previousScore),
        next: score(change.skillId, change.newScore),
      })),
      comments: item.commentChanges.map((change) => ({
        skillId: change.skillId,
        title: title(change.skillId),
        previousText: change.previousText,
        newText: change.newText,
        label:
          change.newText === undefined
            ? ('historyCommentDeleted' as const)
            : change.previousText === undefined
              ? ('historyCommentAdded' as const)
              : ('historyCommentChanged' as const),
      })),
    };
  });
}
