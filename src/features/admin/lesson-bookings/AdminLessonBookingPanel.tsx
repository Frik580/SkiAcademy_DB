import { BookingIdSchema, type LessonBookingReadModel } from '@ski-academy/shared-domain';
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY,
  ADMIN_PLANNER_DATE_QUERY_KEY,
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
  LESSON_ADMIN_PRIMARY_STATUS_KEYS,
  resolveLessonAdminPrimaryStatus,
} from './lessonBookingAdminPresentation';
import { useAdminLessonBookingCommands } from './useAdminLessonBookingCommands';
import { useAdminLessonBookingReadModels } from './useAdminLessonBookingReadModels';
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

function readableError(error: { code: string; message: string } | undefined): string | undefined {
  if (!error) return undefined;
  return `${error.message} (${error.code})`;
}

export function AdminLessonBookingPanel({
  adminAccountId,
}: AdminLessonBookingPanelProps) {
  const { language, t } = useAdminLessonBookingTranslations();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseAdminLessonBookingView(searchParams.get(ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY));
  const bookingParam = searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY);
  const parsedBooking = BookingIdSchema.safeParse(bookingParam);
  const selectedBookingId = parsedBooking.success ? parsedBooking.data : undefined;
  const reads = useAdminLessonBookingReadModels({
    enabled: true,
    view,
    ...(selectedBookingId ? { selectedBookingId } : {}),
  });
  const commands = useAdminLessonBookingCommands({
    adminAccountId,
    refreshBooking: reads.refreshBooking,
  });
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<{ code: string; message: string }>();
  const [actionReason, setActionReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [linkSelection, setLinkSelection] = useState<AdminManagedParticipantSelection>();
  const [linkReason, setLinkReason] = useState('');

  useEffect(() => {
    const item = reads.detail.item;
    if (!item) return;
    setRefundAmount(String(item.admin?.cancellationFinancial?.suggestedRefund ?? 0));
    setActionReason('');
  }, [reads.detail.item]);

  useEffect(() => {
    setLinkSelection(undefined);
    setLinkReason('');
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

  const formatDate = (item: LessonBookingReadModel) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: item.occurrence.timeZone,
    }).format(new Date(item.occurrence.startsAt.seconds * 1_000));

  const requestAttempt = (attempt: AdminLessonBookingAttempt, message: string) => {
    setMutationError(undefined);
    setConfirmation({ attempt, message });
  };

  const runConfirmation = async () => {
    if (!confirmation || mutationPending) return;
    setMutationPending(true);
    setMutationError(undefined);
    const result = await commands.runAttempt(confirmation.attempt);
    setMutationPending(false);
    if (result.status === 'success') {
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,1.1fr)]">
        <section aria-label="Canonical lesson bookings" className="space-y-3">
          <div className="inline-flex border border-[var(--border)]">
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
                className={`px-3 py-2 text-xs font-mono uppercase ${
                  view === candidate ? 'bg-[var(--ink)] text-[var(--bg)]' : ''
                }`}
              >
                {candidate === 'hot' ? t('adminLessonHot') : t('adminLessonHistory')}
              </button>
            ))}
          </div>

          {reads.list.loading ? (
            <div role="status" className="flex min-h-36 items-center justify-center gap-2 text-xs">
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
              {reads.list.items.map((item) => (
                <button
                  type="button"
                  key={item.bookingId}
                  onClick={() => updateQuery({ [ADMIN_LESSON_BOOKING_QUERY_KEY]: item.bookingId })}
                  className={`w-full border p-3 text-left ${
                    selectedBookingId === item.bookingId
                      ? 'border-[var(--ink)] bg-black/5'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {item.participants.map((participant) => participant.displayName).join(', ')}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-dim)]">
                        {formatDate(item)} · {formatLessonAdminDuration(item.occurrence.durationMinutes, t)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-dim)]">
                        {item.instructor.displayName} ·{' '}
                        {t(LESSON_ADMIN_PRIMARY_STATUS_KEYS[resolveLessonAdminPrimaryStatus(item)])}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </div>
                </button>
              ))}
              {reads.list.hasMore && (
                <button
                  type="button"
                  disabled={reads.list.loadingMore}
                  onClick={() => void reads.loadMore()}
                  className="w-full border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                >
                  {reads.list.loadingMore ? t('adminLessonLoadingMore') : t('adminLessonLoadMore')}
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="min-h-64 border border-[var(--border)] p-4" aria-label="Booking detail">
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
              detail={detail}
              admin={admin}
              language={language}
              locale={locale}
              t={t}
              actionReason={actionReason}
              onActionReasonChange={setActionReason}
              refundAmount={refundAmount}
              onRefundAmountChange={setRefundAmount}
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
              <button
                type="button"
                disabled={mutationPending}
                onClick={() => {
                  setConfirmation(undefined);
                  setMutationError(undefined);
                }}
                className="flex-1 border border-[var(--border)] px-3 py-2 text-xs"
              >
                {t('adminLessonConfirmCancel')}
              </button>
              <button
                type="button"
                disabled={mutationPending}
                onClick={() => void runConfirmation()}
                className="flex-1 border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)]"
              >
                {mutationPending
                  ? t('adminLessonSubmitting')
                  : mutationError
                    ? t('adminLessonRetrySame')
                    : t('adminLessonConfirmSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminLessonBookingPanel;
