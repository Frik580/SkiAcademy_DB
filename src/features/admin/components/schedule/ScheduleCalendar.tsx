import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Clock } from 'lucide-react';
import { Instructor, Booking, UserProfile, Course } from '../../../../types';
import { translateCourse, parseCourseDates } from '../../../../app/providers/LanguageContext';
import { useNotifications } from '../../../../features/notifications';
import { formatDateLocalYMD, getWeekRange } from './scheduleUtils';
import { SCHEDULE_TIME_SLOTS } from './scheduleOverlap';
import { ScheduleBookingCell } from './ScheduleBookingCell';
import { ScheduleInstructorCell } from './ScheduleInstructorCell';
import { ScheduleTimetableCells } from './ScheduleTimetableCells';
import type { ScheduleBooking, ScheduleInstructor } from './scheduleContracts';
import { useScheduleTranslations } from './useScheduleTranslations';
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
  onReassignInstructor?: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
}

export const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  instructors,
  bookings,
  courses,
  usersList,
  adminProfile,
  onAddBooking,
  onRescheduleBooking,
  onReassignInstructor,
  onDeleteBooking,
  onCancelBooking,
  onCompleteBooking,
  onLinkGuestBooking,
}) => {
  const { addNotification } = useNotifications();
  const { t, language } = useScheduleTranslations();

  const [viewMode, setViewMode] = useState<ScheduleViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeSlotModal, setActiveSlotModal] = useState<ActiveScheduleSlot | null>(null);
  const slotActionModalRef = useRef<ScheduleSlotActionModalHandle>(null);

  const selectedDate = useMemo(() => formatDateLocalYMD(currentDate), [currentDate]);

  const adjustDate = (days: number) => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + days * 7);
      } else {
        newDate.setDate(newDate.getDate() + days);
      }
      return newDate;
    });
  };

  const handleOpenSlotAction = (
    instructor: ScheduleInstructor,
    slotTime: string,
    existingBooking?: ScheduleBooking
  ) => {
    const fullInstructor = instructors.find((item) => item.id === instructor.id);
    const fullBooking = existingBooking
      ? bookings.find((item) => item.id === existingBooking.id)
      : undefined;

    if (!fullInstructor || (existingBooking && !fullBooking)) return;

    setActiveSlotModal({
      instructor: fullInstructor,
      time: slotTime,
      booking: fullBooking,
    });
  };

  const handleSlotDeleteClick = (id: string) => {
    slotActionModalRef.current?.requestDelete(id);
  };

  const { start: weekStart, end: weekEnd } = getWeekRange(currentDate);
  const weekDays: Date[] = Array.from({ length: 7 }).map(
    (_, i) => new Date(new Date(weekStart).setDate(weekStart.getDate() + i))
  );

  return (
    <>
      <div className="space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
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
                  <th className="w-[180px] p-3 text-left font-bold">{t('coachLabel')}</th>
                  {SCHEDULE_TIME_SLOTS.map((time) => (
                    <th
                      key={time}
                      className="p-3 text-center font-bold w-[95px] border-l border-slate-200/50 dark:border-slate-800/40"
                    >
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
                    <tr
                      key={ins.id}
                      className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}
                    >
                      {/* Instructor Profile Header */}
                      <ScheduleInstructorCell instructor={ins} language={language} t={t} />
                      <ScheduleTimetableCells
                        instructor={ins}
                        selectedDate={selectedDate}
                        instructors={instructors}
                        bookings={bookings}
                        courses={courses}
                        usersList={usersList}
                        onOpenSlot={handleOpenSlotAction}
                        onDeleteSlot={handleSlotDeleteClick}
                      />
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
                  {weekDays.map((day) => (
                    <th
                      key={day.toISOString()}
                      className="p-3 text-center font-bold border-l border-slate-200/50 dark:border-slate-800/40"
                    >
                      {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
                        weekday: 'short',
                        day: 'numeric',
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.map((ins) => (
                  <tr
                    key={ins.id}
                    className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}
                  >
                    <ScheduleInstructorCell instructor={ins} language={language} t={t} />
                    {weekDays.map((day) => {
                      const dayStr = formatDateLocalYMD(day);
                      const dayBookings = bookings.filter(
                        (b) =>
                          b.instructorId === ins.id &&
                          b.date === dayStr &&
                          b.status !== 'cancelled' &&
                          !b.isDeleted
                      );
                      const dayCourses = (courses || []).filter((c) => {
                        if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
                        const { start: cStart, end: cEnd } = parseCourseDates(c.dates);
                        const startStr = formatDateLocalYMD(cStart);
                        const endStr = formatDateLocalYMD(cEnd);
                        return dayStr >= startStr && dayStr <= endStr;
                      });

                      const combinedEvents = [
                        ...dayBookings.map((b) => ({
                          type: 'booking' as const,
                          time: b.time,
                          data: b,
                          id: b.id,
                        })),
                        ...dayCourses.map((c) => {
                          const { startTime } = parseCourseDates(c.dates);
                          return {
                            type: 'course' as const,
                            time: startTime,
                            data: c,
                            id: `course_event_${c.id}`,
                          };
                        }),
                      ].sort((a, b) => a.time.localeCompare(b.time));

                      return (
                        <td
                          key={dayStr}
                          className="p-1 align-top border-l border-slate-200/50 dark:border-slate-800/40 min-h-24"
                        >
                          <div className="space-y-1">
                            {combinedEvents.map((item) => {
                              if (item.type === 'booking') {
                                return (
                                  <div key={item.id}>
                                    <ScheduleBookingCell
                                      booking={item.data}
                                      instructor={ins}
                                      usersList={usersList}
                                      onOpen={handleOpenSlotAction}
                                      onDelete={handleSlotDeleteClick}
                                    />
                                  </div>
                                );
                              } else {
                                const courseOverlap = item.data;
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

                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      const otherGuides =
                                        courseOverlap.instructorIds?.filter(
                                          (id) => id !== ins.id
                                        ) || [];
                                      const guideNamesStr = otherGuides
                                        .map(
                                          (id) => instructors.find((i) => i.id === id)?.name || id
                                        )
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
                                    className="relative group/cell h-11 border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
                                  >
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                      <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1.5 w-full">
                                        <BookOpen className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                        <span className="truncate">
                                          {translateCourse(courseOverlap, language).title}
                                        </span>
                                        <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0 ml-auto">
                                          {t('courseLabelShort')}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
                                      <Clock className="w-3 h-3 shrink-0 text-violet-400 dark:text-violet-500" />
                                      <span>
                                        {item.time} ({courseOverlap.availableSeats}/
                                        {courseOverlap.totalSeats}) • {bookedCount}{' '}
                                        {t('enrolledLabel')}
                                      </span>
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
        onReassignInstructor={onReassignInstructor}
        onDeleteBooking={onDeleteBooking}
        onCancelBooking={onCancelBooking}
        onCompleteBooking={onCompleteBooking}
        onLinkGuestBooking={onLinkGuestBooking}
      />
    </>
  );
};
