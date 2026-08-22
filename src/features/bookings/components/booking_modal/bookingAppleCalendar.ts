export function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBeforeDay(a: Date, b: Date): boolean {
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return aMid < bMid;
}

export function getWeekStartDay(locale: string): 0 | 1 {
  return locale.startsWith('ru') ? 1 : 0;
}

export function getWeekdayLabels(locale: string): string[] {
  const weekStart = getWeekStartDay(locale);
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const labels: string[] = [];
  const anchor = new Date(2024, 0, 7 + weekStart);

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() + i);
    labels.push(formatter.format(day).replace(/\.$/, ''));
  }

  return labels;
}

export interface CalendarCell {
  date: Date;
  ymd: string;
  inMonth: boolean;
}

export function buildCalendarMonth(viewMonth: Date, locale: string): CalendarCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const weekStart = getWeekStartDay(locale);
  const startOffset = (firstOfMonth.getDay() - weekStart + 7) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({
      date,
      ymd: formatYmd(date),
      inMonth: date.getMonth() === month,
    });
  }

  return cells;
}

export function formatDisplayDate(value: string, locale: string): string {
  const parsed = parseYmd(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthTitle(viewMonth: Date, locale: string): string {
  const raw = viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function clampDateParts(
  year: number,
  month: number,
  day: number,
  minDate: Date | null
): { year: number; month: number; day: number } {
  const maxDay = daysInMonth(year, month);
  const nextDay = Math.min(day, maxDay);
  const nextDate = new Date(year, month, nextDay);

  if (minDate) {
    const minMid = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    if (nextDate.getTime() < minMid.getTime()) {
      return {
        year: minMid.getFullYear(),
        month: minMid.getMonth(),
        day: minMid.getDate(),
      };
    }
  }

  return { year, month, day: nextDay };
}

export function getMonthWheelLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  return Array.from({ length: 12 }, (_, month) => {
    const label = formatter.format(new Date(2024, month, 1));
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
}

export function getDateWheelYearRange(
  minDate: Date | null,
  today: Date
): { minYear: number; maxYear: number } {
  const minYear = minDate?.getFullYear() ?? today.getFullYear();
  const maxYear = Math.max(minYear + 1, today.getFullYear() + 1);
  return { minYear, maxYear };
}
