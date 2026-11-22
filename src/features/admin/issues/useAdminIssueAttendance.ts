import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingId, LessonBookingReadModel } from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { runAdminLessonBookingCommand } from '../lesson-bookings/useAdminLessonBookingCommands';
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
  readonly refreshing?: boolean;
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
  const pendingRef = useRef(new Map<BookingId, string>());
  const [pendingIssueIds, setPendingIssueIds] = useState<readonly string[]>([]);
  // Keep uncertain attempts across selection changes. A retry must use the same payload/key.
  const attemptsRef = useRef(new Map<BookingId, Attempt>());
  // A read can still return the version from before a confirmed save.
  const savedRevisions = useRef(new Map<BookingId, number>());
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
        Promise.resolve().then(() => currentRef.current.refreshIssues()),
      ]);
      return results.every(
        (result) => result.status === 'fulfilled' && result.value.status === 'success'
      )
        ? { status: 'success' as const }
        : { status: 'failure' as const };
    },
    [loadBooking]
  );
  const model = read.bookingId === bookingId && !read.loading ? read.item : undefined;
  const prepared = model ? prepareAdminIssueAttendance(model, locale) : undefined;
  const alreadySaved = Boolean(
    model && model.revision <= (savedRevisions.current.get(model.bookingId) ?? -1)
  );

  const submit = async () => {
    if (
      !bookingId ||
      !selectedIssueId ||
      !adminAccountId ||
      !model ||
      !prepared?.draft ||
      pendingRef.current.has(bookingId) ||
      model.revision <= (savedRevisions.current.get(bookingId) ?? -1)
    )
      return;
    const issueId = selectedIssueId;
    const attempt = attemptsRef.current.get(bookingId) ?? {
      ...prepared.draft,
      target: captureAdminLessonBookingTarget(model),
      idempotencyKey: createAdminLessonBookingAttemptId('attention_attendance'),
    };
    attemptsRef.current.set(bookingId, attempt);
    pendingRef.current.set(bookingId, issueId);
    setPendingIssueIds([...pendingRef.current.values()]);
    setNotice(undefined);
    let outcome: Notice;
    try {
      const result = await runAdminLessonBookingCommand(adminAccountId, attempt);
      if (
        result.status === 'success' ||
        (!result.error.retryable && result.error.code !== 'internal')
      )
        attemptsRef.current.delete(bookingId);
      if (result.status === 'success') {
        savedRevisions.current.set(bookingId, attempt.target.revision);
      }
      outcome =
        result.status === 'success'
          ? { issueId, key: 'adminIssueAttendanceSaved', refreshing: true }
          : {
              issueId,
              key:
                result.error.code === 'stale_version'
                  ? 'adminIssueAttendanceStaleRefreshFailed'
                  : 'adminIssueAttendanceSaveFailed',
              errorCode: result.error.code,
              refreshing: result.error.code === 'stale_version',
            };
      setNotice(outcome);
    } finally {
      pendingRef.current.delete(bookingId);
      setPendingIssueIds([...pendingRef.current.values()]);
    }

    if (outcome.refreshing) {
      const refresh = await refreshBooking(bookingId);
      setNotice((current) => {
        if (current !== outcome) return current;
        const refreshed = refresh.status === 'success';
        return {
          ...outcome,
          key:
            outcome.errorCode === 'stale_version' && refreshed
              ? 'adminIssueAttendanceStale'
              : outcome.key,
          refreshing: false,
          refreshFailed: !outcome.errorCode && !refreshed,
        };
      });
    }
  };

  return {
    panel: prepared?.panel,
    alreadySaved,
    loading: Boolean(bookingId) && (read.bookingId !== bookingId || read.loading),
    readError: read.bookingId === bookingId ? read.error : undefined,
    pending: selectedIssueId !== undefined && pendingIssueIds.includes(selectedIssueId),
    notice: notice?.issueId === selectedIssueId ? notice : undefined,
    outcome: notice,
    retry: () => loadBooking(),
    submit,
  };
}
