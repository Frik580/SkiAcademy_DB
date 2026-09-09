import { useEffect, useMemo, useRef, useState } from 'react';
import { InstructorIdSchema, type AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
import type { AvailabilitySlot, Course } from '../../types';
import { DEFAULT_LESSON_TIME_SLOTS } from '../../domain/availability';
import { logger } from '../../shared';
import { queryInstructorOccupancyReadModels } from '../../lib/canonical/canonicalReadModelClient';
import {
  addBookingLocalDays,
  getAvailableLessonStartTimes,
  mapInstructorOccupancyReadModelForBookingModal,
  normalizeBookingLocalDate,
} from '../bookings/instructorOccupancyForBookingModal';
import { resolveLessonBookingTimezone } from '../lesson-bookings/useLessonBookingReadSync';

export function filterOccupancyExcludingBooking(
  occupancy: readonly AdminPlannerOccupancyItem[],
  excludeBookingId: string
): AdminPlannerOccupancyItem[] {
  return occupancy.filter((item) => item.bookingId !== excludeBookingId);
}

export function filterAvailabilitySlotsExcludingBooking(
  slots: readonly AvailabilitySlot[],
  excludeBookingId: string
): AvailabilitySlot[] {
  return slots.filter((slot) => slot.bookingId !== excludeBookingId);
}

export function useRescheduleBookingAvailability(input: {
  readonly isOpen: boolean;
  readonly instructorId: string;
  readonly localDate: string;
  readonly durationHours: number;
  readonly excludeBookingId: string;
}) {
  const [instructorBookings, setInstructorBookings] = useState<AvailabilitySlot[]>([]);
  const [occupancyCourses, setOccupancyCourses] = useState<Course[]>([]);
  const [occupancyItems, setOccupancyItems] = useState<AdminPlannerOccupancyItem[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [occupancyLoadFailed, setOccupancyLoadFailed] = useState(false);
  const occupancyFetchVersionRef = useRef(0);
  const timezone = resolveLessonBookingTimezone();

  useEffect(() => {
    if (!input.isOpen || !input.instructorId || !input.localDate) {
      return;
    }

    const fetchVersion = ++occupancyFetchVersionRef.current;

    const fetchOccupancy = async () => {
      setIsLoadingBookings(true);
      setOccupancyLoadFailed(false);
      try {
        const selectedDate = normalizeBookingLocalDate(input.localDate);
        const [selectedDay, nextDay] = await Promise.all([
          queryInstructorOccupancyReadModels({
            scope: 'public_instructor_day',
            instructorId: InstructorIdSchema.parse(input.instructorId),
            localDate: selectedDate,
            timeZone: timezone,
          }),
          queryInstructorOccupancyReadModels({
            scope: 'public_instructor_day',
            instructorId: InstructorIdSchema.parse(input.instructorId),
            localDate: addBookingLocalDays(selectedDate, 1),
            timeZone: timezone,
          }),
        ]);
        if (fetchVersion !== occupancyFetchVersionRef.current) return;

        const occupancy = filterOccupancyExcludingBooking(
          [...selectedDay.item.occupancy, ...nextDay.item.occupancy],
          input.excludeBookingId
        );
        const mapped = mapInstructorOccupancyReadModelForBookingModal({
          ...selectedDay.item,
          occupancy,
        });
        setOccupancyItems(occupancy);
        setInstructorBookings(
          filterAvailabilitySlotsExcludingBooking(mapped.slots, input.excludeBookingId)
        );
        setOccupancyCourses(mapped.courses);
      } catch (error) {
        logger.error('Error fetching instructor occupancy for reschedule:', error);
        if (fetchVersion === occupancyFetchVersionRef.current) {
          setInstructorBookings([]);
          setOccupancyCourses([]);
          setOccupancyItems([]);
          setOccupancyLoadFailed(true);
        }
      } finally {
        if (fetchVersion === occupancyFetchVersionRef.current) {
          setIsLoadingBookings(false);
        }
      }
    };

    void fetchOccupancy();
  }, [
    input.excludeBookingId,
    input.instructorId,
    input.isOpen,
    input.localDate,
    timezone,
  ]);

  const availableSlots = useMemo((): string[] => {
    return getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: input.durationHours,
      localDate: input.localDate,
      instructorId: input.instructorId,
      occupancySlots: instructorBookings,
      occupancyCourses,
      occupancyItems,
      timeZone: timezone,
    });
  }, [
    instructorBookings,
    input.durationHours,
    input.instructorId,
    input.localDate,
    occupancyCourses,
    occupancyItems,
    timezone,
  ]);

  return {
    availableSlots,
    isLoadingBookings,
    occupancyLoadFailed,
  };
}
