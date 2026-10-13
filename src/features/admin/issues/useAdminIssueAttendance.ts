import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingId, LessonBookingReadModel } from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { useAdminLessonBookingCommands } from '../lesson-bookings/useAdminLessonBookingCommands';
import { classifyAdminLessonBookingReadError } from '../lesson-bookings/useAdminLessonBookingReadModels';
import { registerAdminLessonBookingsRevisionListener } from '../lesson-bookings/adminLessonBookingsRevisionCoordinator';
import { useAdminFinanceRevisionRefresh } from '../finance/useAdminFinanceRevisionRefresh';
import {
  captureAdminLessonBookingTarget,
  createAdminLessonBookingAttemptId,
} from '../lesson-bookings/lessonBookingAdminUtils';
import type { AdminLessonBookingMutationAttempt } from '../lesson-bookings/lessonBookingAdminContracts';
import type { TranslationKey } from '../../../lib/i18n/translations';
import { prepareAdminIssueAttendance } from './adminIssueAttendance';

type Attempt = Extract<AdminLessonBookingMutationAttempt, { kind: 'finalize_booking_attendance' }>;
interface Notice {
  readonly issueId: string;
  readonly key: TranslationKey;
  readonly errorCode?: string;
  readonly refreshFailed?: boolean;
}

export function useAdminIssueAttendance(input: {
  readonly adminAccountId: string;
  readonly selectedIssueId?: string;
  readonly bookingId?: BookingId;
  readonly locale: string;
  readonly refreshIssues: () => Promise<{ readonly status: 'success' | 'failure' }>;
}) {
  const { adminAccountId, selectedIssueId, bookingId, locale } = input;
  const currentRef = useRef(input);
  currentRef.current = input;
  const generationRef = useRef(0);
  const [read, setRead] = useState<{
    bookingId?: BookingId;
    item?: LessonBookingReadModel;
    loading: boolean;
    error?: TranslationKey;
  }>({ loading: false });
  const [pendingBookingId, setPendingBookingId] = useState<BookingId>();
  const pendingRef = useRef(new Set<BookingId>());
  // Keep uncertain attempts across selection changes. A retry must use the same payload/key.
  const attemptsRef = useRef(new Map<BookingId, Attempt>());
  const [notice, setNotice] = useState<Notice>();

  const loadBooking = useCallback(async (id = currentRef.current.bookingId) => {
    if (!id || currentRef.current.bookingId !== id) {
      if (!id) {
        generationRef.current += 1;
        setRead({ loading: false });
      }
      return { status: 'success' as const };
    }
    const generation = ++generationRef.current;
    setRead({ bookingId: id, loading: true });
    try {
      const result = await queryLessonBookingReadModels({ scope: 'admin_detail', bookingId: id });
      if (generation !== generationRef.current || currentRef.current.bookingId !== id)
        return { status: 'success' as const };
      const item =
        result.scope === 'admin_detail'
          ? result.items.find((model) => model.bookingId === id)
          : undefined;
      if (!item) throw new Error('Booking detail unavailable');
      setRead({ bookingId: id, item, loading: false });
      return { status: 'success' as const };
    } catch (error) {
      if (generation === generationRef.current && currentRef.current.bookingId === id) {
        setRead({
          bookingId: id,
          loading: false,
          error:
            classifyAdminLessonBookingReadError(error) === 'permission-denied'
              ? 'adminIssueAttendanceForbidden'
              : 'adminIssueAttendanceReadFailed',
        });
      }
      return { status: 'failure' as const };
    }
  }, []);

  useEffect(() => {
    void loadBooking(bookingId);
    return () => {
      generationRef.current += 1;
    };
  }, [bookingId, selectedIssueId, loadBooking]);

  useEffect(() => {
    if (!bookingId) return;
    return registerAdminLessonBookingsRevisionListener(() => {
      void loadBooking();
    });
  }, [bookingId, loadBooking]);
  useAdminFinanceRevisionRefresh(() => {
    void loadBooking();
  }, Boolean(bookingId));

  const refreshBooking = useCallback(
    async (id: BookingId) => {
      const results = await Promise.allSettled([
        loadBooking(id),
        currentRef.current.refreshIssues(),
      ]);
      return results.every(
        (result) =>
          result.status === 'fulfilled' &&
          (result.value === undefined || result.value.status === 'success')
      )
        ? { status: 'success' as const }
        : { status: 'failure' as const };
    },
    [loadBooking]
  );
  const { runAttempt } = useAdminLessonBookingCommands({ adminAccountId, refreshBooking });
  const model = read.bookingId === bookingId && !read.loading ? read.item : undefined;
  const prepared = model ? prepareAdminIssueAttendance(model, locale) : undefined;

  const submit = async () => {
    if (
      !bookingId ||
      !selectedIssueId ||
      !adminAccountId ||
      !model ||
      !prepared?.draft ||
      pendingRef.current.has(bookingId)
    )
      return;
    const issueId = selectedIssueId;
    const attempt = attemptsRef.current.get(bookingId) ?? {
      ...prepared.draft,
      target: captureAdminLessonBookingTarget(model),
      idempotencyKey: createAdminLessonBookingAttemptId('attention_attendance'),
    };
    attemptsRef.current.set(bookingId, attempt);
    pendingRef.current.add(bookingId);
    setPendingBookingId(bookingId);
    setNotice(undefined);
    try {
      const result = await runAttempt(attempt);
      if (
        result.status === 'success' ||
        (!result.error.retryable && result.error.code !== 'internal')
      )
        attemptsRef.current.delete(bookingId);
      if (currentRef.current.selectedIssueId !== issueId) return;
      setNotice(
        result.status === 'success'
          ? { issueId, key: 'adminIssueAttendanceSaved', refreshFailed: result.refreshFailed }
          : {
              issueId,
              key:
                result.error.code === 'stale_version'
                  ? result.refreshFailed
                    ? 'adminIssueAttendanceStaleRefreshFailed'
                    : 'adminIssueAttendanceStale'
                  : 'adminIssueAttendanceSaveFailed',
              errorCode: result.error.code,
            }
      );
    } finally {
      pendingRef.current.delete(bookingId);
      setPendingBookingId((id) => (id === bookingId ? undefined : id));
    }
  };

  return {
    panel: prepared?.panel,
    loading: Boolean(bookingId) && (read.bookingId !== bookingId || read.loading),
    readError: read.bookingId === bookingId ? read.error : undefined,
    pending:
      pendingBookingId === bookingId || Boolean(bookingId && pendingRef.current.has(bookingId)),
    notice: notice?.issueId === selectedIssueId ? notice : undefined,
    retry: () => loadBooking(),
    submit,
  };
}
