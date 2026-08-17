import { useState, useEffect, useMemo } from 'react';
import { AvailabilitySlot, Booking, Course } from '../../../types';
import { useNotifications } from '../../../features/notifications';
import { parseCourseDates, useLanguage } from '../../../app/providers/LanguageContext';
import {
  DEFAULT_LESSON_TIME_SLOTS,
  fitsLessonDaySchedule,
  isBookingSlotInPast,
  timeStrToMinutes,
  toLocalDateStr,
} from '../../../lib/availabilitySlots';
import { logger } from '../../../lib/logger';
import { getInstructorAvailabilitySlots } from '../../../features/bookings';

interface UseRescheduleBookingOptions {
  bookings: Booking[];
  courses?: Course[];
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
}

export function useRescheduleBooking({
  bookings,
  courses = [],
  onReschedule,
}: UseRescheduleBookingOptions) {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();

  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string>('');
  const [newTime, setNewTime] = useState<string>('09:00');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleInstructorBookings, setRescheduleInstructorBookings] = useState<
    AvailabilitySlot[]
  >([]);
  const [isLoadingInstructorBookings, setIsLoadingInstructorBookings] = useState<boolean>(false);

  const openReschedule = (booking: Booking) => {
    setRescheduleId(booking.id);
    setNewDate(booking.date);
    setNewTime(booking.time);
  };

  const closeReschedule = () => setRescheduleId(null);

  useEffect(() => {
    if (!rescheduleId) {
      setRescheduleInstructorBookings([]);
      return;
    }
    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    const fetchInstructorBookings = async () => {
      setIsLoadingInstructorBookings(true);
      try {
        const slotsMap = new Map<string, AvailabilitySlot>();

        const remoteSlots = await getInstructorAvailabilitySlots(currentBooking.instructorId);
        if (remoteSlots.length > 0) {
          remoteSlots.forEach((b) => {
            if (b.bookingId !== rescheduleId) {
              const key = b.bookingId || `${b.instructorId}_${b.date}_${b.time}`;
              slotsMap.set(key, b);
            }
          });
        }

        setRescheduleInstructorBookings(Array.from(slotsMap.values()));
      } catch (err) {
        logger.error('Error fetching instructor bookings for reschedule:', err);
      } finally {
        setIsLoadingInstructorBookings(false);
      }
    };

    fetchInstructorBookings();
  }, [rescheduleId, bookings]);

  const availableSlots = useMemo((): string[] => {
    const currentBooking = rescheduleId ? bookings.find((b) => b.id === rescheduleId) : null;
    if (!currentBooking || !newDate) return [];

    const duration = currentBooking.durationHours;

    return DEFAULT_LESSON_TIME_SLOTS.filter((slot) => {
      if (!fitsLessonDaySchedule(slot, duration)) return false;
      if (isBookingSlotInPast(newDate, slot)) return false;

      const start = timeStrToMinutes(slot);
      const end = start + duration * 60;

      for (const b of rescheduleInstructorBookings) {
        if (b.date !== newDate) continue;
        const bStart = timeStrToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;

        if (start < bEnd && end > bStart) {
          return false;
        }
      }

      if (currentBooking.instructorId) {
        const hasCourseOverlap = courses.some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId))
            return false;

          const {
            start: cStart,
            end: cEnd,
            startTime: cStartTime,
            endTime: cEndTime,
          } = parseCourseDates(course.dates);
          const startStr = toLocalDateStr(cStart);
          const endStr = toLocalDateStr(cEnd);

          if (newDate < startStr || newDate > endStr) return false;

          const cStartMin = timeStrToMinutes(cStartTime);
          const cEndMin = timeStrToMinutes(cEndTime);
          return start < cEndMin && end > cStartMin;
        });

        if (hasCourseOverlap) return false;
      }

      return true;
    });
  }, [rescheduleId, bookings, newDate, rescheduleInstructorBookings, courses]);

  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(newTime)) {
      setNewTime(availableSlots[0]);
    }
  }, [availableSlots, newTime]);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleId || !newDate) return;

    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    setIsRescheduling(true);
    try {
      const timeToMinutes = (tStr: string): number => {
        const [h, m] = tStr.split(':').map(Number);
        return h * 60 + m;
      };

      const checkOverlap = (
        targetDate: string,
        targetTime: string,
        duration: number,
        existing: AvailabilitySlot[]
      ): AvailabilitySlot | null => {
        const start = timeToMinutes(targetTime);
        const end = start + duration * 60;

        for (const b of existing) {
          if (b.date !== targetDate) continue;
          const bStart = timeToMinutes(b.time);
          const bEnd = bStart + b.durationHours * 60;

          if (start < bEnd && end > bStart) {
            return b;
          }
        }
        return null;
      };

      const activeBookings = (
        await getInstructorAvailabilitySlots(currentBooking.instructorId, newDate)
      ).filter((booking) => booking.bookingId !== rescheduleId);
      const conflictBooking = checkOverlap(
        newDate,
        newTime,
        currentBooking.durationHours,
        activeBookings
      );

      if (conflictBooking) {
        addNotification(
          'error',
          t('instructorBusy'),
          t('instructorBookingConflictDesc')
            .replace('{instructorName}', currentBooking.instructorName)
            .replace('{date}', newDate)
            .replace('{time}', newTime)
        );
        setIsRescheduling(false);
        return;
      }

      let conflictCourse: Course | null = null;
      if (currentBooking.instructorId) {
        const toYMD = (d: Date): string => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const start = timeToMinutes(newTime);
        const end = start + currentBooking.durationHours * 60;

        for (const course of courses) {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId))
            continue;

          const {
            start: cStart,
            end: cEnd,
            startTime: cStartTime,
            endTime: cEndTime,
          } = parseCourseDates(course.dates);
          const startStr = toYMD(cStart);
          const endStr = toYMD(cEnd);

          if (newDate >= startStr && newDate <= endStr) {
            const cStartMin = timeToMinutes(cStartTime);
            const cEndMin = timeToMinutes(cEndTime);

            if (start < cEndMin && end > cStartMin) {
              conflictCourse = course;
              break;
            }
          }
        }
      }

      if (conflictCourse) {
        addNotification(
          'error',
          t('instructorReserved'),
          t('instructorCourseConflictDesc')
            .replace('{instructorName}', currentBooking.instructorName)
            .replace('{courseTitle}', conflictCourse.title)
            .replace('{date}', newDate)
            .replace('{courseDates}', conflictCourse.dates)
        );
        setIsRescheduling(false);
        return;
      }

      await onReschedule(rescheduleId, newDate, newTime);
      addNotification('success', t('lessonRescheduled'), t('lessonRescheduledDesc'));
      setRescheduleId(null);
    } catch {
      addNotification('error', t('updateFailed'), t('updateFailedDesc'));
    } finally {
      setIsRescheduling(false);
    }
  };

  return {
    rescheduleId,
    openReschedule,
    closeReschedule,
    newDate,
    setNewDate,
    newTime,
    setNewTime,
    availableSlots,
    isLoadingInstructorBookings,
    isRescheduling,
    handleRescheduleSubmit,
    minBookingDateStr: toLocalDateStr(),
  };
}
