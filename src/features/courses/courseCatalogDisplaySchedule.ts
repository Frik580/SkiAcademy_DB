import { splitCourseDates, type Language } from '../../app/providers/LanguageContext';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
import type { CourseCatalogOperationalState } from '../course-enrollments';

export type CourseCatalogDisplayScheduleInput = {
  readonly legacyDates: string;
  readonly language: Language;
  readonly catalogOperational?: Pick<
    CourseCatalogOperationalState,
    'scheduleSummaryStartDate' | 'scheduleSummaryEndDate' | 'courseSchedule'
  >;
};

export type CourseCatalogDisplaySchedule = {
  readonly datePart: string;
  readonly timePart: string;
};

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTHS_RU_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

type LocalCalendarDay = {
  readonly day: number;
  readonly monthIndex: number;
  readonly year: number;
};

function parseIsoLocalDate(isoLocalDate: string): LocalCalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoLocalDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    !Number.isInteger(day) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, monthIndex, day };
}

/**
 * Public catalog date chip / "Подробнее" date line.
 * RU: `2–6 декабря 2026` · EN: `2–6 December 2026`
 * One day collapses; cross-month/year keep both calendar anchors.
 */
export function formatCatalogLocalDateRange(
  startIsoLocalDate: string,
  endIsoLocalDate: string,
  language: Language
): string {
  const start = parseIsoLocalDate(startIsoLocalDate);
  const end = parseIsoLocalDate(endIsoLocalDate);
  if (!start || !end) {
    return startIsoLocalDate === endIsoLocalDate
      ? startIsoLocalDate
      : `${startIsoLocalDate} – ${endIsoLocalDate}`;
  }

  const ru = language === 'ru';
  const monthName = (monthIndex: number) =>
    ru ? MONTHS_RU_GENITIVE[monthIndex]! : MONTHS_EN[monthIndex]!;

  if (start.year === end.year && start.monthIndex === end.monthIndex && start.day === end.day) {
    return ru
      ? `${start.day} ${monthName(start.monthIndex)} ${start.year}`
      : `${start.day} ${monthName(start.monthIndex)} ${start.year}`;
  }

  if (start.year === end.year && start.monthIndex === end.monthIndex) {
    return ru
      ? `${start.day}–${end.day} ${monthName(start.monthIndex)} ${start.year}`
      : `${start.day}–${end.day} ${monthName(start.monthIndex)} ${start.year}`;
  }

  if (start.year === end.year) {
    return ru
      ? `${start.day} ${monthName(start.monthIndex)} – ${end.day} ${monthName(end.monthIndex)} ${start.year}`
      : `${start.day} ${monthName(start.monthIndex)} – ${end.day} ${monthName(end.monthIndex)} ${start.year}`;
  }

  return ru
    ? `${start.day} ${monthName(start.monthIndex)} ${start.year} – ${end.day} ${monthName(end.monthIndex)} ${end.year}`
    : `${start.day} ${monthName(start.monthIndex)} ${start.year} – ${end.day} ${monthName(end.monthIndex)} ${end.year}`;
}

/**
 * Public catalog card + "Подробнее" must show the same operational schedule.
 * Prefer catalog read-model scheduleSummary (CourseDays-backed); fall back to
 * legacy marketing `course.dates` only when operational schedule is absent.
 */
export function resolveCourseCatalogDisplaySchedule(
  input: CourseCatalogDisplayScheduleInput
): CourseCatalogDisplaySchedule {
  const legacy = splitCourseDates(input.legacyDates, input.language);
  const start = input.catalogOperational?.scheduleSummaryStartDate?.trim();
  const end = input.catalogOperational?.scheduleSummaryEndDate?.trim();
  if (!start || !end) {
    return { datePart: legacy.datePart, timePart: legacy.timePart };
  }

  const datePart = formatCatalogLocalDateRange(start, end, input.language);
  const firstDay = input.catalogOperational?.courseSchedule.courseDays[0];
  if (!firstDay) {
    return { datePart, timePart: legacy.timePart };
  }

  const startLocal = canonicalTimestampToLocalParts(
    firstDay.interval.startsAt.seconds,
    firstDay.interval.startsAt.nanoseconds,
    firstDay.timeZone
  );
  const endLocal = canonicalTimestampToLocalParts(
    firstDay.interval.endsAt.seconds,
    firstDay.interval.endsAt.nanoseconds,
    firstDay.timeZone
  );
  return {
    datePart,
    timePart: `${startLocal.time} - ${endLocal.time}`,
  };
}

/** Cosmetic normalization for legacy marketing date strings on the card chip. */
export function formatCourseCatalogCardDate(datePart: string): string {
  return datePart
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/\s+-\s+/g, ' – ')
    .replace(
      /\b(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\b/gi,
      (month) => month.toLowerCase()
    );
}
