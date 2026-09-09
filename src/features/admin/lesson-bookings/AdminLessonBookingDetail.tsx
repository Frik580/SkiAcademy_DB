import type {
  LessonBookingAdminProjection,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { AlertTriangle, CalendarDays, MessageSquareText, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { formatLessonDifficultyOrUnspecified } from '../../../lib/i18n/bookingLabels';
import type { Language, TranslationKey } from '../../../lib/i18n/translations';
import { AdminManagedParticipantPicker } from '../identity';
import type { AdminManagedParticipantSelection } from '../identity';
import type { AdminLessonBookingMutationDraft } from './lessonBookingAdminContracts';
import {
  attendanceStatusLabelKey,
  attendanceUnavailableReason,
  formatLessonAdminDuration,
  guestLinkUnavailableLabelKey,
  hasSchedulingPlannerHint,
  isPendingUnpaidOutstanding,
  issueKindLabelKey,
  issueSeverityLabelKey,
  issueStatusLabelKey,
  LESSON_ADMIN_EMPTY_ACTIONS_KEYS,
  LESSON_ADMIN_ORIGIN_LABEL_KEYS,
  LESSON_ADMIN_PAYMENT_ANCILLARY_ROW_KEYS,
  LESSON_ADMIN_PAYMENT_PRIMARY_ROW_KEYS,
  LESSON_ADMIN_PRIMARY_STATUS_KEYS,
  lessonAdminPaymentAncillaryRows,
  lessonAdminPaymentPrimaryRows,
  needsSharedActionReason,
  PAYMENT_STATUS_LABEL_KEYS,
  resolveLessonAdminEmptyActionsReason,
  resolveLessonAdminPrimaryStatus,
  shouldShowCancellationSection,
  shouldShowGuestSection,
  shouldShowOutcomeAction,
  shouldShowPayerRow,
  trueAuthorizedActionKeys,
} from './lessonBookingAdminPresentation';
import {
  AdminLessonDetailTabs,
  AdminLessonOriginBadge,
  AdminLessonPaymentIndicator,
  AdminLessonStatusChip,
  type AdminLessonDetailSection,
} from './AdminLessonBookingUi';

export interface AdminLessonBookingDetailProps {
  readonly detail: LessonBookingReadModel;
  readonly admin: LessonBookingAdminProjection;
  readonly language: Language;
  readonly locale: string;
  readonly t: (key: TranslationKey) => string;
  readonly actionReason: string;
  readonly onActionReasonChange: (value: string) => void;
  readonly refundAmount: string;
  readonly onRefundAmountChange: (value: string) => void;
  readonly paymentAmount: string;
  readonly onPaymentAmountChange: (value: string) => void;
  readonly linkSelection: AdminManagedParticipantSelection | undefined;
  readonly onLinkSelectionChange: (selection: AdminManagedParticipantSelection | undefined) => void;
  readonly linkReason: string;
  readonly onLinkReasonChange: (value: string) => void;
  readonly onRequestAttempt: (attempt: AdminLessonBookingMutationDraft, message: string) => void;
  readonly onOpenPlanner: () => void;
  readonly onClose: () => void;
  readonly onOpenPayment: (paymentId: string) => void;
  readonly onOpenIssue: (issueId: string) => void;
  readonly focusedChangeRequestId?: string;
}

function formatOccurrenceParts(
  item: LessonBookingReadModel,
  locale: string
): { date: string; timeRange: string; header: string } {
  const timeZone = item.occurrence.timeZone;
  const start = new Date(item.occurrence.startsAt.seconds * 1_000);
  const end = new Date(item.occurrence.endsAt.seconds * 1_000);
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(start);
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
  const startTime = timeFmt.format(start).replace(/^24:/, '00:');
  const endTime = timeFmt.format(end).replace(/^24:/, '00:');
  const timeRange = `${startTime}–${endTime}`;
  return { date, timeRange, header: `${date}, ${timeRange}` };
}

function formatInstant(
  value: { seconds: number; nanoseconds: number },
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value.seconds * 1_000));
}

