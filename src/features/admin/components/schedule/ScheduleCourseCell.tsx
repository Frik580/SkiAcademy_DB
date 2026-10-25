import { BookOpen, Clock } from 'lucide-react';
import { parseCourseDates } from '../../../../app/providers/LanguageContext';
import { useNotifications } from '../../../../features/notifications';

import type {
  ScheduleBooking,
  ScheduleClient,
  ScheduleCourse,
  ScheduleInstructor,
} from './scheduleContracts';
import { useScheduleTranslations } from './useScheduleTranslations';
import { getScheduleCourseTitle } from './scheduleCoursePresentation';

interface ScheduleCourseCellProps {
  course: ScheduleCourse;
  instructor: ScheduleInstructor;
  instructors: ScheduleInstructor[];
  bookings: ScheduleBooking[];
  usersList: ScheduleClient[];
}

export function ScheduleCourseCell({
  course: courseOverlap,
  instructor: ins,
  instructors,
  bookings,
  usersList,
}: ScheduleCourseCellProps) {
  const { addNotification } = useNotifications();
  const { t, language } = useScheduleTranslations();
  const courseBookings = bookings.filter(
    (b) =>
      b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
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
      className="relative group/cell min-h-[44px] h-auto border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1.5 flex flex-col justify-center transition type-caption cursor-pointer"
    >
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="font-bold min-w-0 flex-wrap text-violet-900 dark:text-violet-200 flex items-center gap-1">
          <BookOpen className="w-3 h-3 text-violet-500 shrink-0" />
          <span className="min-w-0 break-words">
            {getScheduleCourseTitle(courseOverlap, language)}
          </span>
          <span className="type-caption bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 uppercase font-medium shrink-0">
            {t('courseLabelShort')}
          </span>
        </div>
      </div>
      <div className="type-caption flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
        <Clock className="w-3.5 h-3.5 shrink-0 text-violet-400 dark:text-violet-500" />
        <span>
          {(() => {
            const { startTime, endTime } = parseCourseDates(courseOverlap.dates);
            return `${startTime} - ${endTime}`;
          })()}
        </span>
      </div>
      {/* Seats Info */}
      <div className="type-caption mt-1 text-violet-700 dark:text-violet-300 border-t border-violet-200/50 dark:border-violet-800/40 pt-1 flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span>{t('seatsLabel')}</span>
          <span className="font-bold">
            {courseOverlap.availableSeats} / {courseOverlap.totalSeats} ({bookedCount}{' '}
            {t('bookedLabel')})
          </span>
        </div>
        {enrolledNames.length > 0 && (
          <div
            className="type-caption text-violet-600 dark:text-violet-400 mt-0.5 max-w-full break-words"
            title={enrolledNames.join(', ')}
          >
            <span className="font-bold">{t('clientsLabel')}</span> {enrolledNames.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
