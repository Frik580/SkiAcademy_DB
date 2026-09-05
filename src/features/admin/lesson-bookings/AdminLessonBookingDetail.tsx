import type {
  LessonBookingAdminProjection,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
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
  LESSON_ADMIN_PAYMENT_ANCILLARY_ROW_KEYS,
  LESSON_ADMIN_PAYMENT_PRIMARY_ROW_KEYS,
  LESSON_ADMIN_PRIMARY_STATUS_KEYS,
  lessonAdminPaymentAncillaryRows,
  lessonAdminPaymentPrimaryRows,
  lessonAdminPrimaryStatusBadgeTone,
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

const BADGE_TONE_CLASS: Record<ReturnType<typeof lessonAdminPrimaryStatusBadgeTone>, string> = {
  pending:
    'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300',
  confirmed:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300',
  pending_cancellation:
    'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300',
  cancelled:
    'border-slate-500/20 bg-slate-500/10 text-slate-600 dark:border-slate-700/40 dark:bg-slate-800/40 dark:text-slate-400',
  completed:
    'border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]',
};

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
  readonly linkSelection: AdminManagedParticipantSelection | undefined;
  readonly onLinkSelectionChange: (selection: AdminManagedParticipantSelection | undefined) => void;
  readonly linkReason: string;
  readonly onLinkReasonChange: (value: string) => void;
  readonly onRequestAttempt: (attempt: AdminLessonBookingMutationDraft, message: string) => void;
  readonly onOpenPlanner: () => void;
  readonly onClose: () => void;
  readonly onOpenPayment: (paymentId: string) => void;
  readonly onOpenIssue: (issueId: string) => void;
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
  return (
    <label className="block text-xs">
      {t('adminLessonReason')}
      <input
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
  linkSelection,
  onLinkSelectionChange,
  linkReason,
  onLinkReasonChange,
  onRequestAttempt,
  onOpenPlanner,
  onClose,
  onOpenPayment,
  onOpenIssue,
}: AdminLessonBookingDetailProps) {
  const occurrence = formatOccurrenceParts(detail, locale);
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
  const badgeTone = lessonAdminPrimaryStatusBadgeTone(primaryStatus);
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
    !attendanceHasMutations &&
    (admin.authorizedActions.canDirectCancel || admin.authorizedActions.canResolveCancellation);
  const refundValid =
    Number.isInteger(Number(refundAmount)) &&
    Number(refundAmount) >= 0 &&
    Number(refundAmount) <= (admin.cancellationFinancial?.maximumRefund ?? 0);
  const payment = admin.payment;
  const awaitingPayment = isPendingUnpaidOutstanding(detail);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-medium">{participantNames}</h3>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">{occurrence.header}</p>
          <p className="mt-0.5 text-xs text-[var(--ink-dim)]">{detail.instructor.displayName}</p>
          <span
            className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_TONE_CLASS[badgeTone]}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            aria-label={t('openInPlanner')}
            onClick={onOpenPlanner}
            className="border border-[var(--border)] px-3 py-2 text-xs"
          >
            {t('openInPlanner')}
          </button>
          <button
            type="button"
            aria-label={t('adminLessonCloseDetail')}
            onClick={onClose}
            className="border border-[var(--border)] px-3 py-2 text-xs"
          >
            {t('adminLessonClose')}
          </button>
        </div>
      </div>

      {awaitingPayment && payment && (
        <div className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium">{t('adminLessonAttentionAwaitingPayment')}</p>
          <p className="mt-1 text-[var(--ink-dim)]">
            {t('adminLessonAwaitingPaymentDetail').replace(
              '{amount}',
              formatKzt(payment.outstanding)
            )}
          </p>
          {detail.bookingOrigin === 'guest' && (
            <p className="mt-1 text-[var(--ink-dim)]">{t('adminLessonGuestApprovalUnavailable')}</p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
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

      {payment && (
        <section className="space-y-2 border-t border-[var(--border)] pt-3">
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
          <button
            type="button"
            onClick={() => onOpenPayment(payment.paymentId)}
            className="border border-[var(--border)] px-3 py-2 text-xs"
          >
            {t('adminLessonOpenPayment')}
          </button>
        </section>
      )}

      {((admin.attendance ?? []).length > 0 || attendancePending || showOutcome) && (
        <section className="space-y-2 border-t border-[var(--border)] pt-3">
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
              ariaLabel="Action reason"
            />
          )}
        </section>
      )}

      {showCancellation && (
        <section className="space-y-2 border-t border-[var(--border)] pt-3">
          <h4 className="text-xs font-medium uppercase tracking-wide">
            {t('adminLessonCancellationTitle')}
          </h4>
          {detail.lifecycle.status === 'pending_cancellation' && (
            <p className="text-xs">{t('adminLessonCancellationRequested')}</p>
          )}
          {(admin.authorizedActions.canResolveCancellation ||
            admin.authorizedActions.canDirectCancel) && (
            <div className="space-y-2">
              <label className="block text-xs">
                {t('adminLessonRefund')}
                <input
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
                  ariaLabel="Action reason"
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

      {showGuest && (
        <section className="space-y-2 border-t border-[var(--border)] pt-3">
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
              <label className="block text-xs">
                {t('adminLessonReason')}
                <input
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

      <section className="space-y-2 border-t border-[var(--border)] pt-3">
        <h4 className="text-xs font-medium uppercase tracking-wide">
          {t('adminLessonRelatedIssues')}
        </h4>
        {admin.relatedIssues.length === 0 ? (
          <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonNoRelatedIssues')}</p>
        ) : (
          admin.relatedIssues.map((issue) => (
            <div
              key={issue.issueId}
              className="space-y-1 border border-[var(--border)] p-2 text-xs"
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
          ))
        )}
      </section>

      {(emptyActions || showPlannerHint) && (
        <section className="space-y-2 border-t border-[var(--border)] pt-3">
          <h4 className="text-xs font-medium uppercase tracking-wide">
            {t('adminLessonAuthorizedActions')}
          </h4>
          {showPlannerHint && (
            <p className="text-xs text-[var(--ink-dim)]">{t('adminLessonScheduleInPlanner')}</p>
          )}
          {emptyActions && (
            <p className="text-xs text-[var(--ink-dim)]">
              {t(LESSON_ADMIN_EMPTY_ACTIONS_KEYS[emptyActions])}
            </p>
          )}
        </section>
      )}

      <details className="border-t border-[var(--border)] pt-3">
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
          <dd>{admin.participants.map((participant) => participant.participantId).join(', ')}</dd>
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
    </div>
  );
}
