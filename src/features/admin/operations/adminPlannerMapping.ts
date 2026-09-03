import type { AdminPlannerOccupancyItem, AdminPlannerReadModel } from '@ski-academy/shared-domain';
import type { Booking, Course, Instructor } from '../../../types';
import { plannerDayWindow } from './adminPlannerDayWindow';

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

function occupancyPresentationForDay(item: AdminPlannerOccupancyItem, localDate: string) {
  const dayWindow = plannerDayWindow(localDate, item.timeZone);
  const clipStartSeconds = Math.max(item.interval.startsAt.seconds, dayWindow.startsAt.seconds);
  const clipEndSeconds = Math.min(item.interval.endsAt.seconds, dayWindow.endsAt.seconds);
  const local = localDateTime(clipStartSeconds, item.timeZone);
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

export function mapPlannerInstructors(model: AdminPlannerReadModel): Instructor[] {
  return model.instructors.map((instructor) => ({
    id: instructor.instructorId,
    name: instructor.name,
    specialty: instructor.specialty ?? 'ski',
    rating: 0,
    reviewsCount: 0,
    languages: [],
    experienceYears: 0,
    bio: '',
    avatarUrl: instructor.avatarUrl ?? '',
    pricePerHour: instructor.pricePerHourKZT ?? 0,
    pricePerHourKZT: instructor.pricePerHourKZT,
    isAvailable: instructor.isAvailable,
  }));
}

export function mapPlannerOccupancyToBookings(
  occupancy: readonly AdminPlannerOccupancyItem[],
  displayLocalDate?: string
): Booking[] {
  return occupancy.flatMap<Booking>((item) => {
    const presentation = displayLocalDate
      ? occupancyPresentationForDay(item, displayLocalDate)
      : {
          date: item.localDate,
          time: normalizeScheduleTime(item.localTime),
          durationMinutes: item.durationMinutes,
        };
    const status: Booking['status'] =
      item.lifecycleStatus && item.lifecycleStatus !== 'no_show'
        ? item.lifecycleStatus
        : 'confirmed';
    if (item.occupancyKind === 'availability_block') {
      return [
        {
          id: item.blockId ?? item.occupancyId,
          userId: item.blockKind === 'day_off' ? 'system_block_day_off' : 'system_block_break',
          instructorId: item.instructorId,
          instructorName: item.displayTitle,
          instructorAvatar: '',
          date: presentation.date,
          time: presentation.time,
          durationHours: durationHours(presentation.durationMinutes),
          totalPrice: 0,
          status: 'confirmed',
          ...(item.notes ? { notes: item.notes } : {}),
        },
      ];
    }
    if (item.occupancyKind === 'course_day') {
      return [];
    }
    return [
      {
        id: item.bookingId ?? item.occupancyId,
        userId: item.payerAccountId ?? item.participantId ?? item.occupancyId,
        instructorId: item.instructorId,
        instructorName: item.displayTitle,
        instructorAvatar: '',
        date: presentation.date,
        time: presentation.time,
        durationHours: durationHours(presentation.durationMinutes),
        totalPrice: 0,
        status,
        ...(item.difficulty ? { difficulty: item.difficulty } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
        isGuest: item.isGuest,
        guestName: item.isGuest ? item.displayTitle : undefined,
      },
    ];
  });
}

export function mapPlannerCourses(
  occupancy: readonly AdminPlannerOccupancyItem[],
  displayLocalDate?: string
): Course[] {
  return occupancy.flatMap<Course>((item) => {
    if (item.occupancyKind !== 'course_day' || !item.courseId) return [];
    const presentation = displayLocalDate
      ? occupancyPresentationForDay(item, displayLocalDate)
      : undefined;
    const end = localDateTime(item.interval.endsAt.seconds, item.timeZone);
    const startDate = courseDate(presentation?.date ?? item.localDate);
    const endDate = courseDate(end.date);
    const startTime = presentation?.time ?? normalizeScheduleTime(item.localTime);
    return [
      {
        id: item.occupancyId,
        title: item.displayTitle,
        duration: `${durationHours(presentation?.durationMinutes ?? item.durationMinutes)}h`,
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

export function occupancyForId(
  occupancy: readonly AdminPlannerOccupancyItem[],
  occupancyId: string
): AdminPlannerOccupancyItem | undefined {
  return occupancy.find(
    (item) =>
      item.occupancyId === occupancyId ||
      item.bookingId === occupancyId ||
      item.blockId === occupancyId ||
      item.courseDayId === occupancyId
  );
}

export function occupancyRevision(
  occupancy: readonly AdminPlannerOccupancyItem[],
  occupancyId: string
): number | undefined {
  return occupancyForId(occupancy, occupancyId)?.revision;
}
