import type { CommandCalendarInput } from '@ski-academy/shared-domain';

export function mapLessonBookingCalendarInput(input: {
  readonly localDate: string;
  readonly localTime: string;
  readonly durationHours: number;
}): CommandCalendarInput {
  return {
    localDate: input.localDate,
    localTime: input.localTime,
    durationMinutes: Math.round(input.durationHours * 60),
  };
}

export function canonicalTimestampToLocalParts(
  seconds: number,
  nanoseconds: number,
  timeZone: string
): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(seconds * 1000 + nanoseconds / 1_000_000));
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const date = `${values.year}-${values.month}-${values.day}`;
  const hour = values.hour === '24' ? '00' : values.hour;
  const time = `${hour}:${values.minute}`;
  return { date, time };
}
