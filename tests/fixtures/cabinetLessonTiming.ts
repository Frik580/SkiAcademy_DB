import { resolveBookingScheduleFromCalendarInput } from '@ski-academy/shared-domain/canonical/bookingCreation';
import { IanaTimeZoneSchema } from '@ski-academy/shared-domain/canonical/primitives';

/** Canonical timing for existing wall-clock lesson fixtures. */
export function cabinetLessonTiming(date: string, time: string, durationHours: number) {
  const timeZone = IanaTimeZoneSchema.parse('Asia/Almaty');
  const { interval } = resolveBookingScheduleFromCalendarInput(
    { localDate: date, localTime: time.slice(0, 5), durationMinutes: durationHours * 60 },
    timeZone
  );
  return { ...interval, timeZone };
}
