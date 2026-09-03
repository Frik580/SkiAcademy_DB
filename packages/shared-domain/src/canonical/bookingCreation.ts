import type { CommandCalendarInput } from './commands/commandContext';
import {
  KztMinorUnitsSchema,
  TimeIntervalSchema,
  timestampFromDate,
  type IanaTimeZone,
  type KztMinorUnits,
  type TimeInterval,
} from './primitives';

export interface InstructorTariffInput {
  readonly pricePerHour?: number;
  readonly pricePerHourKZT?: number;
}

export interface ResolvedBookingSchedule {
  readonly interval: TimeInterval;
  readonly durationMinutes: number;
}

function zonedPartsAt(instantMs: number, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(instantMs));
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  // Some ICU builds still emit hour 24 at local midnight with the previous calendar date.
  if (values.hour === 24) {
    const next = new Date(Date.UTC(values.year, values.month - 1, values.day + 1));
    values.year = next.getUTCFullYear();
    values.month = next.getUTCMonth() + 1;
    values.day = next.getUTCDate();
    values.hour = 0;
  }
  return values;
}

export function localCalendarInputToUtcDate(
  calendarInput: CommandCalendarInput,
  timeZone: IanaTimeZone
): Date {
  const [year, month, day] = calendarInput.localDate.split('-').map(Number);
  const [hour, minute] = calendarInput.localTime.split(':').map(Number);
  const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let guessMs = targetLocalMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedPartsAt(guessMs, timeZone);
    const observedLocalMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0
    );
    guessMs += targetLocalMs - observedLocalMs;
  }

  return new Date(guessMs);
}

export function resolveBookingScheduleFromCalendarInput(
  calendarInput: CommandCalendarInput,
  timeZone: IanaTimeZone
): ResolvedBookingSchedule {
  const startsAtDate = localCalendarInputToUtcDate(calendarInput, timeZone);
  const endsAtDate = new Date(startsAtDate.getTime() + calendarInput.durationMinutes * 60_000);
  const interval = TimeIntervalSchema.parse({
    startsAt: timestampFromDate(startsAtDate),
    endsAt: timestampFromDate(endsAtDate),
  });
  return {
    interval,
    durationMinutes: calendarInput.durationMinutes,
  };
}

export function resolveInstructorHourlyRateKzt(tariff: InstructorTariffInput): KztMinorUnits {
  if (tariff.pricePerHourKZT !== undefined) {
    if (!Number.isFinite(tariff.pricePerHourKZT) || tariff.pricePerHourKZT <= 0) {
      throw new Error('Invalid instructor hourly rate');
    }
    return KztMinorUnitsSchema.parse(Math.round(tariff.pricePerHourKZT));
  }
  if (tariff.pricePerHour === undefined || !Number.isFinite(tariff.pricePerHour) || tariff.pricePerHour <= 0) {
    throw new Error('Invalid instructor hourly rate');
  }
  return KztMinorUnitsSchema.parse(Math.round(tariff.pricePerHour * 100));
}

export function calculateIndividualBookingPriceKzt(
  hourlyRateKzt: KztMinorUnits,
  durationMinutes: number
): KztMinorUnits {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Invalid booking duration');
  }
  return KztMinorUnitsSchema.parse(Math.round((hourlyRateKzt * durationMinutes) / 60));
}
