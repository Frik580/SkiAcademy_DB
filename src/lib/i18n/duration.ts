import { russianPlural } from './pluralize';

export const formatDurationLabel = (hours: number, lang: 'en' | 'ru'): string => {
  if (lang === 'en') {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (hours % 1 !== 0) {
    return `${hours} часа`;
  }
  return `${hours} ${russianPlural(hours, ['час', 'часа', 'часов'])}`;
};
