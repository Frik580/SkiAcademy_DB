export const ADMIN_DEFAULT_TIMEZONE = 'Asia/Almaty';

export function resolveAdminTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ADMIN_DEFAULT_TIMEZONE;
  } catch {
    return ADMIN_DEFAULT_TIMEZONE;
  }
}

export function localDateTimeFromTimestamp(
  seconds: number,
  timeZone: string
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(seconds * 1_000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour === '24' ? '00' : values.hour}:${values.minute}`,
  };
}
