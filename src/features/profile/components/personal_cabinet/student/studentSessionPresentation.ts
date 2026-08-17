import { Booking } from '../../../../../types';
import { type TranslationKey } from '../../../../../lib/LanguageContext';
import { parseBookingStartTime } from './studentBookingSchedule';
import { toYMD } from './studentCabinetPresentation';

const BOOKING_TIME_RANGE_RE = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;

export const formatCountdownRemaining = (ms: number, language: 'en' | 'ru') => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (language === 'ru') return h > 0 ? `${h}ч ${pad(m)}м ${pad(s)}с` : `${m}м ${pad(s)}с`;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const addMinutesToTime = (time: string, hours: number) => {
  const parsed = parseBookingStartTime(time);
  if (!parsed || !Number.isFinite(hours)) return '';
  const total = parsed.h * 60 + parsed.m + Math.round(hours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const formatSessionTimeRange = (booking: Pick<Booking, 'time' | 'durationHours'>) => {
  const rangeMatch = booking.time.match(BOOKING_TIME_RANGE_RE);
  if (rangeMatch) return `${rangeMatch[1]}–${rangeMatch[2]}`;
  const endTime = addMinutesToTime(booking.time, booking.durationHours);
  return endTime ? `${booking.time}–${endTime}` : booking.time;
};

export const formatSessionDayLabel = (
  dateStr: string,
  language: 'en' | 'ru',
  t: (key: TranslationKey) => string
) => {
  const today = toYMD(new Date());
  const tomorrow = toYMD(new Date(Date.now() + 86_400_000));
  if (dateStr === today) return t('scToday');
  if (dateStr === tomorrow) return t('scTomorrow');
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export const getDifficultyShort = (difficulty: Booking['difficulty']) => {
  const labels: Record<string, string> = {
    beginner: 'BASE',
    intermediate: 'CARVE',
    advanced: 'PRO',
    freeride: 'FREERIDE',
    freestyle: 'PARK',
  };
  return labels[difficulty] || 'BASE';
};
