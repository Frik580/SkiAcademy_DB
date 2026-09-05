import { doc, type Firestore, type Transaction } from 'firebase/firestore';
import { isCourseBooking } from '../../domain/availability';
import { resolveBookingCreatedAt } from '../booking/bookingCreatedAt';
import { translateCourse } from '../../lib/i18n/contentTranslation';
import { parseCourseDates } from '../../lib/i18n/courseDates';
import { formatDurationLabel } from '../../lib/i18n/duration';
import type { TranslationKey } from '../../lib/i18n/translations';
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

export interface RecordWalletLedgerInput {
  userId: string;
  amount: number;
  balanceAfter: number;
  currency?: WalletCurrency;
  type: WalletLedgerType;
  subjectName?: string;
  bookingId?: string;
  courseId?: string;
  createdAt?: string;
  entryId?: string;
}

export function recordWalletLedgerEntryInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  input: RecordWalletLedgerInput
): void {
  const entryId =
    input.entryId ?? walletLedgerEntryId(input.type, input.bookingId ?? `${Date.now()}`);
  const entry: WalletLedgerEntry = {
    id: entryId,
    userId: input.userId,
    amount: input.amount,
    balanceAfter: input.balanceAfter,
    ...(input.currency ? { currency: input.currency } : {}),
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.subjectName ? { subjectName: input.subjectName } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    ...(input.courseId ? { courseId: input.courseId } : {}),
  };

  transaction.set(doc(firestore, WALLET_LEDGER_COLLECTION, entryId), entry);
}

export function walletLedgerRef(firestore: Firestore, entryId: string) {
  return doc(firestore, WALLET_LEDGER_COLLECTION, entryId);
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
  source: 'ledger' | 'synthetic';
}

const PAID_BOOKING_STATUSES = new Set<Booking['status']>([
  'pending',
  'confirmed',
  'completed',
  'pending_cancellation',
]);

function ledgerBookingIds(entries: WalletLedgerEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.bookingId) ids.add(entry.bookingId);
  }
  return ids;
}

function ledgerHasBookingAction(
  entries: WalletLedgerEntry[],
  bookingId: string,
  type: WalletLedgerType
): boolean {
  return entries.some((entry) => entry.bookingId === bookingId && entry.type === type);
}

function resolveCourseTitle(course: Course | undefined, language: 'en' | 'ru'): string | undefined {
  if (!course) return undefined;
  return translateCourse(course, language).title;
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
  const bookingId =
    operation.bookingId ??
    (operation.id.startsWith('synthetic_payment_')
      ? operation.id.slice('synthetic_payment_'.length)
      : operation.id.startsWith('synthetic_refund_')
        ? operation.id.slice('synthetic_refund_'.length)
        : undefined);

  if (!bookingId) return operation;

  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) return { ...operation, bookingId };

  return {
    ...operation,
    bookingId,
    sessionDateLabel: formatWalletSessionDate(booking, courses, language),
    durationLabel: formatWalletSessionDuration(booking, courses, language),
  };
}

export function buildSyntheticWalletOperations(
  userId: string,
  bookings: Booking[],
  courses: Course[],
  ledgerEntries: WalletLedgerEntry[],
  language: 'en' | 'ru'
): WalletOperationView[] {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const coveredBookingIds = ledgerBookingIds(ledgerEntries);
  const synthetic: WalletOperationView[] = [];

  for (const booking of bookings) {
    if (booking.userId !== userId || booking.isDeleted) continue;
    if (booking.totalPrice == null || booking.totalPrice <= 0) continue;

    const createdAt = resolveBookingCreatedAt(booking)?.toISOString();
    if (!createdAt) continue;

    const isCourse = isCourseBooking(booking);
    const courseId =
      booking.courseId ?? (isCourse ? booking.instructorId.slice('course_'.length) : undefined);
    const subjectName = isCourse
      ? (resolveCourseTitle(courseById.get(courseId ?? ''), language) ?? booking.instructorName)
      : booking.instructorName;

    if (
      PAID_BOOKING_STATUSES.has(booking.status) &&
      !coveredBookingIds.has(booking.id) &&
      !ledgerHasBookingAction(
        ledgerEntries,
        booking.id,
        isCourse ? 'course_payment' : 'lesson_payment'
      )
    ) {
      synthetic.push({
        id: `synthetic_payment_${booking.id}`,
        amount: -booking.totalPrice,
        createdAt,
        labelKey: isCourse ? 'walletOpCoursePayment' : 'walletOpLessonPayment',
        subjectName,
        bookingId: booking.id,
        source: 'synthetic',
      });
    }

    if (booking.status === 'cancelled') {
      const paymentType = isCourse ? 'course_payment' : 'lesson_payment';
      const hasLedgerPayment = ledgerHasBookingAction(ledgerEntries, booking.id, paymentType);
      const hasSyntheticPayment = synthetic.some(
        (item) => item.id === `synthetic_payment_${booking.id}`
      );

      if (!hasLedgerPayment && !hasSyntheticPayment) {
        synthetic.push({
          id: `synthetic_payment_${booking.id}`,
          amount: -booking.totalPrice,
          createdAt,
          labelKey: isCourse ? 'walletOpCoursePayment' : 'walletOpLessonPayment',
          subjectName,
          bookingId: booking.id,
          source: 'synthetic',
        });
      }

      if (!ledgerHasBookingAction(ledgerEntries, booking.id, 'refund')) {
        synthetic.push({
          id: `synthetic_refund_${booking.id}`,
          amount: booking.totalPrice,
          createdAt,
          labelKey: 'walletOpRefund',
          subjectName,
          bookingId: booking.id,
          source: 'synthetic',
        });
      }
    }
  }

  return synthetic;
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

export function buildWalletOperationHistory(
  userId: string,
  bookings: Booking[],
  courses: Course[],
  ledgerEntries: WalletLedgerEntry[],
  language: 'en' | 'ru'
): WalletOperationView[] {
  const fromLedger = ledgerEntries.map(ledgerEntryToView);
  const synthetic = buildSyntheticWalletOperations(
    userId,
    bookings,
    courses,
    ledgerEntries,
    language
  );

  return [...fromLedger, ...synthetic]
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
