import React from 'react';
import { Calendar, Clock, HelpCircle } from 'lucide-react';
import { LessonDifficulty } from '../../../../types';
import { type TranslationKey, type Language } from '../../../../app/providers/LanguageContext';
import { type DifficultyLabelVariant } from '../../../../lib/i18n/bookingLabels';
import { formatDurationLabel } from '../../../../lib/i18n/duration';

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
  availableSlots,
  minBookingDateStr,
  t,
  language,
  getDifficultyLabel,
  gapClass = 'gap-4',
}) => {
  const difficultyOptions: LessonDifficulty[] = [
    'beginner',
    'intermediate',
    'advanced',
    'freeride',
    'freestyle',
  ];

  const selectClass =
    'ui-select focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)] truncate';

  const fieldClass =
    'ui-field-plain focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)] truncate';

  const labelStyle =
    'text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5 mb-1 theme-air:font-sans theme-air:text-xs truncate';

  return (
    <div className={`grid grid-cols-2 ${gapClass}`}>
      <div>
        <label className={labelStyle}>
          <Calendar className="w-3.5 h-3.5" /> {t('dateLabel')}
        </label>
        <input
          type="date"
          required
          min={minBookingDateStr}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div>
        <label className={labelStyle}>
          <Clock className="w-3.5 h-3.5" /> {t('timeSlot')}
        </label>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={isLoadingBookings || availableSlots.length === 0}
          className={`${selectClass} disabled:opacity-50`}
        >
          {isLoadingBookings ? (
            <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
              {t('loading')}...
            </option>
          ) : availableSlots.length === 0 ? (
            <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
              {t('noSlotsAvailable')}
            </option>
          ) : (
            availableSlots.map((slot) => (
              <option key={slot} value={slot} className="bg-[var(--bg)] text-[var(--ink)]">
                {slot}
              </option>
            ))
          )}
        </select>
      </div>

      <div>
        <label className={labelStyle}>
          <Clock className="w-3.5 h-3.5" /> {t('durationHours')}
        </label>
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={selectClass}
        >
          {[1, 2, 3, 4, 6].map((hrs) => (
            <option key={hrs} value={hrs} className="bg-[var(--bg)] text-[var(--ink)]">
              {formatDurationLabel(hrs, language === 'ru' ? 'ru' : 'en')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelStyle}>
          <HelpCircle className="w-3.5 h-3.5" /> {t('lessonStage')}
        </label>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as LessonDifficulty)}
          className={selectClass}
        >
          {difficultyOptions.map((diff) => (
            <option key={diff} value={diff} className="bg-[var(--bg)] text-[var(--ink)]">
              {getDifficultyLabel(diff, language, 'booking')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
