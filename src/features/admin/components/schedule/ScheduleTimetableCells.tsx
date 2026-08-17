import React from 'react';
import { BookOpen, Clock, Lock, Plus } from 'lucide-react';
import type { Booking, Course, Instructor, UserProfile } from '../../../../types';
import {
  useLanguage,
  translateCourse,
  parseCourseDates,
} from '../../../../app/providers/LanguageContext';
import { useNotifications } from '../../../../features/notifications';
import { formatDateLocalYMD, hourToMinutes } from './scheduleUtils';
import { SCHEDULE_TIME_SLOTS } from './scheduleOverlap';
import { ScheduleBookingCell } from './ScheduleBookingCell';

export interface ScheduleTimetableCellsProps {
  instructor: Instructor;
  selectedDate: string;
  instructors: Instructor[];
  bookings: Booking[];
  courses: Course[];
  usersList: UserProfile[];
  onOpenSlot: (instructor: Instructor, time: string, booking?: Booking) => void;
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
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
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

      const courseBookings = bookings.filter(
        (b) =>
          b.instructorId === `course_${courseOverlap.id}` &&
          b.status !== 'cancelled' &&
          !b.isDeleted
      );
      const bookedCount = courseBookings.length;
      const enrolledNames = courseBookings
        .map((b) => {
          const u = usersList.find((usr) => usr.uid === b.userId);
          return (
            u?.displayName ||
            u?.email ||
            b.guestName ||
            (b.isGuest || b.userId?.startsWith('guest_')
              ? b.guestName
                ? `${b.guestName} (${t('guestBadge')})`
                : t('guestBadge')
              : b.userId)
          );
        })
        .filter(Boolean);

      cells.push(
        <td
          key={slotTime}
          colSpan={span}
          className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40"
        >
          <div
            onClick={() => {
              const otherGuides = courseOverlap.instructorIds?.filter((id) => id !== ins.id) || [];
              const guideNamesStr = otherGuides
                .map((id) => instructors.find((i) => i.id === id)?.name || id)
                .join(', ');
              const guidesDetail = guideNamesStr
                ? ` ${t('withGuidesPrefix')} ${guideNamesStr}${t('withGuidesSuffix')}`
                : '';
              const enrolledDetailsStr =
                enrolledNames.length > 0
                  ? `\n${t('clientsEnrolledPrefix')} ${enrolledNames.join(', ')}`
                  : `\n${t('noClientsEnrolled')}`;
              addNotification(
                'info',
                courseOverlap.title,
                `${t('groupCourseInfoPrefix')} "${courseOverlap.title}"${guidesDetail}. ${t('groupCourseScheduled')}: ${courseOverlap.dates}\n${t('groupCourseSeats')}: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}` +
                  enrolledDetailsStr
              );
            }}
            className="relative group/cell min-h-[44px] h-auto border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1.5 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
          >
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-violet-500 shrink-0" />
                <span className="truncate">{translateCourse(courseOverlap, language).title}</span>
                <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0">
                  {t('courseLabelShort')}
                </span>
              </div>
            </div>
            <div className="text-[10px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
              <Clock className="w-3.5 h-3.5 shrink-0 text-violet-400 dark:text-violet-500" />
              <span>
                {(() => {
                  const { startTime, endTime } = parseCourseDates(courseOverlap.dates);
                  return `${startTime} - ${endTime}`;
                })()}
              </span>
            </div>
            {/* Seats Info */}
            <div className="text-[9px] font-mono mt-1 text-violet-700 dark:text-violet-300 border-t border-violet-200/50 dark:border-violet-800/40 pt-1 flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span>{t('seatsLabel')}</span>
                <span className="font-bold">
                  {courseOverlap.availableSeats} / {courseOverlap.totalSeats} ({bookedCount}{' '}
                  {t('bookedLabel')})
                </span>
              </div>
              {enrolledNames.length > 0 && (
                <div
                  className="text-[8px] leading-tight text-violet-600 dark:text-violet-400 mt-0.5 max-w-full truncate"
                  title={enrolledNames.join(', ')}
                >
                  <span className="font-bold">{t('clientsLabel')}</span> {enrolledNames.join(', ')}
                </div>
              )}
            </div>
          </div>
        </td>
      );
    } else {
      // Find if a booking starts exactly at this slotTime
      const b = bookings.find(
        (book) =>
          book.instructorId === ins.id &&
          book.date === selectedDate &&
          book.status !== 'cancelled' &&
          !book.isDeleted &&
          book.time === slotTime
      );

      if (b) {
        // Determine how many slots it covers
        const span = Math.min(b.durationHours, SCHEDULE_TIME_SLOTS.length - i);
        skipCount = span - 1;

        cells.push(
          <td
            key={slotTime}
            colSpan={span}
            className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40"
          >
            <ScheduleBookingCell
              booking={b}
              instructor={ins}
              usersList={usersList}
              onOpen={onOpenSlot}
              onDelete={onDeleteSlot}
            />
          </td>
        );
      } else {
        // Check if covered by an ongoing booking
        const coveringB = bookings.find((book) => {
          if (
            book.instructorId !== ins.id ||
            book.date !== selectedDate ||
            book.status === 'cancelled' ||
            book.isDeleted
          )
            return false;
          const bStart = hourToMinutes(book.time);
          const slotStart = hourToMinutes(slotTime);
          const bEnd = bStart + book.durationHours * 60;
          return slotStart >= bStart && slotStart < bEnd;
        });

        if (coveringB) {
          cells.push(
            <td
              key={slotTime}
              className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40"
            >
              <ScheduleBookingCell
                booking={coveringB}
                instructor={ins}
                usersList={usersList}
                onOpen={onOpenSlot}
                onDelete={onDeleteSlot}
              />
            </td>
          );
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
  }
  return cells;
};
