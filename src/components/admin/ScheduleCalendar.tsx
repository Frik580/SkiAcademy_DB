import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Clock,
  Coffee,
  Lock,
  Plus,
  X,
} from 'lucide-react';
import { Instructor, Booking, UserProfile, Course } from '../../types';
import { useLanguage, translateCourse, parseCourseDates } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { formatDateLocalYMD, hourToMinutes, getWeekRange } from './scheduleUtils';
import { SCHEDULE_TIME_SLOTS } from './scheduleOverlap';
import { ScheduleInstructorCell } from './ScheduleInstructorCell';
import { ScheduleToolbar, type ScheduleViewMode } from './ScheduleToolbar';
import {
  ScheduleSlotActionModal,
  type ActiveScheduleSlot,
  type ScheduleSlotActionModalHandle,
} from './ScheduleSlotActionModal';

interface ScheduleCalendarProps {
  instructors: Instructor[];
  bookings: Booking[];
  courses: Course[];
  usersList: UserProfile[];
  adminProfile: UserProfile;
  onAddBooking?: (booking: Booking) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
}

export const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  instructors,
  bookings,
  courses,
  usersList,
  adminProfile,
  onAddBooking,
  onRescheduleBooking,
  onDeleteBooking,
  onCancelBooking,
  onCompleteBooking,
}) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();

  const [viewMode, setViewMode] = useState<ScheduleViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeSlotModal, setActiveSlotModal] = useState<ActiveScheduleSlot | null>(null);
  const slotActionModalRef = useRef<ScheduleSlotActionModalHandle>(null);

  const selectedDate = useMemo(() => formatDateLocalYMD(currentDate), [currentDate]);

  const adjustDate = (days: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (days * 7));
      } else {
        newDate.setDate(newDate.getDate() + days);
      }
      return newDate;
    });
  };

  const handleOpenSlotAction = (ins: Instructor, slotTime: string, existingB?: Booking) => {
    setActiveSlotModal({
      instructor: ins,
      time: slotTime,
      booking: existingB
    });
  };

  const handleSlotDeleteClick = (id: string) => {
    slotActionModalRef.current?.requestDelete(id);
  };

  // Render booking element
  const renderBookingCell = (b: Booking, ins: Instructor) => {
    const client = usersList.find((u) => u.uid === b.userId);

    if (b.userId === 'system_block_day_off') {
      return (
        <div className="relative group/cell h-11 bg-slate-100/50 dark:bg-slate-800/15 border border-slate-300/40 dark:border-slate-800/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-650" />
            <span className="truncate">{t('dayOffLabel')}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className="text-slate-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
            title={t('cancelDayOff')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (b.userId === 'system_block_break') {
      return (
        <div className="relative group/cell h-11 bg-amber-50/60 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-900/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Coffee className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-600" />
            <span className="truncate">{b.notes || (t('breakLabel'))}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className="text-amber-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
            title={t('cancelBreak')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    const isPendingCancellation = b.status === 'pending_cancellation';
    const isCompleted = b.status === 'completed';

    let cardBgClasses = 'bg-indigo-50/60 dark:bg-indigo-950/15 border border-indigo-250/45 dark:border-indigo-900/40 hover:border-indigo-400 dark:hover:border-indigo-700 text-indigo-950 dark:text-indigo-200';
    let titleColorClasses = 'text-indigo-900 dark:text-indigo-200';
    let buttonColorClasses = 'text-indigo-400 hover:text-red-500';
    let textTimeClasses = 'text-indigo-600 dark:text-indigo-400';

    if (isPendingCancellation) {
      cardBgClasses = 'bg-rose-50/60 dark:bg-rose-950/15 border border-rose-250/45 dark:border-rose-900/40 hover:border-rose-400 dark:hover:border-rose-700 text-rose-950 dark:text-rose-200 animate-pulse';
      titleColorClasses = 'text-rose-900 dark:text-rose-300 font-semibold';
      buttonColorClasses = 'text-rose-400 hover:text-red-500';
      textTimeClasses = 'text-rose-600 dark:text-rose-400';
    } else if (isCompleted) {
      cardBgClasses = 'bg-emerald-50/60 dark:bg-emerald-950/10 border border-emerald-250/45 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-700 text-emerald-950 dark:text-emerald-200';
      titleColorClasses = 'text-emerald-900 dark:text-emerald-300 line-through decoration-emerald-200/50 dark:decoration-emerald-800/40';
      buttonColorClasses = 'text-emerald-400 hover:text-red-500';
      textTimeClasses = 'text-emerald-650 dark:text-emerald-400';
    }

    return (
      <div
        onClick={() => handleOpenSlotAction(ins, b.time, b)}
        className={`relative group/cell h-11 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer ${cardBgClasses}`}
      >
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className={`font-bold truncate flex items-center gap-1.5 ${titleColorClasses}`}>
            {client?.avatarUrl && (
              <img 
                src={client.avatarUrl} 
                alt={client.displayName} 
                className="w-4 h-4 rounded-none border border-black/10 shrink-0"
              />
            )}
            <span className="truncate">{client?.displayName || b.notes || (t('clientLesson'))}</span>
            {isPendingCancellation && (
              <span className="ml-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                ({t('cancelReqShort')})
              </span>
            )}
            {isCompleted && (
              <span className="ml-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                ✓ ({t('doneShort')})
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className={`opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer ${buttonColorClasses}`}
            title={t('cancelBookingAdmin')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={`text-[10px] font-mono flex items-center gap-1 mt-0.5 ${textTimeClasses}`}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{b.time} ({b.durationHours}h)</span>
        </div>
      </div>
    );
  };

  // Timetable slots generator
  const renderTimetableSlots = (ins: Instructor) => {
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
        const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(c.dates);
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
          const { start: cStart, end: cEnd, endTime: cEndTime } = parseCourseDates(courseOverlap.dates);
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
          (b) => b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
        );
        const bookedCount = courseBookings.length;
        const enrolledNames = courseBookings.map((b) => {
          const u = usersList.find((usr) => usr.uid === b.userId);
          return u?.displayName || u?.email || b.userId;
        }).filter(Boolean);

        cells.push(
          <td key={slotTime} colSpan={span} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
            <div
              onClick={() => {
                const otherGuides = courseOverlap.instructorIds?.filter(id => id !== ins.id) || [];
                const guideNamesStr = otherGuides.map(id => instructors.find(i => i.id === id)?.name || id).join(', ');
                const guidesDetail = guideNamesStr ? ` ${t('withGuidesPrefix')} ${guideNamesStr}${t('withGuidesSuffix')}` : '';
                const enrolledDetailsStr = enrolledNames.length > 0 
                  ? `\n${t('clientsEnrolledPrefix')} ${enrolledNames.join(', ')}` : `\n${t('noClientsEnrolled')}`;
                addNotification(
                  'info',
                  courseOverlap.title,
                  `${t('groupCourseInfoPrefix')} "${courseOverlap.title}"${guidesDetail}. ${t('groupCourseScheduled')}: ${courseOverlap.dates}\n${t('groupCourseSeats')}: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}` + enrolledDetailsStr
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
                  <span className="font-bold">{courseOverlap.availableSeats} / {courseOverlap.totalSeats} ({bookedCount} {t('bookedLabel')})</span>
                </div>
                {enrolledNames.length > 0 && (
                  <div className="text-[8px] leading-tight text-violet-600 dark:text-violet-400 mt-0.5 max-w-full truncate" title={enrolledNames.join(', ')}>
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
            <td key={slotTime} colSpan={span} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
              {renderBookingCell(b, ins)}
            </td>
          );
        } else {
          // Check if covered by an ongoing booking
        const coveringB = bookings.find((book) => {
          if (book.instructorId !== ins.id || book.date !== selectedDate || book.status === 'cancelled' || book.isDeleted) return false;
          const bStart = hourToMinutes(book.time);
          const slotStart = hourToMinutes(slotTime);
          const bEnd = bStart + book.durationHours * 60;
          return slotStart >= bStart && slotStart < bEnd;
        });

        if (coveringB) {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
              {renderBookingCell(coveringB, ins)}
            </td>
          );
        } else if (!ins.isAvailable) {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center bg-slate-50/20 dark:bg-slate-950/5 select-none">
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
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center">
              <button
                onClick={() => handleOpenSlotAction(ins, slotTime)}
                className="w-full h-11 border border-dashed border-slate-200/60 dark:border-slate-800/40 hover:border-indigo-400 dark:hover:border-indigo-800 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 rounded-xl transition flex items-center justify-center cursor-pointer group animate-fade-in"
                title={t('manageSlot')}
              >
                <Plus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 group-hover:text-indigo-500 transition duration-200" />
              </button>
            </td>
          );
        }
      }
    }
    }
    return cells;
  };
  const { start: weekStart, end: weekEnd } = getWeekRange(currentDate);
  const weekDays: Date[] = Array.from({ length: 7 }).map((_, i) => new Date(new Date(weekStart).setDate(weekStart.getDate() + i)));

  return (
    <>
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2.5">
              <Calendar className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {t('scheduleBoardTitle')}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {t('scheduleBoardSub')}
            </p>
          </div>

          <ScheduleToolbar
            viewMode={viewMode}
            selectedDate={selectedDate}
            weekStart={weekStart}
            weekEnd={weekEnd}
            language={language}
            t={t}
            onViewModeChange={setViewMode}
            onDateChange={setCurrentDate}
            onAdjustDate={adjustDate}
            onToday={() => setCurrentDate(new Date())}
          />
        </div>

        {/* Timetable Grid with horizontal scroll */}
        {viewMode === 'day' ? (
          <div className="overflow-x-auto rounded-none border border-[var(--border)]">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="w-[180px] p-3 text-left font-bold">
                    {t('coachLabel')}
                  </th>
                  {SCHEDULE_TIME_SLOTS.map((time) => (
                    <th key={time} className="p-3 text-center font-bold w-[95px] border-l border-slate-200/50 dark:border-slate-800/40">
                      {time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-sm text-slate-400">
                      {t('noInstructorsAvailable')}
                    </td>
                  </tr>
                ) : (
                  instructors.map((ins) => (
                    <tr key={ins.id} className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}>
                      {/* Instructor Profile Header */}
                      <ScheduleInstructorCell instructor={ins} language={language} t={t} />
                      {/* Hourly cells */}
                      {renderTimetableSlots(ins)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-none border border-[var(--border)]">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="w-[180px] p-3 text-left font-bold">{t('coachLabel')}</th>
                  {weekDays.map(day => (
                    <th key={day.toISOString()} className="p-3 text-center font-bold border-l border-slate-200/50 dark:border-slate-800/40">
                      {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.map(ins => (
                  <tr key={ins.id} className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}>
                    <ScheduleInstructorCell instructor={ins} language={language} t={t} />
                    {weekDays.map(day => {
                      const dayStr = formatDateLocalYMD(day);
                      const dayBookings = bookings.filter(b => b.instructorId === ins.id && b.date === dayStr && b.status !== 'cancelled' && !b.isDeleted);
                      const dayCourses = (courses || []).filter((c) => {
                        if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
                        const { start: cStart, end: cEnd } = parseCourseDates(c.dates);
                        const startStr = formatDateLocalYMD(cStart);
                        const endStr = formatDateLocalYMD(cEnd);
                        return dayStr >= startStr && dayStr <= endStr;
                      });

                      const combinedEvents = [
                        ...dayBookings.map(b => ({
                          type: 'booking' as const,
                          time: b.time,
                          data: b,
                          id: b.id
                        })),
                        ...dayCourses.map(c => {
                          const { startTime } = parseCourseDates(c.dates);
                          return {
                            type: 'course' as const,
                            time: startTime,
                            data: c,
                            id: `course_event_${c.id}`
                          };
                        })
                      ].sort((a, b) => a.time.localeCompare(b.time));

                      return (
                        <td key={dayStr} className="p-1 align-top border-l border-slate-200/50 dark:border-slate-800/40 min-h-24">
                          <div className="space-y-1">
                            {combinedEvents.map(item => {
                              if (item.type === 'booking') {
                                return (
                                  <div key={item.id}>{renderBookingCell(item.data, ins)}</div>
                                );
                              } else {
                                const courseOverlap = item.data;
                                const courseBookings = bookings.filter(
                                  (b) => b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
                                );
                                const bookedCount = courseBookings.length;
                                const enrolledNames = courseBookings.map((b) => {
                                  const u = usersList.find((usr) => usr.uid === b.userId);
                                  return u?.displayName || u?.email || b.userId;
                                }).filter(Boolean);

                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      const otherGuides = courseOverlap.instructorIds?.filter(id => id !== ins.id) || [];
                                      const guideNamesStr = otherGuides.map(id => instructors.find(i => i.id === id)?.name || id).join(', ');
                                      const guidesDetail = guideNamesStr ? ` ${t('withGuidesPrefix')} ${guideNamesStr}${t('withGuidesSuffix')}` : '';
                                      const enrolledDetailsStr = enrolledNames.length > 0 
                                        ? `\n${t('clientsEnrolledPrefix')} ${enrolledNames.join(', ')}` : `\n${t('noClientsEnrolled')}`;
                                      addNotification(
                                        'info',
                                        courseOverlap.title,
                                        `${t('groupCourseInfoPrefix')} "${courseOverlap.title}"${guidesDetail}. ${t('groupCourseScheduled')}: ${courseOverlap.dates}\n${t('groupCourseSeats')}: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}` + enrolledDetailsStr
                                      );
                                    }}
                                    className="relative group/cell h-11 border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
                                  >
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                      <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1.5 w-full">
                                        <BookOpen className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                        <span className="truncate">{translateCourse(courseOverlap, language).title}</span>
                                        <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0 ml-auto">
                                          {t('courseLabelShort')}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
                                      <Clock className="w-3 h-3 shrink-0 text-violet-400 dark:text-violet-500" />
                                      <span>{item.time} ({courseOverlap.availableSeats}/{courseOverlap.totalSeats}) • {bookedCount} {t('enrolledLabel')}</span>
                                    </div>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ScheduleSlotActionModal
        ref={slotActionModalRef}
        activeSlot={activeSlotModal}
        selectedDate={selectedDate}
        instructors={instructors}
        bookings={bookings}
        courses={courses}
        usersList={usersList}
        adminProfile={adminProfile}
        onClose={() => setActiveSlotModal(null)}
        onAddBooking={onAddBooking}
        onRescheduleBooking={onRescheduleBooking}
        onDeleteBooking={onDeleteBooking}
        onCancelBooking={onCancelBooking}
        onCompleteBooking={onCompleteBooking}
      />
    </>
  );
};
