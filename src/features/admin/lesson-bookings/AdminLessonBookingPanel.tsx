import { BookingIdSchema, type LessonBookingReadModel } from '@ski-academy/shared-domain';
import { AlertTriangle, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';
import { useAdminLessonBookingTranslations } from './useAdminLessonBookingTranslations';
import type {
  AdminCreateLessonBookingAttempt,
  AdminLessonBookingAttempt,
  AdminLessonBookingMutationDraft,
  AdminLessonBookingMutationAttempt,
  AdminLessonInstructorOption,
} from './lessonBookingAdminContracts';
import { useAdminLessonBookingCommands } from './useAdminLessonBookingCommands';
import { useAdminLessonBookingReadModels } from './useAdminLessonBookingReadModels';
import {
  captureAdminLessonBookingTarget,
  createAdminLessonBookingAttemptId,
  createAdminLogicalBookingId,
  parseAdminLessonBookingView,
} from './lessonBookingAdminUtils';
import { AdminManagedParticipantPicker } from '../identity';
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

function attendanceActorLabel(
  actor: { kind: 'instructor'; instructorId: string } | { kind: 'administrator'; accountId: string }
): string {
  return actor.kind === 'instructor'
    ? `instructor:${actor.instructorId}`
    : `administrator:${actor.accountId}`;
}

export function AdminLessonBookingPanel({
  adminAccountId,
  instructors,
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
  const [createSelection, setCreateSelection] = useState<AdminManagedParticipantSelection>();
  const [createInstructorId, setCreateInstructorId] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [createDuration, setCreateDuration] = useState('60');
  const [createTimezone, setCreateTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Almaty';
    } catch {
      return 'Asia/Almaty';
    }
  });
  const [createReason, setCreateReason] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [targetInstructorId, setTargetInstructorId] = useState('');
  const [targetDuration, setTargetDuration] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  useEffect(() => {
    const item = reads.detail.item;
    if (!item) return;
    const parts = localParts(item);
    setRescheduleDate(parts.date);
    setRescheduleTime(parts.time);
    setTargetInstructorId(item.instructor.instructorId);
    setTargetDuration(String(item.occurrence.durationMinutes));
    setRefundAmount(String(item.admin?.cancellationFinancial?.suggestedRefund ?? 0));
    setActionReason('');
  }, [reads.detail.item]);

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
  const formatKzt = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    }).format(value);

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
      const created =
        confirmation.attempt.kind === 'create_confirmed_booking'
          ? confirmation.attempt.bookingId
          : undefined;
      setConfirmation(undefined);
      if (created) {
        updateQuery({
          [ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY]: 'hot',
          [ADMIN_LESSON_BOOKING_QUERY_KEY]: created,
        });
        setCreateReason('');
      }
      return;
    }
    setMutationError(result.error);
    if (result.error.code === 'stale_version') setConfirmation(undefined);
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const duration = Number(createDuration);
    const reasonExplanation = createReason.trim();
    if (
      !createSelection ||
      !createInstructorId ||
      !createDate ||
      !createTime ||
      !Number.isInteger(duration) ||
      duration <= 0 ||
      duration > 1440 ||
      !createTimezone.trim() ||
      !reasonExplanation
    ) {
      return;
    }
    const bookingId = createAdminLogicalBookingId();
    const attempt: AdminCreateLessonBookingAttempt = {
      kind: 'create_confirmed_booking',
      bookingId,
      idempotencyKey: createAdminLessonBookingAttemptId('create'),
      participantIds: [createSelection.participantId],
      payerAccountId: createSelection.accountId,
      instructorId: createInstructorId,
      localDate: createDate,
      localTime: createTime,
      durationMinutes: duration,
      timezone: createTimezone.trim(),
      reasonExplanation,
    };
    requestAttempt(attempt, t('adminLessonConfirmCreate'));
  };

  const requestDetailAttempt = (
    detail: LessonBookingReadModel,
    attempt: AdminLessonBookingMutationDraft,
    message: string
  ) => {
    requestAttempt(
      {
        ...attempt,
        target: captureAdminLessonBookingTarget(detail),
        idempotencyKey: createAdminLessonBookingAttemptId(attempt.kind),
      } as AdminLessonBookingMutationAttempt,
      message
    );
  };

  const createUnavailable = instructors.length === 0;
  const detail = reads.detail.item;
  const admin = detail?.admin;

  return (
    <div className="space-y-6">
      <section className="space-y-4 border border-[var(--border)] p-4">
        <div>
          <h3 className="text-sm font-medium">{t('adminLessonCreateTitle')}</h3>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">{t('adminLessonCreateHint')}</p>
        </div>
        {createUnavailable ? (
          <p role="status" className="border border-dashed border-[var(--border)] p-4 text-xs">
            {t('adminLessonCreateUnavailable')}
          </p>
        ) : (
          <form onSubmit={submitCreate} className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <AdminManagedParticipantPicker
                selected={createSelection}
                onChange={setCreateSelection}
              />
            </div>
            <label className="text-xs">
              {t('adminLessonInstructor')}
              <select
                aria-label="Create instructor"
                value={createInstructorId}
                onChange={(event) => setCreateInstructorId(event.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
                required
              >
                <option value="">{t('adminLessonSelectInstructor')}</option>
                {instructors.map((instructor) => (
                  <option key={instructor.instructorId} value={instructor.instructorId}>
                    {instructor.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              {t('adminLessonDate')}
              <input
                aria-label="Create date"
                type="date"
                value={createDate}
                onChange={(event) => setCreateDate(event.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                required
              />
            </label>
            <label className="text-xs">
              {t('adminLessonTime')}
              <input
                aria-label="Create time"
                type="time"
                value={createTime}
                onChange={(event) => setCreateTime(event.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                required
              />
            </label>
            <label className="text-xs">
              {t('adminLessonDuration')}
              <input
                aria-label="Create duration"
                type="number"
                min="1"
                max="1440"
                value={createDuration}
                onChange={(event) => setCreateDuration(event.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                required
              />
            </label>
            <label className="text-xs md:col-span-1">
              {t('adminLessonTimezone')}
              <input
                aria-label="Create timezone"
                value={createTimezone}
                onChange={(event) => setCreateTimezone(event.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                required
              />
            </label>
            <label className="text-xs md:col-span-2">
              {t('adminLessonReason')}
              <input
                aria-label="Create reason"
                value={createReason}
                onChange={(event) => setCreateReason(event.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                required
              />
            </label>
            <button
              type="submit"
              className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)] md:col-span-3"
            >
              {t('adminLessonReviewCreate')}
            </button>
          </form>
        )}
      </section>

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
                        {formatDate(item)} · {item.occurrence.durationMinutes} min ·{' '}
                        {item.occurrence.timeZone}
                      </p>
                      <p className="mt-1 text-[10px] font-mono text-[var(--ink-dim)]">
                        {item.instructor.displayName} · {item.lifecycle.status} · rev{' '}
                        {item.revision}
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
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="break-all font-mono text-[10px] text-[var(--ink-dim)]">
                    {detail.bookingId}
                  </p>
                  <h3 className="mt-2 text-base">
                    {admin.participants.map((participant) => participant.displayName).join(', ')}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label={t('adminLessonCloseDetail')}
                  onClick={() => updateQuery({ [ADMIN_LESSON_BOOKING_QUERY_KEY]: undefined })}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-[var(--ink-dim)]">{t('adminLessonSchedule')}</dt>
                <dd>
                  {formatDate(detail)} · {detail.occurrence.durationMinutes} min
                </dd>
                <dt className="text-[var(--ink-dim)]">{t('adminLessonTimezone')}</dt>
                <dd>{detail.occurrence.timeZone}</dd>
                <dt className="text-[var(--ink-dim)]">{t('adminLessonInstructor')}</dt>
                <dd>
                  {detail.instructor.displayName} · {detail.instructor.instructorId}
                </dd>
                <dt className="text-[var(--ink-dim)]">{t('adminLessonOrigin')}</dt>
                <dd>{admin.attribution.bookingOrigin}</dd>
                <dt className="text-[var(--ink-dim)]">{t('adminLessonLifecycle')}</dt>
                <dd>{detail.lifecycle.status}</dd>
                <dt className="text-[var(--ink-dim)]">{t('adminLessonRevisions')}</dt>
                <dd>
                  booking {detail.revision} · schedule {admin.scheduleRevision}
                </dd>
                <dt className="text-[var(--ink-dim)]">{t('adminLessonPayer')}</dt>
                <dd>
                  {admin.payer ? `${admin.payer.displayName} · ${admin.payer.accountId}` : '—'}
                </dd>
              </dl>

              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase">{t('adminLessonParticipants')}</h4>
                {admin.participants.map((participant) => (
                  <p key={participant.participantId} className="text-xs text-[var(--ink-dim)]">
                    {participant.displayName} · {participant.discipline} · {participant.skillLevel}{' '}
                    · {participant.participantId}
                  </p>
                ))}
              </div>

              {admin.payment && (
                <div className="space-y-2 border-t border-[var(--border)] pt-4">
                  <h4 className="text-xs font-mono uppercase">{t('adminLessonPaymentTitle')}</h4>
                  <p className="text-xs text-[var(--ink-dim)]">
                    {admin.payment.status} · original {formatKzt(admin.payment.originalPrice)} ·
                    price {formatKzt(admin.payment.price)} · paid {formatKzt(admin.payment.paid)} ·
                    refunded {formatKzt(admin.payment.refunded)} · retained{' '}
                    {formatKzt(admin.payment.retained)} · settled {formatKzt(admin.payment.settled)}{' '}
                    · written off {formatKzt(admin.payment.writtenOff)} · outstanding{' '}
                    {formatKzt(admin.payment.outstanding)} · rev {admin.payment.revision}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuery({
                        [ADMIN_TAB_QUERY_KEY]: 'finance',
                        [ADMIN_FINANCE_PAYMENT_QUERY_KEY]: admin.payment!.paymentId,
                      })
                    }
                    className="border border-[var(--border)] px-3 py-2 text-xs"
                  >
                    {t('adminLessonOpenPayment')}
                  </button>
                </div>
              )}

              {admin.cancellationFinancial && (
                <div className="border-t border-[var(--border)] pt-4 text-xs">
                  <h4 className="font-mono uppercase">{t('adminLessonCancellationFinance')}</h4>
                  <p className="mt-2 text-[var(--ink-dim)]">
                    {admin.cancellationFinancial.timing} · suggested{' '}
                    {formatKzt(admin.cancellationFinancial.suggestedRefund)} · maximum{' '}
                    {formatKzt(admin.cancellationFinancial.maximumRefund)}
                  </p>
                </div>
              )}

              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase">{t('adminLessonRelatedIssues')}</h4>
                {admin.relatedIssues.length === 0 ? (
                  <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonNoRelatedIssues')}</p>
                ) : (
                  admin.relatedIssues.map((issue) => (
                    <button
                      key={issue.issueId}
                      type="button"
                      onClick={() =>
                        updateQuery({
                          [ADMIN_TAB_QUERY_KEY]: 'operations',
                          [ADMIN_ISSUE_QUERY_KEY]: issue.issueId,
                        })
                      }
                      className="block w-full border border-[var(--border)] p-2 text-left text-xs"
                    >
                      {issue.kind} · {issue.severity} · {issue.lifecycleStatus} · rev{' '}
                      {issue.revision}
                    </button>
                  ))
                )}
              </div>

              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase">{t('adminLessonAttendanceTitle')}</h4>
                {(admin.attendance ?? []).map((record) => {
                  const participant = admin.participants.find(
                    (candidate) => candidate.participantId === record.participantId
                  );
                  return (
                    <div
                      key={record.participantId}
                      className="space-y-2 border border-[var(--border)] p-3 text-xs"
                    >
                      <p className="font-medium">
                        {participant?.displayName ?? record.participantId} ·{' '}
                        {record.attendanceStatus ?? t('adminLessonAttendanceMissing')}
                        {record.revision === undefined ? '' : ` · rev ${record.revision}`}
                      </p>
                      {record.recordedBy && record.lastChangedBy && (
                        <p className="break-all text-[var(--ink-dim)]">
                          {t('adminLessonAttendanceRecordedBy')}:{' '}
                          {attendanceActorLabel(record.recordedBy)} ·{' '}
                          {t('adminLessonAttendanceLastChangedBy')}:{' '}
                          {attendanceActorLabel(record.lastChangedBy)}
                        </p>
                      )}
                      {(record.authorizedActions.canRecordPresent ||
                        record.authorizedActions.canRecordAbsent) && (
                        <div className="flex gap-2">
                          {(['present', 'absent'] as const).map((attendanceStatus) => {
                            const allowed =
                              attendanceStatus === 'present'
                                ? record.authorizedActions.canRecordPresent
                                : record.authorizedActions.canRecordAbsent;
                            if (!allowed) return null;
                            return (
                              <button
                                key={attendanceStatus}
                                type="button"
                                disabled={!actionReason.trim()}
                                onClick={() =>
                                  requestDetailAttempt(
                                    detail,
                                    {
                                      kind: 'record_booking_attendance',
                                      participantId: record.participantId,
                                      attendanceStatus,
                                      ...(record.revision === undefined
                                        ? {}
                                        : { expectedAttendanceRevision: record.revision }),
                                      reasonExplanation: actionReason.trim(),
                                    },
                                    `${t('adminLessonConfirmAttendance')} ${participant?.displayName ?? record.participantId}: ${record.attendanceStatus ?? 'missing'} → ${attendanceStatus} @ booking rev ${detail.revision}${record.revision === undefined ? '' : `, attendance rev ${record.revision}`}`
                                  )
                                }
                                className="border border-[var(--border)] px-3 py-2 disabled:opacity-50"
                              >
                                {attendanceStatus === 'present'
                                  ? t('adminLessonRecordPresent')
                                  : t('adminLessonRecordAbsent')}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase">{t('adminLessonAuthorizedActions')}</h4>
                <label className="block text-xs">
                  {t('adminLessonReason')}
                  <input
                    aria-label="Action reason"
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                  />
                </label>

                {admin.authorizedActions.canConfirmGuest && (
                  <button
                    type="button"
                    onClick={() =>
                      requestDetailAttempt(
                        detail,
                        { kind: 'confirm_guest_booking' },
                        t('adminLessonConfirmGuestMessage')
                      )
                    }
                    className="w-full border border-emerald-500 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
                  >
                    {t('adminLessonConfirmGuest')}
                  </button>
                )}

                {admin.authorizedActions.canReschedule && (
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      aria-label="Reschedule date"
                      type="date"
                      value={rescheduleDate}
                      onChange={(event) => setRescheduleDate(event.target.value)}
                      className="border border-[var(--border)] bg-transparent p-2 text-xs"
                    />
                    <input
                      aria-label="Reschedule time"
                      type="time"
                      value={rescheduleTime}
                      onChange={(event) => setRescheduleTime(event.target.value)}
                      className="border border-[var(--border)] bg-transparent p-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={!actionReason.trim() || !rescheduleDate || !rescheduleTime}
                      onClick={() =>
                        requestDetailAttempt(
                          detail,
                          {
                            kind: 'reschedule_booking',
                            localDate: rescheduleDate,
                            localTime: rescheduleTime,
                            durationMinutes: detail.occurrence.durationMinutes,
                            timezone: detail.occurrence.timeZone,
                            reasonExplanation: actionReason.trim(),
                          },
                          t('adminLessonConfirmReschedule')
                        )
                      }
                      className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                    >
                      {t('adminLessonReschedule')}
                    </button>
                  </div>
                )}

                {admin.authorizedActions.canChangeInstructor && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      aria-label="Target instructor"
                      value={targetInstructorId}
                      onChange={(event) => setTargetInstructorId(event.target.value)}
                      className="border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
                    >
                      {instructors.map((instructor) => (
                        <option key={instructor.instructorId} value={instructor.instructorId}>
                          {instructor.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!actionReason.trim() || !targetInstructorId}
                      onClick={() =>
                        requestDetailAttempt(
                          detail,
                          {
                            kind: 'change_booking_instructor',
                            instructorId: targetInstructorId,
                            reasonExplanation: actionReason.trim(),
                          },
                          t('adminLessonConfirmReassign')
                        )
                      }
                      className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                    >
                      {t('adminLessonReassign')}
                    </button>
                  </div>
                )}

                {admin.authorizedActions.canChangeDuration && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      aria-label="Target duration"
                      type="number"
                      min="1"
                      max="1440"
                      value={targetDuration}
                      onChange={(event) => setTargetDuration(event.target.value)}
                      className="border border-[var(--border)] bg-transparent p-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={
                        !actionReason.trim() ||
                        !Number.isInteger(Number(targetDuration)) ||
                        Number(targetDuration) <= 0 ||
                        Number(targetDuration) > 1440
                      }
                      onClick={() =>
                        requestDetailAttempt(
                          detail,
                          {
                            kind: 'change_booking_duration',
                            durationMinutes: Number(targetDuration),
                            reasonExplanation: actionReason.trim(),
                          },
                          t('adminLessonConfirmDuration')
                        )
                      }
                      className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                    >
                      {t('adminLessonChangeDuration')}
                    </button>
                  </div>
                )}

                {(admin.authorizedActions.canResolveCancellation ||
                  admin.authorizedActions.canDirectCancel) && (
                  <div className="space-y-2 border border-[var(--border)] p-3">
                    <label className="block text-xs">
                      {t('adminLessonRefund')}
                      <input
                        aria-label="Cancellation refund"
                        type="number"
                        min="0"
                        max={admin.cancellationFinancial?.maximumRefund}
                        value={refundAmount}
                        onChange={(event) => setRefundAmount(event.target.value)}
                        className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                      />
                    </label>
                    <div className="flex gap-2">
                      {admin.authorizedActions.canResolveCancellation && (
                        <>
                          <button
                            type="button"
                            disabled={
                              !actionReason.trim() ||
                              !Number.isInteger(Number(refundAmount)) ||
                              Number(refundAmount) < 0 ||
                              Number(refundAmount) >
                                (admin.cancellationFinancial?.maximumRefund ?? 0)
                            }
                            onClick={() =>
                              requestDetailAttempt(
                                detail,
                                {
                                  kind: 'resolve_booking_cancellation',
                                  paymentId: admin.payment!.paymentId,
                                  paymentRevision: admin.payment!.revision,
                                  decision: 'approve',
                                  refundAmount: Number(refundAmount),
                                  reasonExplanation: actionReason.trim(),
                                },
                                t('adminLessonConfirmApproveCancel')
                              )
                            }
                            className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                          >
                            {t('adminLessonApproveCancellation')}
                          </button>
                          <button
                            type="button"
                            disabled={!actionReason.trim()}
                            onClick={() =>
                              requestDetailAttempt(
                                detail,
                                {
                                  kind: 'resolve_booking_cancellation',
                                  paymentId: admin.payment!.paymentId,
                                  decision: 'reject',
                                  reasonExplanation: actionReason.trim(),
                                },
                                t('adminLessonConfirmRejectCancel')
                              )
                            }
                            className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                          >
                            {t('adminLessonRejectCancellation')}
                          </button>
                        </>
                      )}
                      {admin.authorizedActions.canDirectCancel && (
                        <button
                          type="button"
                          disabled={
                            !actionReason.trim() ||
                            !Number.isInteger(Number(refundAmount)) ||
                            Number(refundAmount) < 0 ||
                            Number(refundAmount) > (admin.cancellationFinancial?.maximumRefund ?? 0)
                          }
                          onClick={() =>
                            requestDetailAttempt(
                              detail,
                              {
                                kind: 'resolve_booking_cancellation',
                                paymentId: admin.payment!.paymentId,
                                paymentRevision: admin.payment!.revision,
                                decision: 'direct_cancel',
                                refundAmount: Number(refundAmount),
                                reasonExplanation: actionReason.trim(),
                              },
                              t('adminLessonConfirmDirectCancel')
                            )
                          }
                          className="border border-rose-500 px-3 py-2 text-xs text-rose-600 disabled:opacity-50"
                        >
                          {t('adminLessonDirectCancel')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {admin.authorizedActions.canResolveAttendanceOutcome && (
                  <button
                    type="button"
                    onClick={() =>
                      requestDetailAttempt(
                        detail,
                        { kind: 'resolve_attendance_outcome' },
                        t('adminLessonConfirmOutcome')
                      )
                    }
                    className="w-full border border-[var(--border)] px-3 py-2 text-xs"
                  >
                    {t('adminLessonResolveOutcome')}
                  </button>
                )}

                {!Object.values(admin.authorizedActions).some(Boolean) && (
                  <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonNoActions')}</p>
                )}
              </div>

              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  disabled
                  className="w-full border border-[var(--border)] px-3 py-2 text-xs opacity-50"
                >
                  {t('adminLessonLinkDeferred')}
                </button>
                <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonLinkDeferredHint')}</p>
                {detail.bookingOrigin === 'guest' &&
                  detail.lifecycle.status === 'pending' &&
                  !admin.authorizedActions.canConfirmGuest && (
                    <p className="flex gap-2 text-xs text-amber-700">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {t('adminLessonGuestApprovalUnavailable')}
                    </p>
                  )}
              </div>
            </div>
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
