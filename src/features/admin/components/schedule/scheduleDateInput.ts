import { formatDateLocalYMD } from './scheduleUtils';

export function parsePlannerLocalDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function plannerLocalDateFromDate(date: Date): string {
  return formatDateLocalYMD(date);
}
