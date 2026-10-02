import type { TranslationKey } from '../../../lib/i18n/translations';
import { getWeatherConditionKey } from '../../../shared/weatherCondition';
import type { TemperatureUnit } from './conditions';

export function temperatureValue(celsius: number, unit: TemperatureUnit): number {
  return Math.round(unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius);
}

export function measurementValue(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value);
}

export function weatherConditionKey(code: number | null): TranslationKey | null {
  if (code === 0 || code === 1) return 'conditionsClear';
  if (
    code !== null &&
    [
      2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95,
      96, 99,
    ].includes(code)
  ) {
    return getWeatherConditionKey(code);
  }
  return null;
}

/** Visibility bands in metres: >=10 km excellent, >=5 km good, >=1 km moderate. */
export function visibilityKey(metres: number | null): TranslationKey | null {
  if (metres === null || !Number.isFinite(metres) || metres < 0) return null;
  if (metres >= 10000) return 'conditionsVisibilityExcellent';
  if (metres >= 5000) return 'conditionsVisibilityGood';
  if (metres >= 1000) return 'conditionsVisibilityModerate';
  return 'conditionsVisibilityPoor';
}

export function updatedTime(isoTime: string | null, language: string): string | null {
  if (!isoTime) return null;
  const date = new Date(isoTime);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  }).format(date);
}
