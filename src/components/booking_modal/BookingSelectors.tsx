import React from 'react';
import { Calendar, Clock, HelpCircle } from 'lucide-react';
import { LessonDifficulty } from '../../types';
import { type TranslationKey, type Language } from '../../lib/LanguageContext';
import { type DifficultyLabelVariant } from '../../lib/i18n/bookingLabels';

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

  return (
    <div className={`grid grid-cols-2 ${gapClass}`}>
      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
          <Calendar className="w-3 h-3" /> {t('dateLabel')}
        </label>
        <input
          type="date"
          required
          min={minBookingDateStr}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> {t('timeSlot')}
        </label>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={isLoadingBookings || availableSlots.length === 0}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer disabled:opacity-60 disabled:bg-black/10 rounded-none"
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

      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> {t('durationHours')}
        </label>
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
        >
          {[1, 2, 3, 4, 6].map((hrs) => (
            <option key={hrs} value={hrs} className="bg-[var(--bg)] text-[var(--ink)]">
              {hrs} {hrs === 1 ? t('hourSingular') : t('hoursPlural')}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
          <HelpCircle className="w-3 h-3" /> {t('lessonStage')}
        </label>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as LessonDifficulty)}
          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
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
