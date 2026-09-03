import type { AdminPlannerOccupancyItem, InstructorOccupancyReadModel } from '@ski-academy/shared-domain';
import {
  fitsLessonDaySchedule,
  isBookingSlotInPast,
  timeStrToMinutes,
} from '../../domain/availability';
import { parseCourseDates } from '../../lib/i18n/courseDates';
import type { AvailabilitySlot, Course } from '../../types';

function durationHours(minutes: number): number {
  return Math.max(1, Math.round(minutes / 60));
}

export function normalizeScheduleTime(time: string): string {
  const [rawHour, rawMinute = '00'] = time.split(':');
  const hour = rawHour === '24' ? '00' : rawHour;
  return `${hour.padStart(2, '0')}:${rawMinute.padStart(2, '0')}`;
}

function localDateTime(seconds: number, timeZone: string): { date: string; time: string } {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(seconds * 1_000))
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: normalizeScheduleTime(`${values.hour}:${values.minute}`),
  };
}

function dayWindowSeconds(localDate: string, timeZone: string): { startsAt: number; endsAt: number } {
  const [year, month, day] = localDate.split('-').map(Number);
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(noonUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localNoon = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute)
  );
  const offsetMs = localNoon - noonUtc;
  const startsAt = Math.floor((Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs) / 1_000);
  const endsAt = startsAt + 24 * 60 * 60;
  return { startsAt, endsAt };
}

function occupancyPresentationForDay(
  item: AdminPlannerOccupancyItem,
  localDate: string,
  timeZone: string
) {
  const dayWindow = dayWindowSeconds(localDate, timeZone);
  const clipStartSeconds = Math.max(item.interval.startsAt.seconds, dayWindow.startsAt);
  const clipEndSeconds = Math.min(item.interval.endsAt.seconds, dayWindow.endsAt);
  const local = localDateTime(clipStartSeconds, timeZone);
  return {
    date: local.date,
    time: local.time,
    durationMinutes: Math.max(1, Math.round((clipEndSeconds - clipStartSeconds) / 60)),
  };
}

function courseDate(localDate: string): string {
  const [year, month, day] = localDate.split('-');
  return `${day}.${month}.${year}`;
}

export function mapInstructorOccupancyToAvailabilitySlots(
  occupancy: readonly AdminPlannerOccupancyItem[],
  displayLocalDate: string,
  timeZone: string
): AvailabilitySlot[] {
  return occupancy.flatMap<AvailabilitySlot>((item) => {
    if (item.occupancyKind === 'course_day') {
      return [];
    }
    const presentation = occupancyPresentationForDay(item, displayLocalDate, timeZone);
    if (presentation.date !== displayLocalDate) {
      return [];
    }
    if (item.occupancyKind === 'availability_block') {
      return [
        {
          bookingId: item.blockId ?? item.occupancyId,
          instructorId: item.instructorId,
          date: presentation.date,
          time: presentation.time,
          durationHours: durationHours(presentation.durationMinutes),
          slotType: item.blockKind === 'day_off' ? 'block' : 'block',
        },
      ];
    }
    return [
      {
        bookingId: item.bookingId ?? item.occupancyId,
        instructorId: item.instructorId,
        date: presentation.date,
        time: presentation.time,
        durationHours: durationHours(presentation.durationMinutes),
        slotType: 'lesson',
      },
    ];
  });
}

export function mapInstructorOccupancyToCourses(
  occupancy: readonly AdminPlannerOccupancyItem[],
  displayLocalDate: string,
  timeZone: string
): Course[] {
  return occupancy.flatMap<Course>((item) => {
    if (item.occupancyKind !== 'course_day' || !item.courseId) return [];
    const presentation = occupancyPresentationForDay(item, displayLocalDate, timeZone);
    if (presentation.date !== displayLocalDate) {
      return [];
    }
    const end = localDateTime(item.interval.endsAt.seconds, timeZone);
    const startDate = courseDate(presentation.date);
    const endDate = courseDate(end.date);
    const startTime = presentation.time;
    return [
      {
        id: item.occupancyId,
        title: item.displayTitle,
        duration: `${durationHours(presentation.durationMinutes)}h`,
        description: item.displayTitle,
        dates: `${startDate === endDate ? startDate : `${startDate} - ${endDate}`}, ${startTime} - ${end.time}`,
        instructorIds: [item.instructorId],
        availableSeats: 0,
        totalSeats: 0,
        price: 0,
        bgImageUrl: '',
      },
    ];
  });
}

