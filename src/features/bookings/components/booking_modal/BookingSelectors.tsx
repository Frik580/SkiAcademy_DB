import React, { useMemo } from 'react';
import { Calendar, Clock, HelpCircle } from 'lucide-react';
import { LessonDifficulty } from '../../../../types';
import { type TranslationKey, type Language } from '../../../../app/providers/LanguageContext';
import { type DifficultyLabelVariant } from '../../../../lib/i18n/bookingLabels';
import { formatDurationLabel } from '../../../../lib/i18n/duration';
import { BookingAppleDatePicker } from './BookingAppleDatePicker';
import { BookingAppleWheelPicker } from './BookingAppleWheelPicker';
import { buildBookingTimePickerOptions } from './bookingTimePickerOptions';

const DIFFICULTY_OPTIONS: LessonDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'freeride',
  'freestyle',
];

interface BookingSelectorsProps {
  date: string;
  setDate: (value: string) => void;
  time: string;
  setTime: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  difficulty: LessonDifficulty;
  setDifficulty: (value: LessonDifficulty) => void;
  isLoadingBookings: boolean;
  occupancyLoadFailed?: boolean;
  availableSlots: string[];
  minBookingDateStr: string;
  t: (key: TranslationKey) => string;
  language: Language;
  getDifficultyLabel: (
    difficulty: LessonDifficulty | string,
    language: Language,
    variant?: DifficultyLabelVariant
  ) => string;
  gapClass?: string;
}

export const BookingSelectors: React.FC<BookingSelectorsProps> = ({
  date,
  setDate,
  time,
  setTime,
  duration,
  setDuration,
  difficulty,
  setDifficulty,
  isLoadingBookings,
  occupancyLoadFailed = false,
  availableSlots,
  minBookingDateStr,
  t,
  language,
  getDifficultyLabel,
  gapClass = 'gap-4',
}) => {
  const labelStyle = 'mb-1.5 flex items-center gap-1.5 truncate text-xs text-[var(--ink-dim)]';

  const timeOptions = useMemo(
    () =>
      buildBookingTimePickerOptions({
        isLoadingBookings,
        occupancyLoadFailed,
        availableSlots,
        t: t as (key: string) => string,
      }),
    [availableSlots, isLoadingBookings, occupancyLoadFailed, t]
  );

  const durationOptions = useMemo(
    () =>
      [1, 2, 3, 4, 6].map((hrs) => ({
        value: String(hrs),
        label: formatDurationLabel(hrs, language === 'ru' ? 'ru' : 'en'),
      })),
    [language]
  );

  const stageOptions = useMemo(
    () =>
      DIFFICULTY_OPTIONS.map((diff) => ({
        value: diff,
        label: getDifficultyLabel(diff, language, 'booking'),
      })),
    [getDifficultyLabel, language]
  );

  const locale = language === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${gapClass}`}>
      <div>
        <label className={labelStyle}>
          <Calendar className="h-3.5 w-3.5" /> {t('dateLabel')}
        </label>
        <BookingAppleDatePicker
          value={date}
          onChange={setDate}
          min={minBookingDateStr}
          locale={locale}
          placeholder={t('dateLabel')}
          aria-label={t('dateLabel')}
        />
      </div>

      <div>
        <label className={labelStyle}>
          <Clock className="h-3.5 w-3.5" /> {t('timeSlot')}
        </label>
        <BookingAppleWheelPicker
          value={time}
          onChange={setTime}
          options={timeOptions}
          disabled={isLoadingBookings || occupancyLoadFailed || availableSlots.length === 0}
          placeholder={
            isLoadingBookings
              ? `${t('loading')}...`
              : occupancyLoadFailed
                ? t('instructorOccupancyLoadFailed')
                : availableSlots.length === 0
                  ? t('noSlotsAvailable')
                  : ''
          }
          aria-label={t('timeSlot')}
        />
      </div>

      <div>
        <label className={labelStyle}>
          <Clock className="h-3.5 w-3.5" /> {t('durationHours')}
        </label>
        <BookingAppleWheelPicker
          value={String(duration)}
          onChange={(value) => setDuration(Number(value))}
          options={durationOptions}
          aria-label={t('durationHours')}
        />
      </div>

      <div>
        <label className={labelStyle}>
          <HelpCircle className="h-3.5 w-3.5" /> {t('lessonStage')}
        </label>
        <BookingAppleWheelPicker
          value={difficulty}
          onChange={(value) => setDifficulty(value as LessonDifficulty)}
          options={stageOptions}
          aria-label={t('lessonStage')}
        />
      </div>
    </div>
  );
};
