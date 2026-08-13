import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { AvailabilitySlot, Course, Instructor } from '../../types';
import { type TranslationKey, type Language } from '../../lib/LanguageContext';
import { formatDurationLabel } from '../../lib/i18n/duration';

interface BookingOverlapWarningsProps {
  isTimeSlotOccupied: boolean;
  overlappingBooking: AvailabilitySlot | null;
  overlappingCourse: Course | null;
  targetInstructor: Instructor | null;
  t: (key: TranslationKey) => string;
  language: Language;
}

export const BookingOverlapWarnings: React.FC<BookingOverlapWarningsProps> = ({
  isTimeSlotOccupied,
  overlappingBooking,
  overlappingCourse,
  targetInstructor,
  t,
  language,
}) => {
  const lang = language === 'ru' ? 'ru' : 'en';
  if (!targetInstructor) return null;
  return (
    <>
      {isTimeSlotOccupied && overlappingBooking && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-300 animate-fade-in">
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
              {t('timeSlotOccupied')}
            </p>
            <p className="text-[11px] leading-relaxed opacity-90">
              {`${targetInstructor.name} ${t('bookingConflictFrom')} ${overlappingBooking.time} ${t('bookingConflictFor')} ${formatDurationLabel(overlappingBooking.durationHours, lang)}. ${t('chooseAnotherSlot')}`}
            </p>
          </div>
        </div>
      )}

      {isTimeSlotOccupied && overlappingCourse && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-300 animate-fade-in">
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
              {t('reservedGroupCourse')}
            </p>
            <p className="text-[11px] leading-relaxed opacity-90">
              {`${targetInstructor.name} ${t('leadsGroupCourse')} "${overlappingCourse.title}" ${t('groupCourseOnDate')} (${overlappingCourse.dates}). ${t('chooseAnotherSlot')}`}
            </p>
          </div>
        </div>
      )}

      {!targetInstructor.isAvailable && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300 animate-fade-in">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
              {t('instructorUnavailable')}
            </p>
            <p className="text-[11px] leading-relaxed opacity-90">
              {`${targetInstructor.name} ${t('instructorUnavailableChoice')}`}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
