import type { TranslationKey } from './i18n/translations';

/** Maps Open-Meteo WMO weather codes to a short human label. */
export function getWeatherConditionKey(code: number): TranslationKey {
  if (code === 0 || code === 1) return 'weatherSunny';
  if (code === 2 || code === 3) return 'weatherCloudy';
  if (code === 45 || code === 48) return 'weatherFog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'weatherRain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'weatherSnow';
  if (code >= 95) return 'weatherThunderstorm';
  return 'weatherCloudy';
}
