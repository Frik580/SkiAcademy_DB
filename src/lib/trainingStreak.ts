import { ActivityLog, Booking } from '../types';

const toIsoWeekKey = (input: string | Date): string | null => {
  const d =
    input instanceof Date
      ? new Date(input)
      : new Date(input.includes('T') ? input : `${input}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

export const getTrainingStreakWeeks = (
  bookings: Booking[],
  activityLogs: ActivityLog[] = []
): number => {
  const weekKeys = new Set<string>();

  bookings
    .filter((b) => b.status === 'completed' && !b.isDeleted)
    .forEach((b) => {
      const key = toIsoWeekKey(b.date);
      if (key) weekKeys.add(key);
    });

  activityLogs
    .filter((log) => log.type === 'booking_completed')
    .forEach((log) => {
      const key = toIsoWeekKey(log.timestamp);
      if (key) weekKeys.add(key);
    });

  if (weekKeys.size === 0) return 0;

  let streak = 0;
  const anchor = new Date();
  for (let offset = 0; offset < 104; offset++) {
    const check = new Date(anchor);
    check.setDate(anchor.getDate() - offset * 7);
    const key = toIsoWeekKey(check);
    if (!key) break;
    if (weekKeys.has(key)) {
      streak++;
      continue;
    }
    if (offset === 0) continue;
    break;
  }
  return streak;
};