export function mapInstructorOccupancyReadModelForBookingModal(
  model: InstructorOccupancyReadModel
): { slots: AvailabilitySlot[]; courses: Course[] } {
  return {
    slots: mapInstructorOccupancyToAvailabilitySlots(
      model.occupancy,
      model.localDate,
      model.timeZone
    ),
    courses: mapInstructorOccupancyToCourses(model.occupancy, model.localDate, model.timeZone),
  };
}

export function normalizeBookingLocalDate(dStr?: string | null): string {
  if (!dStr) return '';
  const trimmed = dStr.trim();
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return trimmed;
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Half-open interval overlap: [candidateStart, candidateEnd) vs [occupancyStart, occupancyEnd). */
export function lessonIntervalsOverlap(
  candidateStartMinutes: number,
  candidateEndMinutes: number,
  occupancyStartMinutes: number,
  occupancyEndMinutes: number
): boolean {
  return candidateStartMinutes < occupancyEndMinutes && candidateEndMinutes > occupancyStartMinutes;
}

export interface GetAvailableLessonStartTimesInput {
  candidateStarts: readonly string[];
  durationHours: number;
  localDate: string;
  instructorId?: string;
  occupancySlots: readonly AvailabilitySlot[];
  occupancyCourses: readonly Course[];
  now?: Date;
}

export function getAvailableLessonStartTimes(
  input: GetAvailableLessonStartTimesInput
): string[] {
  const {
    candidateStarts,
    durationHours,
    localDate,
    instructorId,
    occupancySlots,
    occupancyCourses,
    now = new Date(),
  } = input;
  const normDate = normalizeBookingLocalDate(localDate);

  return candidateStarts.filter((slot) => {
    if (!fitsLessonDaySchedule(slot, durationHours)) return false;
    if (normDate && isBookingSlotInPast(normDate, slot, now)) return false;
    if (!normDate) return true;

    const start = timeStrToMinutes(slot);
    const end = start + durationHours * 60;

    const hasOccupancyOverlap = occupancySlots.some((occupancy) => {
      if (normalizeBookingLocalDate(occupancy.date) !== normDate) return false;
      const occupancyStart = timeStrToMinutes(occupancy.time);
      const occupancyEnd = occupancyStart + occupancy.durationHours * 60;
      return lessonIntervalsOverlap(start, end, occupancyStart, occupancyEnd);
    });
    if (hasOccupancyOverlap) return false;

    if (instructorId) {
      const hasCourseOverlap = occupancyCourses.some((course) => {
        if (!course.instructorIds?.includes(instructorId)) return false;

        const {
          start: courseStart,
          end: courseEnd,
          startTime: courseStartTime,
          endTime: courseEndTime,
        } = parseCourseDates(course.dates);
        const courseStartDate = normalizeBookingLocalDate(toYmd(courseStart));
        const courseEndDate = normalizeBookingLocalDate(toYmd(courseEnd));
        if (normDate < courseStartDate || normDate > courseEndDate) return false;

        const courseStartMinutes = timeStrToMinutes(courseStartTime);
        const courseEndMinutes = timeStrToMinutes(courseEndTime);
        return lessonIntervalsOverlap(start, end, courseStartMinutes, courseEndMinutes);
      });
      if (hasCourseOverlap) return false;
    }

    return true;
  });
}

export function resolveLessonStartTimeSelection(
  selectedTime: string,
  availableStarts: readonly string[]
): string {
  if (!selectedTime) return '';
  if (availableStarts.includes(selectedTime)) return selectedTime;
  return '';
}
