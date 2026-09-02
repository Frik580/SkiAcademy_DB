import type { Language } from '../../../../lib/i18n/translations';

export function formatDateLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hourToMinutes(hStr: string): number {
  const [h, m] = hStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function normalizeScheduleTime(time: string): string {
  const [rawHour, rawMinute = '00'] = time.split(':');
  const hour = rawHour === '24' ? '00' : rawHour;
  return `${hour.padStart(2, '0')}:${rawMinute.padStart(2, '0')}`;
}

export function getWeekRange(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start, end };
}

export function getSpecialtyLabel(spec: string, language: Language): string {
  if (language === 'ru') {
    switch (spec) {
      case 'ski':
        return 'Лыжи';
      case 'snowboard':
        return 'Сноуборд';
      case 'both':
        return 'Оба';
      default:
        return spec;
    }
  }
  switch (spec) {
    case 'ski':
      return 'Ski';
    case 'snowboard':
      return 'Snowboard';
    case 'both':
      return 'Both';
    default:
      return spec;
  }
}
