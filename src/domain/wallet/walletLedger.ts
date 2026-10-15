import { isCourseBooking } from '../../domain/availability';
import { resolveBookingCreatedAt } from '../booking/bookingCreatedAt';
import { translateCourse } from '../../lib/i18n/contentTranslation';
import { parseCourseDates } from '../../lib/i18n/courseDates';
import { formatDurationLabel } from '../../lib/i18n/duration';
import type { TranslationKey } from '../../lib/i18n/translations';
import type { AccountWalletOperation } from '@ski-academy/shared-domain';
import type {
  Booking,
  Course,
  WalletCurrency,
  WalletLedgerEntry,
  WalletLedgerType,
} from '../../types';

export const WALLET_LEDGER_COLLECTION = 'wallet_ledger';

export function walletLedgerEntryId(type: WalletLedgerType, referenceId: string): string {
  return `wl_${type}_${referenceId}`;
}

/** Unique ledger id per booking payment/refund cycle (supports course re-enrollment). */
export function walletLedgerBookingEntryId(
  type: WalletLedgerType,
  booking: Pick<Booking, 'id' | 'createdAt'>
): string {
  const eventAt = resolveBookingCreatedAt(booking)?.toISOString();
  if (!eventAt) return walletLedgerEntryId(type, booking.id);
  return walletLedgerEntryId(type, `${booking.id}__${eventAt}`);
}

export interface WalletOperationView {
  id: string;
  amount: number;
  balanceAfter?: number;
  currency?: WalletCurrency;
  createdAt: string;
  labelKey: TranslationKey;
  subjectName?: string;
  bookingId?: string;
  sessionDateLabel?: string;
  durationLabel?: string;
  source: 'ledger' | 'monetary_event';
}

function formatWalletSessionDate(
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
): string | undefined {
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const dateOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

  if (isCourseBooking(booking)) {
    const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
    const course = courses.find((item) => item.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const start = parsed.start.toLocaleDateString(locale, dateOpts);
    const end = parsed.end.toLocaleDateString(locale, dateOpts);
    return start === end ? start : `${start} — ${end}`;
  }

  const lessonDate = new Date(`${booking.date}T12:00:00`);
  if (Number.isNaN(lessonDate.getTime())) return booking.date;
  return lessonDate.toLocaleDateString(locale, dateOpts);
}

function formatWalletSessionDuration(
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
): string | undefined {
  if (isCourseBooking(booking)) {
    const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
    const course = courses.find((item) => item.id === courseId);
    const duration = course ? translateCourse(course, language).duration : undefined;
    return duration?.trim() || undefined;
  }

  if (!booking.durationHours) return undefined;
  return formatDurationLabel(booking.durationHours, language);
}

function enrichWalletOperationWithBooking(
  operation: WalletOperationView,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru'
): WalletOperationView {
  const bookingId = operation.bookingId;

  if (!bookingId) return operation;

  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) return { ...operation, bookingId };
  const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
  const course = isCourseBooking(booking)
    ? courses.find((item) => item.id === courseId)
    : undefined;

  return {
    ...operation,
    bookingId,
    subjectName:
      operation.subjectName ??
      (course ? translateCourse(course, language).title : booking.instructorName),
    sessionDateLabel: formatWalletSessionDate(booking, courses, language),
    durationLabel: formatWalletSessionDuration(booking, courses, language),
  };
}

export const WALLET_LEDGER_LABEL_KEYS: Record<WalletLedgerType, TranslationKey> = {
  top_up: 'walletOpTopUp',
  starter_credit: 'walletOpStarterCredit',
  lesson_payment: 'walletOpLessonPayment',
  course_payment: 'walletOpCoursePayment',
  refund: 'walletOpRefund',
  admin_adjustment: 'walletOpAdminAdjustment',
  guest_payment: 'cashFlowOpGuestPayment',
};

export function ledgerEntryToView(entry: WalletLedgerEntry): WalletOperationView {
  return {
    id: entry.id,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    currency: entry.currency ?? 'KZT',
    createdAt: entry.createdAt,
    labelKey: WALLET_LEDGER_LABEL_KEYS[entry.type],
    subjectName: entry.subjectName,
    bookingId: entry.bookingId,
    source: 'ledger',
  };
}

export function prepareAccountWalletHistory(
  operations: readonly AccountWalletOperation[],
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru'
): WalletOperationView[] {
  return operations.map((operation) =>
    enrichWalletOperationWithBooking(
      {
        ...operation,
        labelKey: WALLET_LEDGER_LABEL_KEYS[operation.type],
      },
      bookings,
      courses,
      language
    )
  );
}

export function buildWalletOperationHistory(
  userId: string,
  bookings: Booking[],
  courses: Course[],
  ledgerEntries: WalletLedgerEntry[],
  language: 'en' | 'ru'
): WalletOperationView[] {
  // Persisted history only; booking status is not financial evidence.
  const fromLedger = ledgerEntries
    .filter((entry) => entry.userId === userId)
    .map(ledgerEntryToView);
  return fromLedger
    .map((operation) => enrichWalletOperationWithBooking(operation, bookings, courses, language))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function formatWalletOperationLabel(
  operation: WalletOperationView,
  t: (key: TranslationKey) => string
): string {
  const base = t(operation.labelKey);
  const headlineParts = [operation.subjectName].filter(Boolean) as string[];
  const detailParts = [operation.sessionDateLabel, operation.durationLabel].filter(
    Boolean
  ) as string[];

  if (headlineParts.length === 0 && detailParts.length === 0) return base;
  if (headlineParts.length === 0) return `${base}: ${detailParts.join(' · ')}`;
  if (detailParts.length === 0) return `${base}: ${headlineParts.join(' · ')}`;
  return `${base}: ${headlineParts.join(' · ')} · ${detailParts.join(' · ')}`;
}