function ReasonField({
  value,
  onChange,
  t,
  ariaLabel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly t: (key: TranslationKey) => string;
  readonly ariaLabel: string;
}) {
  const inputId = useId();
  return (
    <label htmlFor={inputId} className="block text-xs">
      {t('adminLessonReason')}
      <input
        id={inputId}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
      />
    </label>
  );
}

export function AdminLessonBookingDetail({
  detail,
  admin,
  language,
  locale,
  t,
  actionReason,
  onActionReasonChange,
  refundAmount,
  onRefundAmountChange,
  paymentAmount,
  onPaymentAmountChange,
  linkSelection,
  onLinkSelectionChange,
  linkReason,
  onLinkReasonChange,
  onRequestAttempt,
  onOpenPlanner,
  onClose,
  onOpenPayment,
  onOpenIssue,
  focusedChangeRequestId,
}: AdminLessonBookingDetailProps) {
  const occurrence = formatOccurrenceParts(detail, locale);
  const [activeSection, setActiveSection] = useState<AdminLessonDetailSection['id']>('overview');
  const formatKzt = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    }).format(value);
  const participantNames = admin.participants
    .map((participant) => participant.displayName)
    .join(', ');
  const primaryStatus = resolveLessonAdminPrimaryStatus(detail);
  const statusLabel = t(LESSON_ADMIN_PRIMARY_STATUS_KEYS[primaryStatus]);
  const emptyActions = resolveLessonAdminEmptyActionsReason(detail);
  const showCancellation = shouldShowCancellationSection(detail);
  const showGuest = shouldShowGuestSection(detail);
  const showPayer = shouldShowPayerRow(admin);
  const showOutcome = shouldShowOutcomeAction(admin);
  const showPlannerHint = hasSchedulingPlannerHint(admin);
  const attendancePending = attendanceUnavailableReason(detail) === 'pending';
  const attendanceHasMutations = (admin.attendance ?? []).some(
    (record) =>
      record.authorizedActions.canRecordPresent || record.authorizedActions.canRecordAbsent
  );
  const showReason = needsSharedActionReason(admin);
  const reasonInAttendance = showReason && attendanceHasMutations;
  const reasonInCancellation =
    showReason &&
    (admin.authorizedActions.canDirectCancel || admin.authorizedActions.canResolveCancellation);
  const refundValid =
    Number.isInteger(Number(refundAmount)) &&
    Number(refundAmount) >= 0 &&
    Number(refundAmount) <= (admin.cancellationFinancial?.maximumRefund ?? 0);
  const payment = admin.payment;
  const awaitingPayment = isPendingUnpaidOutstanding(detail);
  const showAttendance = (admin.attendance ?? []).length > 0 || attendancePending || showOutcome;
  const openCriticalIssues = admin.relatedIssues.filter(
    (issue) => issue.severity === 'critical' && issue.lifecycleStatus === 'open'
  );
  const parsedPaymentAmount = Number(paymentAmount);
  const paymentAmountValid =
    Number.isInteger(parsedPaymentAmount) &&
    parsedPaymentAmount > 0 &&
    parsedPaymentAmount <= payment.outstanding;
  const openChangeRequests = useMemo(
    () => admin.relatedOpenChangeRequests ?? [],
    [admin.relatedOpenChangeRequests]
  );
  const focusedChangeRequest =
    openChangeRequests.find((item) => item.requestId === focusedChangeRequestId) ??
    openChangeRequests[0];
  const sections = useMemo<readonly AdminLessonDetailSection[]>(
    () => [
      { id: 'overview', label: t('adminLessonOverviewTitle') },
      {
        id: 'payment',
        label: t('adminLessonPaymentTitle'),
        attention: awaitingPayment,
      },
      ...(showAttendance
        ? [{ id: 'attendance' as const, label: t('adminLessonAttendanceTitle') }]
        : []),
      ...(showCancellation
        ? [
            {
              id: 'cancellation' as const,
              label: t('adminLessonCancellationTitle'),
              attention: detail.lifecycle.status === 'pending_cancellation',
            },
          ]
        : []),
      ...(showGuest ? [{ id: 'guest' as const, label: t('adminLessonGuestTitle') }] : []),
      ...(admin.relatedIssues.length > 0
        ? [
            {
              id: 'issues' as const,
              label: t('adminLessonRelatedIssues'),
              attention: admin.relatedIssues.some((issue) => issue.lifecycleStatus === 'open'),
            },
          ]
        : []),
      { id: 'technical', label: t('adminLessonTechnicalDetails') },
    ],
    [
      admin.relatedIssues,
      awaitingPayment,
      detail.lifecycle.status,
      showAttendance,
      showCancellation,
      showGuest,
      t,
    ]
  );

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection, sections]);

  return (
    <div>
      <div className="sticky top-3 z-20 rounded-t-[var(--radius)] bg-[var(--card-bg)] shadow-[0_8px_20px_-18px_rgba(17,17,17,0.45)] lg:top-0">
        <header className="space-y-3 p-4 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-medium">{participantNames}</h3>
              <p className="mt-1 text-xs text-[var(--ink-dim)]">
                {occurrence.header} · {detail.instructor.displayName}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <AdminLessonStatusChip status={primaryStatus} label={statusLabel} />
                <AdminLessonPaymentIndicator
                  status={payment.status}
                  label={t(PAYMENT_STATUS_LABEL_KEYS[payment.status])}
                />
                <AdminLessonOriginBadge
                  origin={detail.bookingOrigin}
                  label={t(LESSON_ADMIN_ORIGIN_LABEL_KEYS[detail.bookingOrigin])}
                />
              </div>
            </div>
            <button
              type="button"
              aria-label={t('adminLessonCloseDetail')}
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label={t('openInPlanner')}
              onClick={onOpenPlanner}
              className="inline-flex items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent-muted)] px-3 py-2 text-xs font-semibold text-[var(--accent)]"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {t('openInPlanner')}
            </button>
            <button
              type="button"
              disabled
              aria-describedby="admin-lesson-sms-unavailable"
              title={t('adminLessonSmsUnavailable')}
              className="inline-flex cursor-not-allowed items-center gap-1.5 border border-[var(--border)] px-3 py-2 text-xs text-[var(--ink-dim)] opacity-60"
            >
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
              {t('adminLessonSendSms')}
            </button>
            <span
              id="admin-lesson-sms-unavailable"
              className="basis-full text-[10px] text-[var(--ink-dim)]"
            >
              {t('adminLessonSmsUnavailable')}
            </span>
          </div>
          {(awaitingPayment ||
            detail.lifecycle.status === 'pending_cancellation' ||
            openCriticalIssues.length > 0 ||
            focusedChangeRequest) && (
            <div className="grid gap-2 xl:grid-cols-2">
              {awaitingPayment && (
                <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('adminLessonAttentionAwaitingPayment')}
                  </p>
                  <p className="mt-1 text-[var(--ink-dim)]">
                    {t('adminLessonAwaitingPaymentDetail').replace(
                      '{amount}',
                      formatKzt(payment.outstanding)
                    )}
                  </p>
                  {detail.bookingOrigin === 'guest' && (
                    <p className="mt-1 text-[var(--ink-dim)]">
                      {t('adminLessonGuestApprovalUnavailable')}
                    </p>
                  )}
                </div>
              )}
              {detail.lifecycle.status === 'pending_cancellation' && (
                <div className="rounded-[var(--radius-md)] border border-rose-500/30 bg-rose-500/[0.07] p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-rose-900 dark:text-rose-200">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('adminLessonCancellationRequested')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('cancellation')}
                    className="mt-2 text-xs font-semibold text-rose-700 underline-offset-2 hover:underline dark:text-rose-300"
                  >
                    {t('adminLessonOpenCancellation')}
                  </button>
                </div>
              )}
              {openCriticalIssues.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/[0.07] p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-red-900 dark:text-red-200">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('adminLessonCriticalIssues').replace(
                      '{n}',
                      String(openCriticalIssues.length)
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('issues')}
                    className="mt-2 text-xs font-semibold text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                  >
                    {t('adminLessonRelatedIssues')}
                  </button>
                </div>
              )}
              {focusedChangeRequest && (
                <div
                  id={`admin-change-request-${focusedChangeRequest.requestId}`}
                  className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs"
                >
                  <p className="font-semibold">{t('adminLessonInstructorRequestedChange')}</p>
                  <p className="mt-1 text-[var(--ink-dim)]">{focusedChangeRequest.reason}</p>
                  <button
                    type="button"
                    onClick={onOpenPlanner}
                    className="mt-2 font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    {t('openInPlanner')}
                  </button>
                </div>
              )}
            </div>
          )}
        </header>
        <AdminLessonDetailTabs
          sections={sections}
          activeSection={activeSection}
          onChange={setActiveSection}
          ariaLabel={t('adminLessonDetailSections')}
          attentionLabel={t('adminLessonRequiresAttention')}
        />
      </div>

      <div
        id={`admin-lesson-panel-${activeSection}`}
        role="tabpanel"
        aria-labelledby={`admin-lesson-tab-${activeSection}`}
        className="space-y-5 p-4 lg:p-5"
      >
        {activeSection === 'overview' && (
          <section aria-label={t('adminLessonOverviewTitle')} className="space-y-5">
            <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-[var(--ink-dim)]">{t('adminLessonDate')}</dt>
              <dd>{occurrence.date}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminLessonTime')}</dt>
              <dd>{occurrence.timeRange}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminLessonDuration')}</dt>
              <dd>{formatLessonAdminDuration(detail.occurrence.durationMinutes, t)}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminLessonInstructor')}</dt>
              <dd>{detail.instructor.displayName}</dd>
              <dt className="text-[var(--ink-dim)]">
                {admin.participants.length > 1
                  ? t('adminLessonParticipants')
                  : t('adminLessonParticipant')}
              </dt>
              <dd>{participantNames}</dd>
              {showPayer && admin.payer && (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminLessonPayer')}</dt>
                  <dd>{admin.payer.displayName}</dd>
                </>
              )}
              <dt className="text-[var(--ink-dim)]">{t('adminLessonDifficulty')}</dt>
              <dd>
                {formatLessonDifficultyOrUnspecified(
                  detail.difficulty,
                  language,
                  t('difficultyUnspecified'),
                  'short'
                )}
              </dd>
              {detail.notes ? (
                <>
                  <dt className="text-[var(--ink-dim)]">{t('adminLessonNotes')}</dt>
                  <dd>{detail.notes}</dd>
                </>
              ) : null}
            </dl>
            {focusedChangeRequest && (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/[0.05] p-4">
                <div>
                  <h4 className="text-sm font-medium">
                    {t('adminLessonInstructorRequestedChange')}
                  </h4>
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">
                    {focusedChangeRequest.reason} ·{' '}
                    {formatInstant(
                      focusedChangeRequest.createdAt,
                      locale,
                      detail.occurrence.timeZone
                    )}
                  </p>
                </div>
                <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonScheduleInPlanner')}</p>
                <ReasonField
                  value={actionReason}
                  onChange={onActionReasonChange}
                  t={t}
                  ariaLabel={t('adminLessonReason')}
                />
                <label htmlFor="admin-change-request-refund" className="block text-xs">
                  {t('adminLessonRefund')}
                  <input
                    id="admin-change-request-refund"
                    aria-label={t('adminLessonRefund')}
                    type="number"
                    min="0"
                    max={admin.cancellationFinancial?.maximumRefund}
                    value={refundAmount}
                    onChange={(event) => onRefundAmountChange(event.target.value)}
                    className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenPlanner}
                    className="border border-[var(--accent)] bg-[var(--accent-muted)] px-3 py-2 text-xs font-semibold text-[var(--accent)]"
                  >
                    {t('openInPlanner')}
                  </button>
                  <button
                    type="button"
                    disabled={!actionReason.trim() || !refundValid}
                    onClick={() =>
                      onRequestAttempt(
                        {
                          kind: 'resolve_booking_change_request',
                          bookingChangeRequestId: focusedChangeRequest.requestId,
                          requestRevision: focusedChangeRequest.revision,
                          resolution: 'booking_cancelled',
                          refundAmount: Number(refundAmount),
                          reasonExplanation: actionReason.trim(),
                        },
                        t('adminLessonResolveChangeCancel')
                      )
                    }
                    className="border border-rose-500/40 px-3 py-2 text-xs text-rose-700 disabled:opacity-50 dark:text-rose-300"
                  >
                    {t('adminLessonResolveChangeCancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRequestAttempt(
                        {
                          kind: 'resolve_booking_change_request',
                          bookingChangeRequestId: focusedChangeRequest.requestId,
                          requestRevision: focusedChangeRequest.revision,
                          resolution: 'no_change',
                        },
                        t('adminLessonResolveChangeReject')
                      )
                    }
                    className="border border-[var(--border)] px-3 py-2 text-xs"
                  >
                    {t('adminLessonResolveChangeReject')}
                  </button>
                </div>
              </div>
            )}
            {(emptyActions || showPlannerHint) && (
              <div className="rounded-[var(--radius-md)] bg-[var(--profile-bg)] p-3">
                {showPlannerHint && (
                  <p className="text-xs text-[var(--ink-dim)]">
                    {t('adminLessonScheduleInPlanner')}
                  </p>
                )}
                {emptyActions && (
                  <p className="text-xs text-[var(--ink-dim)]">
                    {t(LESSON_ADMIN_EMPTY_ACTIONS_KEYS[emptyActions])}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {activeSection === 'payment' && payment && (
          <section aria-label={t('adminLessonPaymentTitle')} className="space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-wide">
              {t('adminLessonPaymentTitle')}
            </h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {lessonAdminPaymentPrimaryRows(payment).map((row) => (
                <div key={row.id} className="contents">
                  <dt className="text-[var(--ink-dim)]">
                    {t(LESSON_ADMIN_PAYMENT_PRIMARY_ROW_KEYS[row.id])}
                  </dt>
                  <dd className="text-right tabular-nums">{formatKzt(row.amount)}</dd>
                </div>
              ))}
              {lessonAdminPaymentAncillaryRows(payment).map((row) => (
                <div key={row.id} className="contents">
                  <dt className="text-[var(--ink-dim)]">
                    {t(LESSON_ADMIN_PAYMENT_ANCILLARY_ROW_KEYS[row.id])}
                  </dt>
                  <dd className="text-right tabular-nums">{formatKzt(row.amount)}</dd>
                </div>
              ))}
              <dt className="text-[var(--ink-dim)]">{t('adminLessonPaymentStatus')}</dt>
              <dd>{t(PAYMENT_STATUS_LABEL_KEYS[payment.status])}</dd>
            </dl>
            {admin.authorizedActions.canRecordGuestPayment && (
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <label htmlFor="admin-guest-payment-amount" className="block text-xs">
                  {t('adminLessonPaymentAmount')}
                  <input
                    id="admin-guest-payment-amount"
                    aria-label={t('adminLessonPaymentAmount')}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={payment.outstanding}
                    step="1"
                    value={paymentAmount}
                    onChange={(event) => onPaymentAmountChange(event.target.value)}
                    className="mt-1 w-full border border-[var(--border)] bg-transparent p-2 tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  disabled={!paymentAmountValid}
                  onClick={() =>
                    onRequestAttempt(
                      {
                        kind: 'record_provider_payment_event',
                        paymentId: payment.paymentId,
                        paymentRevision: payment.revision,
                        amount: parsedPaymentAmount,
                      },
                      t('adminLessonConfirmPayment').replace(
                        '{amount}',
                        formatKzt(parsedPaymentAmount)
                      )
                    )
                  }
                  className="w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)] disabled:opacity-50"
                >
                  {t('adminLessonRecordPayment')}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenPayment(payment.paymentId)}
              className="border border-[var(--border)] px-3 py-2 text-xs"
            >
              {t('adminLessonOpenPayment')}
            </button>
          </section>
        )}

        {activeSection === 'attendance' && showAttendance && (
          <section aria-label={t('adminLessonAttendanceTitle')} className="space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-wide">
              {t('adminLessonAttendanceTitle')}
            </h4>
            {(admin.attendance ?? []).map((record) => {
              const participant = admin.participants.find(
                (candidate) => candidate.participantId === record.participantId
              );
              const canPresent = record.authorizedActions.canRecordPresent;
              const canAbsent = record.authorizedActions.canRecordAbsent;
              return (
                <div key={record.participantId} className="space-y-2 text-xs">
                  <p className="font-medium">{participant?.displayName ?? record.participantId}</p>
                  <p className="text-[var(--ink-dim)]">
                    {t(attendanceStatusLabelKey(record.attendanceStatus))}
                  </p>
                  {(canPresent || canAbsent) && (
                    <div className="flex flex-wrap gap-2">
                      {canPresent && (
                        <button
                          type="button"
                          disabled={!actionReason.trim()}
                          onClick={() =>
                            onRequestAttempt(
                              {
                                kind: 'record_booking_attendance',
                                participantId: record.participantId,
                                attendanceStatus: 'present',
                                ...(record.revision === undefined
                                  ? {}
                                  : { expectedAttendanceRevision: record.revision }),
                                reasonExplanation: actionReason.trim(),
                              },
                              `${t('adminLessonConfirmAttendance')} ${participant?.displayName ?? record.participantId}: ${record.attendanceStatus ?? 'missing'} → present @ booking rev ${detail.revision}${record.revision === undefined ? '' : `, attendance rev ${record.revision}`}`
                            )
                          }
                          className="border border-[var(--border)] px-3 py-2 disabled:opacity-50"
                        >
                          {t('adminLessonRecordPresent')}
                        </button>
                      )}
                      {canAbsent && (
                        <button
                          type="button"
                          disabled={!actionReason.trim()}
                          onClick={() =>
                            onRequestAttempt(
                              {
                                kind: 'record_booking_attendance',
                                participantId: record.participantId,
                                attendanceStatus: 'absent',
                                ...(record.revision === undefined
                                  ? {}
                                  : { expectedAttendanceRevision: record.revision }),
                                reasonExplanation: actionReason.trim(),
                              },
                              `${t('adminLessonConfirmAttendance')} ${participant?.displayName ?? record.participantId}: ${record.attendanceStatus ?? 'missing'} → absent @ booking rev ${detail.revision}${record.revision === undefined ? '' : `, attendance rev ${record.revision}`}`
                            )
                          }
                          className="border border-[var(--border)] px-3 py-2 disabled:opacity-50"
                        >
                          {t('adminLessonRecordAbsent')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {attendancePending && (
              <p className="text-xs text-[var(--ink-dim)]">
                {t('adminLessonAttendanceAfterConfirm')}
              </p>
            )}
            {showOutcome && (
              <button
                type="button"
                onClick={() =>
                  onRequestAttempt(
                    { kind: 'resolve_attendance_outcome' },
                    t('adminLessonConfirmOutcome')
                  )
                }
                className="w-full border border-[var(--border)] px-3 py-2 text-xs"
              >
                {t('adminLessonResolveOutcome')}
              </button>
            )}
            {reasonInAttendance && (
              <ReasonField
                value={actionReason}
                onChange={onActionReasonChange}
                t={t}
                ariaLabel={t('adminLessonReason')}
              />
            )}
          </section>
        )}

        {activeSection === 'cancellation' && showCancellation && (
          <section aria-label={t('adminLessonCancellationTitle')} className="space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-wide">
              {t('adminLessonCancellationTitle')}
            </h4>
            {detail.lifecycle.status === 'pending_cancellation' && (
              <p className="text-xs">{t('adminLessonCancellationRequested')}</p>
            )}
            {(admin.authorizedActions.canResolveCancellation ||
              admin.authorizedActions.canDirectCancel) && (
              <div className="space-y-2">
                <label htmlFor="admin-cancellation-refund" className="block text-xs">
                  {t('adminLessonRefund')}
                  <input
                    id="admin-cancellation-refund"
                    aria-label="Cancellation refund"
                    type="number"
                    min="0"
                    max={admin.cancellationFinancial?.maximumRefund}
                    value={refundAmount}
                    onChange={(event) => onRefundAmountChange(event.target.value)}
                    className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                  />
                </label>
                {reasonInCancellation && (
                  <ReasonField
                    value={actionReason}
                    onChange={onActionReasonChange}
                    t={t}
                    ariaLabel={t('adminLessonReason')}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {admin.authorizedActions.canResolveCancellation && (
                    <>
                      <button
                        type="button"
                        disabled={!actionReason.trim() || !refundValid}
                        onClick={() =>
                          onRequestAttempt(
                            {
                              kind: 'resolve_booking_cancellation',
                              paymentId: admin.payment.paymentId,
                              paymentRevision: admin.payment.revision,
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
                          onRequestAttempt(
                            {
                              kind: 'resolve_booking_cancellation',
                              paymentId: admin.payment.paymentId,
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
                      disabled={!actionReason.trim() || !refundValid}
                      onClick={() =>
                        onRequestAttempt(
                          {
                            kind: 'resolve_booking_cancellation',
                            paymentId: admin.payment.paymentId,
                            paymentRevision: admin.payment.revision,
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
          </section>
        )}

        {activeSection === 'guest' && showGuest && (
          <section aria-label={t('adminLessonGuestTitle')} className="space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-wide">
              {t('adminLessonGuestTitle')}
            </h4>
            <p className="text-xs">
              {t('adminLessonParticipant')}: {participantNames}
            </p>
            {admin.authorizedActions.canLinkGuestToAccount ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonLinkGuestHint')}</p>
                <AdminManagedParticipantPicker
                  selected={linkSelection}
                  onChange={(selection) => onLinkSelectionChange(selection)}
                />
                <label htmlFor="admin-guest-link-reason" className="block text-xs">
                  {t('adminLessonReason')}
                  <input
                    id="admin-guest-link-reason"
                    aria-label="Link reason"
                    value={linkReason}
                    onChange={(event) => onLinkReasonChange(event.target.value)}
                    className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
                  />
                </label>
                {linkSelection && (
                  <p className="text-xs text-[var(--ink-dim)]">
                    {t('adminLessonLinkReview')
                      .replace('{guest}', admin.participants[0]?.displayName ?? detail.bookingId)
                      .replace(
                        '{account}',
                        linkSelection.accountDisplayName ?? linkSelection.accountId
                      )
                      .replace('{participant}', linkSelection.displayName)}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!linkSelection || !linkReason.trim()}
                  onClick={() => {
                    if (!linkSelection) return;
                    onRequestAttempt(
                      {
                        kind: 'link_guest_booking_to_account_as_administrator',
                        targetAccountId: linkSelection.accountId,
                        targetParticipantId: linkSelection.participantId,
                        ...(linkSelection.accountDisplayName
                          ? { targetAccountDisplayName: linkSelection.accountDisplayName }
                          : {}),
                        targetParticipantDisplayName: linkSelection.displayName,
                        reasonExplanation: linkReason.trim(),
                      },
                      t('adminLessonConfirmLinkGuest')
                    );
                  }}
                  className="w-full border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                >
                  {t('adminLessonLinkGuest')}
                </button>
              </div>
            ) : (
              <div className="space-y-1 text-xs text-[var(--ink-dim)]">
                <p>{t('adminLessonLinkUnavailable')}</p>
                <p>
                  {t(
                    guestLinkUnavailableLabelKey(
                      admin.guestIdentityLinkUnavailableReason ?? 'ineligible_lifecycle'
                    )
                  )}
                </p>
              </div>
            )}
          </section>
        )}

        {activeSection === 'issues' && admin.relatedIssues.length > 0 && (
          <section aria-label={t('adminLessonRelatedIssues')} className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wide">
              {t('adminLessonRelatedIssues')}
            </h4>
            {admin.relatedIssues.map((issue) => (
              <div
                key={issue.issueId}
                className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-xs"
              >
                <p>
                  {t(issueSeverityLabelKey(issue.severity))} · {t(issueKindLabelKey(issue.kind))} ·{' '}
                  {t(issueStatusLabelKey(issue.lifecycleStatus))}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenIssue(issue.issueId)}
                  className="border border-[var(--border)] px-3 py-1.5"
                >
                  {t('adminLessonOpenIssue')}
                </button>
              </div>
            ))}
          </section>
        )}

        {activeSection === 'technical' && (
          <details className="rounded-[var(--radius-md)] bg-[var(--profile-bg)] p-3">
            <summary className="cursor-pointer text-xs text-[var(--ink-dim)]">
              {t('adminLessonTechnicalDetails')}
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 break-all font-mono text-[10px] text-[var(--ink-dim)]">
              <dt>{t('adminLessonBookingId')}</dt>
              <dd>{detail.bookingId}</dd>
              <dt>{t('adminLessonRevisions')}</dt>
              <dd>
                booking {detail.revision} · schedule {admin.scheduleRevision}
              </dd>
              {payment && (
                <>
                  <dt>{t('adminLessonPaymentRevision')}</dt>
                  <dd>
                    {payment.paymentId} · rev {payment.revision}
                  </dd>
                </>
              )}
              <dt>{t('adminLessonLifecycle')}</dt>
              <dd>{detail.lifecycle.status}</dd>
              {payment && (
                <>
                  <dt>{t('adminLessonPaymentStatus')}</dt>
                  <dd>{payment.status}</dd>
                </>
              )}
              <dt>{t('adminLessonOrigin')}</dt>
              <dd>{admin.attribution.bookingOrigin}</dd>
              <dt>{t('adminLessonInstructor')}</dt>
              <dd>{detail.instructor.instructorId}</dd>
              <dt>{t('adminLessonParticipants')}</dt>
              <dd>
                {admin.participants.map((participant) => participant.participantId).join(', ')}
              </dd>
              {admin.payer && (
                <>
                  <dt>{t('adminLessonPayer')}</dt>
                  <dd>{admin.payer.accountId}</dd>
                </>
              )}
              <dt>{t('adminLessonTimezone')}</dt>
              <dd>{detail.occurrence.timeZone}</dd>
              <dt>{t('adminLessonUpdatedAt')}</dt>
              <dd>{formatInstant(detail.updatedAt, locale, detail.occurrence.timeZone)}</dd>
              {admin.cancellationFinancial && (
                <>
                  <dt>{t('adminLessonCancellationFinance')}</dt>
                  <dd>
                    {admin.cancellationFinancial.timing} · suggested{' '}
                    {formatKzt(admin.cancellationFinancial.suggestedRefund)} · maximum{' '}
                    {formatKzt(admin.cancellationFinancial.maximumRefund)}
                  </dd>
                </>
              )}
              <dt>{t('adminLessonAuthorizedActions')}</dt>
              <dd>{trueAuthorizedActionKeys(admin).join(', ') || '—'}</dd>
            </dl>
          </details>
        )}
      </div>
      {sections
        .filter((section) => section.id !== activeSection)
        .map((section) => (
          <div
            key={section.id}
            id={`admin-lesson-panel-${section.id}`}
            role="tabpanel"
            aria-labelledby={`admin-lesson-tab-${section.id}`}
            hidden
          />
        ))}
    </div>
  );
}
