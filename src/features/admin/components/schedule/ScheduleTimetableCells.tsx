import React from 'react';
import { Lock, Plus } from 'lucide-react';
import { parseCourseDates } from '../../../../app/providers/LanguageContext';
import { ScheduleCourseCell } from './ScheduleCourseCell';
import { ScheduleConflictDay } from './ScheduleConflictDay';
import { scheduleDayEvents, scheduleDayNeedsList } from './scheduleDayViewPlacement';
import { formatDateLocalYMD, hourToMinutes } from './scheduleUtils';
import { SCHEDULE_TIME_SLOTS } from './scheduleOverlap';
import { dayViewBookingForSlot, dayViewColSpanForBooking } from './scheduleDayViewPlacement';
import { ScheduleBookingCell } from './ScheduleBookingCell';
import type {
  ScheduleBooking,
  ScheduleClient,
  ScheduleCourse,
  ScheduleInstructor,
} from './scheduleContracts';
import { useScheduleTranslations } from './useScheduleTranslations';

export interface ScheduleTimetableCellsProps {
  instructor: ScheduleInstructor;
  selectedDate: string;
  instructors: ScheduleInstructor[];
  bookings: ScheduleBooking[];
  courses: ScheduleCourse[];
  usersList: ScheduleClient[];
  onOpenSlot: (instructor: ScheduleInstructor, time: string, booking?: ScheduleBooking) => void;
  onDeleteSlot: (id: string) => void;
}

export const ScheduleTimetableCells: React.FC<ScheduleTimetableCellsProps> = ({
  instructor: ins,
  selectedDate,
  instructors,
  bookings,
  courses,
  usersList,
  onOpenSlot,
  onDeleteSlot,
}) => {
  const { t } = useScheduleTranslations();
  const events = scheduleDayEvents(bookings, courses, ins.id, selectedDate);
  if (scheduleDayNeedsList(events)) {
    return (
      <td colSpan={SCHEDULE_TIME_SLOTS.length} className="p-2 align-top">
        <ScheduleConflictDay
          events={events}
          instructor={ins}
          instructors={instructors}
          bookings={bookings}
          usersList={usersList}
          onOpenSlot={onOpenSlot}
          onDeleteSlot={onDeleteSlot}
        />
      </td>
    );
  }
  const cells = [];
  let skipCount = 0;

  for (let i = 0; i < SCHEDULE_TIME_SLOTS.length; i++) {
    if (skipCount > 0) {
      skipCount--;
      continue;
    }

    const slotTime = SCHEDULE_TIME_SLOTS[i];

    // Find if this instructor has a course on this date covering the current slot
    const courseOverlap = (courses || []).find((c) => {
      if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
      const {
        start: cStart,
        end: cEnd,
        startTime: cStartTime,
        endTime: cEndTime,
      } = parseCourseDates(c.dates);
      const startStr = formatDateLocalYMD(cStart);
      const endStr = formatDateLocalYMD(cEnd);

      if (selectedDate < startStr || selectedDate > endStr) return false;

      const cStartMin = hourToMinutes(cStartTime);
      const cEndMin = hourToMinutes(cEndTime);
      const slotStart = hourToMinutes(slotTime);
      const slotEnd = slotStart + 60;

      return slotStart < cEndMin && slotEnd > cStartMin;
    });

    if (courseOverlap) {
      // Calculate consecutive slots that overlap with this course
      let span = 1;
      for (let j = i + 1; j < SCHEDULE_TIME_SLOTS.length; j++) {
        const checkSlotTime = SCHEDULE_TIME_SLOTS[j];
        const {
          start: cStart,
          end: cEnd,
          endTime: cEndTime,
        } = parseCourseDates(courseOverlap.dates);
        const startStr = formatDateLocalYMD(cStart);
        const endStr = formatDateLocalYMD(cEnd);

        if (selectedDate >= startStr && selectedDate <= endStr) {
          const cEndMin = hourToMinutes(cEndTime);
          const slotStart = hourToMinutes(checkSlotTime);

          if (slotStart < cEndMin) {
            span++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      span = Math.min(span, SCHEDULE_TIME_SLOTS.length - i);
      skipCount = span - 1;

      cells.push(
        <td
          key={slotTime}
          colSpan={span}
          className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40"
        >
          <ScheduleCourseCell
            course={courseOverlap}
            instructor={ins}
            instructors={instructors}
            bookings={bookings}
            usersList={usersList}
          />
        </td>
      );
    } else {
      const slotBooking = dayViewBookingForSlot(bookings, ins.id, selectedDate, slotTime, i);

      if (slotBooking?.startsHere) {
        const span = dayViewColSpanForBooking(slotBooking.booking, i);
        skipCount = span - 1;

        cells.push(
          <td
            key={slotTime}
            colSpan={span}
            className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40"
          >
            <ScheduleBookingCell
              booking={slotBooking.booking}
              instructor={ins}
              usersList={usersList}
              onOpen={onOpenSlot}
              onDelete={onDeleteSlot}
            />
          </td>
        );
      } else if (slotBooking) {
        continue;
      } else if (!ins.isAvailable) {
        cells.push(
          <td
            key={slotTime}
            className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center bg-slate-50/20 dark:bg-slate-950/5 select-none"
          >
            <div
              className="w-full h-11 border border-slate-100/40 dark:border-slate-800/20 bg-slate-100/30 dark:bg-slate-900/10 rounded-xl flex items-center justify-center text-slate-350 dark:text-slate-650"
              title={t('instructorUnavailableTitle')}
            >
              <Lock className="w-3 h-3 text-slate-300 dark:text-slate-700 opacity-60" />
            </div>
          </td>
        );
      } else {
        cells.push(
          <td
            key={slotTime}
            className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center"
          >
            <button
              onClick={() => onOpenSlot(ins, slotTime)}
              className="w-full h-11 border border-dashed border-slate-200/60 dark:border-slate-800/40 hover:border-accent hover:bg-accent-muted rounded-xl transition flex items-center justify-center cursor-pointer group animate-fade-in"
              title={t('manageSlot')}
            >
              <Plus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 group-hover:text-accent transition duration-200" />
            </button>
          </td>
        );
      }
    }
  }
  return cells;
};
