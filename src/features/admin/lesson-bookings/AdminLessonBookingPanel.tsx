import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionButton } from '../../../ui/ActionButton';
import {
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_CHANGE_REQUEST_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY,
  ADMIN_LESSON_BOOKINGS_SECTION_ID,
  ADMIN_PLANNER_DATE_QUERY_KEY,
  scrollAdminElementIntoView,
  ADMIN_PLANNER_FOCUS_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';
import { AdminLessonBookingDetail } from './AdminLessonBookingDetail';
import { useAdminLessonBookingTranslations } from './useAdminLessonBookingTranslations';
import type {
  AdminLessonBookingAttempt,
  AdminLessonBookingMutationDraft,
  AdminLessonBookingMutationAttempt,
  AdminLessonInstructorOption,
} from './lessonBookingAdminContracts';
import {
  formatLessonAdminDuration,
  LESSON_ADMIN_ORIGIN_LABEL_KEYS,
  LESSON_ADMIN_PRIMARY_STATUS_KEYS,
  PAYMENT_STATUS_LABEL_KEYS,
  resolveLessonAdminPrimaryStatus,
} from './lessonBookingAdminPresentation';
import { AdminLessonBookingListRow } from './AdminLessonBookingUi';
import { useAdminLessonBookingCommands } from './useAdminLessonBookingCommands';
import { useAdminLessonBookingReadModels } from './useAdminLessonBookingReadModels';
import { useSharedAdminMonitorReadModels } from '../operations/AdminMonitorReadModelsContext';
import {
  captureAdminLessonBookingTarget,
  createAdminLessonBookingAttemptId,
  parseAdminLessonBookingView,
} from './lessonBookingAdminUtils';
import type { AdminManagedParticipantSelection } from '../identity';

interface AdminLessonBookingPanelProps {
  readonly adminAccountId: string;
  readonly instructors: readonly AdminLessonInstructorOption[];
}

interface Confirmation {
  readonly attempt: AdminLessonBookingAttempt;
  readonly message: string;
}

function localParts(item: LessonBookingReadModel): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: item.occurrence.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(item.occurrence.startsAt.seconds * 1_000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour === '24' ? '00' : values.hour}:${values.minute}`,
  };
}

function listOccurrenceParts(
  item: LessonBookingReadModel,
  locale: string
): { date: string; time: string } {
  const start = new Date(item.occurrence.startsAt.seconds * 1_000);
  return {
    date: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: item.occurrence.timeZone,
    }).format(start),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: item.occurrence.timeZone,
    })
      .format(start)
      .replace(/^24:/, '00:'),
  };
}

function readableError(error: { code: string; message: string } | undefined): string | undefined {
  if (!error) return undefined;
  return `${error.message} (${error.code})`;
}

export function AdminLessonBookingPanel({ adminAccountId }: AdminLessonBookingPanelProps) {
  const { language, t } = useAdminLessonBookingTranslations();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseAdminLessonBookingView(searchParams.get(ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY));
  const bookingParam = searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY);
  const parsedBooking = BookingIdSchema.safeParse(bookingParam);
  const selectedBookingId = parsedBooking.success ? parsedBooking.data : undefined;
  const changeRequestParam = searchParams.get(ADMIN_CHANGE_REQUEST_QUERY_KEY);
  const parsedChangeRequest = BookingChangeRequestIdSchema.safeParse(changeRequestParam);
  const focusedChangeRequestId = parsedChangeRequest.success ? parsedChangeRequest.data : undefined;
  const { refreshAllProjections } = useSharedAdminMonitorReadModels();
  const reads = useAdminLessonBookingReadModels({
    enabled: true,
    view,
    ...(selectedBookingId ? { selectedBookingId } : {}),
  });
  const refreshLessonBooking = reads.refreshBooking;
  const refreshBookingWithProjections = useCallback(
    async (bookingId: Parameters<typeof refreshLessonBooking>[0]) => {
      const result = await refreshLessonBooking(bookingId);
      if (result.status === 'success') {
        await refreshAllProjections();
      }
      return result;
    },
    [refreshLessonBooking, refreshAllProjections]
  );
  const commands = useAdminLessonBookingCommands({
    adminAccountId,
    refreshBooking: refreshBookingWithProjections,
  });
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<{ code: string; message: string }>();
  const [mutationNotice, setMutationNotice] = useState<string>();
  const [actionReason, setActionReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [linkSelection, setLinkSelection] = useState<AdminManagedParticipantSelection>();
  const [linkReason, setLinkReason] = useState('');
  const detailPanelRef = useRef<HTMLElement>(null);
  const lastFocusedBookingRef = useRef<string>();

  const revealLessonBookingCard = useCallback((bookingId: string) => {
    window.setTimeout(() => {
      scrollAdminElementIntoView(ADMIN_LESSON_BOOKINGS_SECTION_ID);
      document
        .querySelector(`[data-admin-lesson-booking-id="${bookingId}"]`)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      if (window.matchMedia?.('(max-width: 1023px)').matches) {
        detailPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      }
    }, 320);
  }, []);

  useEffect(() => {
    if (!selectedBookingId) {
      lastFocusedBookingRef.current = undefined;
      return;
    }
    if (lastFocusedBookingRef.current === selectedBookingId) return;
    const shouldRevealInitialSelection = lastFocusedBookingRef.current === undefined;
    lastFocusedBookingRef.current = selectedBookingId;
    if (shouldRevealInitialSelection) revealLessonBookingCard(selectedBookingId);
  }, [revealLessonBookingCard, selectedBookingId]);

  useEffect(() => {
    if (!selectedBookingId || reads.detail.loading || !reads.detail.item) return;
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      detailPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [reads.detail.item, reads.detail.loading, selectedBookingId]);

  useEffect(() => {
    const item = reads.detail.item;
    if (!item) return;
    setRefundAmount(String(item.admin?.cancellationFinancial?.suggestedRefund ?? 0));
    setPaymentAmount(String(item.admin?.payment.outstanding ?? 0));
    setActionReason('');
  }, [reads.detail.item]);

  useEffect(() => {
    setLinkSelection(undefined);
    setLinkReason('');
    setMutationNotice(undefined);
    setConfirmation((current) =>
      current?.attempt.kind === 'link_guest_booking_to_account_as_administrator'
        ? undefined
        : current
    );
  }, [selectedBookingId]);

  const updateQuery = (updates: Readonly<Record<string, string | undefined>>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );
  };

  const requestAttempt = (attempt: AdminLessonBookingAttempt, message: string) => {
    setMutationError(undefined);
    setMutationNotice(undefined);
    setConfirmation({ attempt, message });
  };

  const runConfirmation = async () => {
    if (!confirmation || mutationPending) return;
    setMutationPending(true);
    setMutationError(undefined);
    setMutationNotice(undefined);
    const result = await commands.runAttempt(confirmation.attempt);
    setMutationPending(false);
    if (result.status === 'success') {
      if (result.refreshFailed && confirmation.attempt.kind === 'record_provider_payment_event') {
        setMutationNotice(t('adminLessonPaymentRecordedRefreshPending'));
      }
      setConfirmation(undefined);
      return;
    }
    setMutationError(result.error);
    if (result.error.code === 'stale_version') setConfirmation(undefined);
  };

  const requestDetailAttempt = (
    item: LessonBookingReadModel,
    attempt: AdminLessonBookingMutationDraft,
    message: string
  ) => {
    requestAttempt(
      {
        ...attempt,
        target: captureAdminLessonBookingTarget(item),
        idempotencyKey: createAdminLessonBookingAttemptId(attempt.kind),
      } as AdminLessonBookingMutationAttempt,
      message
    );
  };

  const detail = reads.detail.item;
  const admin = detail?.admin;

  return (
    <div className="space-y-6">
      {mutationError && !confirmation && (
        <div role="alert" className="border border-red-500/30 bg-red-500/5 p-3 text-xs">
          {readableError(mutationError)}
        </div>
      )}
      {mutationNotice && (
        <div role="status" className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          {mutationNotice}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,38fr)_minmax(0,62fr)]">
        <section
          aria-label="Canonical lesson bookings"
          className="overflow-hidden rounded-[var(--radius)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)]"
        >
          <div className="border-b border-[var(--border)] p-3">
            <div className="inline-flex rounded-full bg-[var(--profile-bg)] p-1">
              {(['hot', 'history'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={view === candidate}
                  onClick={() =>
                    updateQuery({
                      [ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY]: candidate,
                      [ADMIN_LESSON_BOOKING_QUERY_KEY]: undefined,
                    })
                  }
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${
                    view === candidate
                      ? 'bg-[var(--ink)] text-[var(--bg)] shadow-sm'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {candidate === 'hot' ? t('adminLessonHot') : t('adminLessonHistory')}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            {reads.list.loading ? (
              <div
                role="status"
                className="flex min-h-36 items-center justify-center gap-2 text-xs"
              >
                <Loader2 className="h-4 w-4 animate-spin" /> {t('adminLessonLoading')}
              </div>
            ) : reads.list.error ? (
              <div role="alert" className="border border-red-500/30 p-4 text-xs">
                {reads.list.error === 'permission-denied'
                  ? t('adminLessonPermissionDenied')
                  : t('adminLessonReadFailed')}
                <button
                  type="button"
                  onClick={() => void reads.retryList()}
                  className="mt-3 flex items-center gap-2 border border-[var(--border)] px-3 py-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {t('adminLessonRetry')}
                </button>
              </div>
            ) : reads.list.items.length === 0 ? (
              <div className="space-y-3 border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--ink-dim)]">
                <p>{t('adminLessonEmpty')}</p>
                {reads.list.hasMore && (
                  <button
                    type="button"
                    disabled={reads.list.loadingMore}
                    onClick={() => void reads.loadMore()}
                    className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {reads.list.loadingMore
                      ? t('adminLessonLoadingMore')
                      : t('adminLessonLoadNextPage')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {reads.list.items.map((item) => {
                  const occurrence = listOccurrenceParts(item, locale);
                  const primaryStatus = resolveLessonAdminPrimaryStatus(item);
                  const paymentStatus = item.admin?.payment.status;
                  return (
                    <AdminLessonBookingListRow
                      key={item.bookingId}
                      selected={selectedBookingId === item.bookingId}
                      onSelect={() =>
                        updateQuery({ [ADMIN_LESSON_BOOKING_QUERY_KEY]: item.bookingId })
                      }
                      item={{
                        bookingId: item.bookingId,
                        participantNames: item.participants
                          .map((participant) => participant.displayName)
                          .join(', '),
                        date: occurrence.date,
                        time: occurrence.time,
                        instructor: item.instructor.displayName,
                        duration: formatLessonAdminDuration(item.occurrence.durationMinutes, t),
                        primaryStatus,
                        primaryStatusLabel: t(LESSON_ADMIN_PRIMARY_STATUS_KEYS[primaryStatus]),
                        ...(paymentStatus
                          ? {
                              paymentStatus,
                              paymentStatusLabel: t(PAYMENT_STATUS_LABEL_KEYS[paymentStatus]),
                            }
                          : {}),
                        origin: item.bookingOrigin,
                        originLabel: t(LESSON_ADMIN_ORIGIN_LABEL_KEYS[item.bookingOrigin]),
                      }}
                    />
                  );
                })}
                {reads.list.hasMore && (
                  <button
                    type="button"
                    disabled={reads.list.loadingMore}
                    onClick={() => void reads.loadMore()}
                    className="w-full border border-[var(--border)] px-3 py-2 text-xs font-medium disabled:opacity-50"
                  >
                    {reads.list.loadingMore
                      ? t('adminLessonLoadingMore')
                      : t('adminLessonLoadMore')}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <aside
          ref={detailPanelRef}
          className="min-h-[32rem] rounded-[var(--radius)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
          aria-label="Booking detail"
          tabIndex={-1}
        >
          {!bookingParam ? (
            <p className="flex min-h-52 items-center justify-center text-center text-xs text-[var(--ink-dim)]">
              {t('adminLessonSelectPrompt')}
            </p>
          ) : !parsedBooking.success ? (
            <div role="alert" className="text-xs text-red-700">
              {t('adminLessonInvalidId')}
            </div>
          ) : reads.detail.loading ? (
            <div role="status" className="flex min-h-52 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : reads.detail.error ? (
            <div role="alert" className="text-xs">
              {reads.detail.error === 'permission-denied'
                ? t('adminLessonPermissionDenied')
                : t('adminLessonDetailFailed')}
              <button
                type="button"
                onClick={() => void reads.retryDetail()}
                className="mt-3 flex items-center gap-2 border border-[var(--border)] px-3 py-2"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t('adminLessonRetry')}
              </button>
            </div>
          ) : !detail ? (
            <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonNotFound')}</p>
          ) : !admin ? (
            <p role="alert" className="text-xs text-red-700">
              {t('adminLessonProjectionMissing')}
            </p>
          ) : (
            <AdminLessonBookingDetail
              key={detail.bookingId}
              detail={detail}
              admin={admin}
              language={language}
              locale={locale}
              t={t}
              actionReason={actionReason}
              onActionReasonChange={setActionReason}
              refundAmount={refundAmount}
              onRefundAmountChange={setRefundAmount}
              paymentAmount={paymentAmount}
              onPaymentAmountChange={(value) => {
                setPaymentAmount(value);
                setConfirmation(undefined);
              }}
              linkSelection={linkSelection}
              onLinkSelectionChange={(selection) => {
                setLinkSelection(selection);
                setConfirmation(undefined);
              }}
              linkReason={linkReason}
              onLinkReasonChange={(value) => {
                setLinkReason(value);
                setConfirmation(undefined);
              }}
              onRequestAttempt={(attempt, message) =>
                requestDetailAttempt(detail, attempt, message)
              }
              focusedChangeRequestId={focusedChangeRequestId}
              onOpenPlanner={() => {
                const parts = localParts(detail);
                updateQuery({
                  [ADMIN_TAB_QUERY_KEY]: 'operations',
                  [ADMIN_PLANNER_DATE_QUERY_KEY]: parts.date,
                  [ADMIN_PLANNER_FOCUS_QUERY_KEY]: detail.bookingId,
                });
              }}
              onClose={() => updateQuery({ [ADMIN_LESSON_BOOKING_QUERY_KEY]: undefined })}
              onOpenPayment={(paymentId) =>
                updateQuery({
                  [ADMIN_TAB_QUERY_KEY]: 'finance',
                  [ADMIN_FINANCE_PAYMENT_QUERY_KEY]: paymentId,
                })
              }
              onOpenIssue={(issueId) =>
                updateQuery({
                  [ADMIN_TAB_QUERY_KEY]: 'operations',
                  [ADMIN_ISSUE_QUERY_KEY]: issueId,
                })
              }
            />
          )}
        </aside>
      </div>

      {confirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('adminLessonConfirmTitle')}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-4"
        >
          <div className="w-full max-w-md space-y-4 border border-[var(--border)] bg-[var(--bg)] p-5">
            <h3 className="text-sm font-medium">{t('adminLessonConfirmTitle')}</h3>
            <p className="text-xs text-[var(--ink-dim)]">{confirmation.message}</p>
            <p className="break-all font-mono text-[10px] text-[var(--ink-dim)]">
              Target:{' '}
              {confirmation.attempt.kind === 'create_confirmed_booking'
                ? confirmation.attempt.bookingId
                : confirmation.attempt.kind === 'link_guest_booking_to_account_as_administrator'
                  ? `${confirmation.attempt.target.bookingId} @ rev ${confirmation.attempt.target.revision} → ${confirmation.attempt.targetAccountId}/${confirmation.attempt.targetParticipantId}`
                  : `${confirmation.attempt.target.bookingId} @ rev ${confirmation.attempt.target.revision}`}
            </p>
            {mutationError && (
              <p role="alert" className="text-xs text-red-700">
                {readableError(mutationError)}
              </p>
            )}
            <div className="flex gap-2">
              <ActionButton
                type="button"
                size="sm"
                disabled={mutationPending}
                onClick={() => {
                  setConfirmation(undefined);
                  setMutationError(undefined);
                }}
                className="flex-1"
              >
                {t('adminLessonConfirmCancel')}
              </ActionButton>
              <ActionButton
                type="button"
                variant="primary"
                size="sm"
                pending={mutationPending}
                pendingLabel={t('adminLessonSubmitting')}
                onClick={() => void runConfirmation()}
                className="flex-1"
              >
                {mutationError ? t('adminLessonRetrySame') : t('adminLessonConfirmSubmit')}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminLessonBookingPanel;
