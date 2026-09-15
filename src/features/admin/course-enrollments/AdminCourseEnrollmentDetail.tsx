import { AlertTriangle, ChevronRight, RefreshCw, Users, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  CourseIdSchema,
  type AdminCourseEnrollmentDetailReadModel,
} from '@ski-academy/shared-domain';
import { AdminManagedParticipantPicker } from '../identity';
import type { AdminManagedParticipantSelection } from '../identity';
import { AdminPaymentCaptureSection } from '../components/finance/AdminPaymentCaptureSection';
import type { AdminCourseEnrollmentMutationDraft } from './adminCourseEnrollmentContracts';
import { useAdminCourseEnrollmentTranslations } from './useAdminCourseEnrollmentTranslations';
import {
  AdminLessonDetailTabs,
  AdminLessonKindChip,
  AdminLessonOriginBadge,
  AdminLessonPaymentIndicator,
  AdminLessonStatusChip,
  type AdminLessonDetailSection,
} from '../lesson-bookings/AdminLessonBookingUi';
import {
  courseEnrollmentAttendanceStatusLabel,
  courseEnrollmentGuestStateLabel,
  courseEnrollmentHeaderSubtitle,
  courseEnrollmentOrigin,
  courseEnrollmentPaymentAncillaryRows,
  courseEnrollmentPaymentPrimaryRows,
  courseEnrollmentPaymentStatusLabel,
  courseEnrollmentPrimaryStatus,
  courseEnrollmentScheduleRange,
  courseEnrollmentStatusLabel,
  formatCourseEnrollmentDate,
  formatCourseEnrollmentInstant,
  isCourseEnrollmentAwaitingPayment,
  shouldShowCourseCancellationSection,
  trueCourseAuthorizedActionKeys,
} from './adminCourseEnrollmentPresentation';

export type AdminCourseEnrollmentDetailLayout = 'stacked' | 'tabs';
type CourseDetailSection = AdminLessonDetailSection['id'];

function formatKzt(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  }).format(value);
}

function guestEnrollmentLinkUnavailableLabel(
  reason: AdminCourseEnrollmentDetailReadModel['guestIdentityLinkUnavailableReason'],
  t: ReturnType<typeof useAdminCourseEnrollmentTranslations>
): string {
  switch (reason) {
    case 'already_linked':
      return t.linkReasonAlreadyLinked;
    case 'not_guest':
      return t.linkReasonNotGuest;
    case 'expired_reservation':
      return t.linkReasonExpired;
    case 'attendance_recorded':
      return t.linkReasonAttendance;
    case 'course_started':
      return t.linkReasonCourseStarted;
    case 'admin_account_inactive':
      return t.linkReasonAdminInactive;
    default:
      return t.linkReasonIneligible;
  }
}

function ReasonField({
  value,
  onChange,
  label,
  ariaLabel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly ariaLabel: string;
}) {
  const inputId = useId();
  return (
    <label htmlFor={inputId} className="block text-xs">
      {label}
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

export interface AdminCourseEnrollmentDetailProps {
  readonly detail: AdminCourseEnrollmentDetailReadModel;
  readonly t: ReturnType<typeof useAdminCourseEnrollmentTranslations>;
  readonly layout?: AdminCourseEnrollmentDetailLayout;
  readonly actionReason: string;
  readonly onActionReasonChange: (value: string) => void;
  readonly refundAmount: string;
  readonly onRefundAmountChange: (value: string) => void;
  readonly paymentAmount: string;
  readonly onPaymentAmountChange: (value: string) => void;
  readonly targetCourseId: string;
  readonly onTargetCourseIdChange: (value: string) => void;
  readonly linkSelection: AdminManagedParticipantSelection | undefined;
  readonly onLinkSelectionChange: (selection: AdminManagedParticipantSelection | undefined) => void;
  readonly linkReason: string;
  readonly onLinkReasonChange: (value: string) => void;
  readonly onRequestAttempt: (attempt: AdminCourseEnrollmentMutationDraft, message: string) => void;
  readonly onOpenPayment: (paymentId: string) => void;
  readonly onOpenIssue: (issueId: string) => void;
  readonly onClose: () => void;
  readonly showClose?: boolean;
  readonly instructorLabel?: string;
}

export function AdminCourseEnrollmentDetail({
  detail,
  t,
  layout = 'stacked',
  actionReason,
  onActionReasonChange,
  refundAmount,
  onRefundAmountChange,
  paymentAmount,
  onPaymentAmountChange,
  targetCourseId,
  onTargetCourseIdChange,
  linkSelection,
  onLinkSelectionChange,
  onLinkReasonChange,
  linkReason,
  onRequestAttempt,
  onOpenPayment,
  onOpenIssue,
  onClose,
  showClose = true,
  instructorLabel,
}: AdminCourseEnrollmentDetailProps) {
  const [activeSection, setActiveSection] = useState<CourseDetailSection>('overview');
  const availableTargetCourses = detail.transfer.targetOptions;
  const hasAnyAction = Object.values(detail.authorizedActions).some(Boolean);
  const parsedPaymentAmount = Number(paymentAmount);
  const show = (section: CourseDetailSection) => layout === 'stacked' || activeSection === section;
  const locale = t.locale;
  const money = (value: number) => formatKzt(value, locale);
  const primaryStatus = courseEnrollmentPrimaryStatus(detail);
  const statusLabel = courseEnrollmentStatusLabel(primaryStatus, t);
  const origin = courseEnrollmentOrigin(detail.guestState);
  const originLabel = origin === 'guest' ? t.identityGuest : t.identityAccount;
  const payment = detail.payment;
  const awaitingPayment = isCourseEnrollmentAwaitingPayment(detail);
  const showCancellation = shouldShowCourseCancellationSection(detail);
  const scheduleRange = courseEnrollmentScheduleRange(detail, locale);
  const headerSubtitle = [courseEnrollmentHeaderSubtitle(detail, locale), instructorLabel]
    .filter(Boolean)
    .join(' · ');
  const attendanceDays = detail.attendanceDays ?? [];
  const attendanceHasMutations = attendanceDays.some(
    (day) => day.authorizedActions.canRecordPresent || day.authorizedActions.canRecordAbsent
  );
  const openCriticalIssues = detail.relatedIssues.filter(
    (issue) => issue.severity === 'critical' && issue.lifecycleStatus === 'open'
  );
  const refundValid =
    Number.isInteger(Number(refundAmount)) &&
    Number(refundAmount) >= 0 &&
    Number(refundAmount) <= (detail.cancellation?.maximumRefund ?? 0);
  const needsSharedReason =
    attendanceHasMutations ||
    showCancellation ||
    detail.authorizedActions.canTransfer;

  const sections = useMemo<readonly AdminLessonDetailSection[]>(
    () => [
      { id: 'overview', label: t.overviewTab },
      {
        id: 'payment',
        label: t.paymentTab,
        attention: Boolean(detail.authorizedActions.canRecordPayment || awaitingPayment),
      },
      { id: 'attendance', label: t.attendance },
      ...(showCancellation
        ? [
            {
              id: 'cancellation' as const,
              label: t.cancellationTab,
              attention: detail.lifecycleStatus === 'pending_cancellation',
            },
          ]
        : []),
      { id: 'guest', label: t.guestTab },
      ...(detail.relatedIssues.length > 0
        ? [
            {
              id: 'issues' as const,
              label: t.issuesTab,
              attention: detail.relatedIssues.some((issue) => issue.lifecycleStatus === 'open'),
            },
          ]
        : []),
      { id: 'technical', label: t.technicalTab },
    ],
    [
      awaitingPayment,
      detail.authorizedActions.canRecordPayment,
      detail.lifecycleStatus,
      detail.relatedIssues,
      showCancellation,
      t.attendance,
      t.cancellationTab,
      t.guestTab,
      t.issuesTab,
      t.overviewTab,
      t.paymentTab,
      t.technicalTab,
    ]
  );

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection, sections]);

  const overview = (
    <section aria-label={t.overviewTab} className="space-y-5">
      <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-[var(--ink-dim)]">{t.participant}</dt>
        <dd>{detail.participant.displayName}</dd>
        <dt className="text-[var(--ink-dim)]">{t.course}</dt>
        <dd>{detail.course.title}</dd>
        {instructorLabel ? (
          <>
            <dt className="text-[var(--ink-dim)]">{t.instructor}</dt>
            <dd>{instructorLabel}</dd>
          </>
        ) : null}
        {scheduleRange ? (
          <>
            <dt className="text-[var(--ink-dim)]">{t.schedule}</dt>
            <dd>{scheduleRange}</dd>
          </>
        ) : null}
        {attendanceDays.length > 0 ? (
          <>
            <dt className="text-[var(--ink-dim)]">{t.courseDays}</dt>
            <dd>{attendanceDays.length}</dd>
          </>
        ) : null}
        {detail.attendanceSummary ? (
          <>
            <dt className="text-[var(--ink-dim)]">{t.recordedAttendance}</dt>
            <dd>
              {detail.attendanceSummary.presentDayCount} {t.attendancePresent.toLowerCase()} ·{' '}
              {detail.attendanceSummary.absentDayCount} {t.attendanceAbsent.toLowerCase()}
            </dd>
          </>
        ) : null}
        {detail.payer && detail.payer.displayName !== detail.participant.displayName ? (
          <>
            <dt className="text-[var(--ink-dim)]">{t.payer}</dt>
            <dd>{detail.payer.displayName}</dd>
          </>
        ) : null}
        <dt className="text-[var(--ink-dim)]">{t.seats}</dt>
        <dd>
          {detail.capacity.availableSeats}/{detail.capacity.totalSeats}
        </dd>
      </dl>
      {detail.authorizedActions.canTransfer && (
        <div className="space-y-2">
          {layout === 'tabs' ? (
            <ReasonField
              value={actionReason}
              onChange={onActionReasonChange}
              label={t.reason}
              ariaLabel="Action reason"
            />
          ) : null}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              value={targetCourseId}
              onChange={(event) => onTargetCourseIdChange(event.target.value)}
              className="border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
            >
              <option value="">{t.selectCourse}</option>
              {availableTargetCourses.map((course) => (
                <option key={course.courseId} value={course.courseId}>
                  {course.title} · {course.availableSeats} seats
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!targetCourseId || !actionReason.trim()}
              onClick={() => {
                const parsed = CourseIdSchema.safeParse(targetCourseId);
                if (!parsed.success) return;
                onRequestAttempt(
                  {
                    kind: 'transfer_course_enrollment',
                    targetCourseId: parsed.data,
                    reasonExplanation: actionReason.trim(),
                  },
                  `${t.transfer}: ${detail.enrollmentId} → ${parsed.data} @ rev ${detail.revision}`
                );
              }}
              className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
            >
              {t.transfer}
            </button>
          </div>
        </div>
      )}
      {!hasAnyAction && (
        <div className="rounded-[var(--radius-md)] bg-[var(--profile-bg)] p-3">
          <p className="flex gap-2 text-xs text-[var(--ink-dim)]">
            <Users className="h-4 w-4" /> {t.noActions}
          </p>
        </div>
      )}
    </section>
  );

  const paymentSection = payment ? (
    <section aria-label={t.paymentTab} className="space-y-4">
      {layout === 'stacked' ? (
        <h4 className="text-xs font-medium uppercase tracking-wide">{t.paymentTab}</h4>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {courseEnrollmentPaymentPrimaryRows(payment).map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-[var(--ink-dim)]">
              {row.id === 'price'
                ? t.paymentPrice
                : row.id === 'paid'
                  ? t.paymentPaid
                  : t.paymentOutstanding}
            </dt>
            <dd className="text-right tabular-nums">{money(row.amount)}</dd>
          </div>
        ))}
        {courseEnrollmentPaymentAncillaryRows(payment).map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-[var(--ink-dim)]">
              {row.id === 'refunded'
                ? t.paymentRefunded
                : row.id === 'retained'
                  ? t.paymentRetained
                  : row.id === 'settled'
                    ? t.paymentSettled
                    : t.paymentWrittenOff}
            </dt>
            <dd className="text-right tabular-nums">{money(row.amount)}</dd>
          </div>
        ))}
        <dt className="text-[var(--ink-dim)]">{t.paymentStatus}</dt>
        <dd>{courseEnrollmentPaymentStatusLabel(payment.status, t)}</dd>
      </dl>
      {awaitingPayment && detail.guestState !== 'not_guest' && (
        <p className="text-xs text-amber-700">{t.guestDeferred}</p>
      )}
      <AdminPaymentCaptureSection
        canRecordPayment={detail.authorizedActions.canRecordPayment}
        amount={paymentAmount}
        outstanding={payment.outstanding}
        onAmountChange={onPaymentAmountChange}
        onRecord={() =>
          onRequestAttempt(
            {
              kind: 'record_provider_payment_event',
              paymentRevision: payment.revision,
              amount: parsedPaymentAmount,
            },
            t.confirmPayment.replace('{amount}', money(parsedPaymentAmount))
          )
        }
        amountLabel={t.paymentAmount}
        recordLabel={t.recordPayment}
        inputId="admin-course-enrollment-payment-amount"
      />
      <button
        type="button"
        onClick={() => onOpenPayment(payment.paymentId)}
        className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs"
      >
        {t.payment} <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </section>
  ) : null;

  const attendance = (
    <section aria-label={t.attendance} className="space-y-4">
      {layout === 'stacked' ? (
        <h4 className="text-xs font-medium uppercase tracking-wide">{t.attendance}</h4>
      ) : null}
      {attendanceDays.length === 0 ? (
        <p className="text-xs text-[var(--ink-dim)]">{t.noCourseDays}</p>
      ) : (
        attendanceDays.map((day) => (
          <div key={day.courseDayId} className="space-y-2 text-xs">
            <p className="font-medium">
              {formatCourseEnrollmentDate(day.startsAt.seconds, locale)}
            </p>
            <p className="text-[var(--ink-dim)]">
              {courseEnrollmentAttendanceStatusLabel(day.attendanceStatus, t)}
            </p>
            {day.recordedBy && (
              <p className="text-[var(--ink-dim)]">
                {t.recordedBy}:{' '}
                {day.recordedBy.kind === 'instructor'
                  ? t.recordedByInstructor
                  : t.recordedByAdministrator}
              </p>
            )}
            {(day.authorizedActions.canRecordPresent || day.authorizedActions.canRecordAbsent) && (
              <div className="flex gap-2">
                {(['present', 'absent'] as const).map((attendanceStatus) => {
                  const allowed =
                    attendanceStatus === 'present'
                      ? day.authorizedActions.canRecordPresent
                      : day.authorizedActions.canRecordAbsent;
                  if (!allowed) return null;
                  return (
                    <button
                      key={attendanceStatus}
                      type="button"
                      disabled={!actionReason.trim()}
                      onClick={() =>
                        onRequestAttempt(
                          {
                            kind: 'record_course_day_attendance',
                            courseDayId: day.courseDayId,
                            attendanceStatus,
                            ...(day.attendanceRevision === undefined
                              ? {}
                              : { expectedAttendanceRevision: day.attendanceRevision }),
                            reasonExplanation: actionReason.trim(),
                          },
                          `${detail.participant.displayName}: ${day.attendanceStatus ?? 'missing'} → ${attendanceStatus} @ enrollment rev ${detail.revision}${day.attendanceRevision === undefined ? '' : `, attendance rev ${day.attendanceRevision}`}`
                        )
                      }
                      className="border border-[var(--border)] px-3 py-2 disabled:opacity-50"
                    >
                      {attendanceStatus === 'present' ? t.recordPresent : t.recordAbsent}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
      {detail.authorizedActions.canResolveAttendanceOutcome && (
        <button
          type="button"
          onClick={() =>
            onRequestAttempt(
              { kind: 'resolve_attendance_outcome' },
              `${t.resolveOutcome}: ${detail.enrollmentId} @ rev ${detail.revision}`
            )
          }
          className="border border-[var(--border)] px-3 py-2 text-xs"
        >
          {t.resolveOutcome}
        </button>
      )}
      {layout === 'tabs' && attendanceHasMutations && (
        <ReasonField
          value={actionReason}
          onChange={onActionReasonChange}
          label={t.reason}
          ariaLabel="Action reason"
        />
      )}
    </section>
  );

  const cancellation = showCancellation ? (
    <section aria-label={t.cancellationTab} className="space-y-4">
      {layout === 'stacked' ? (
        <h4 className="text-xs font-medium uppercase tracking-wide">{t.cancellationTab}</h4>
      ) : null}
      {detail.lifecycleStatus === 'pending_cancellation' && (
        <p className="text-xs">{t.cancellationRequested}</p>
      )}
      {layout === 'tabs' ? (
        <ReasonField
          value={actionReason}
          onChange={onActionReasonChange}
          label={t.reason}
          ariaLabel="Action reason"
        />
      ) : null}
      {detail.authorizedActions.canCancelUnpaidGuest && (
        <button
          type="button"
          disabled={!actionReason.trim()}
          onClick={() =>
            onRequestAttempt(
              {
                kind: 'resolve_course_enrollment_cancellation',
                decision: 'direct_cancel',
                refundAmount: 0,
                reasonExplanation: actionReason.trim(),
              },
              `${t.cancelUnpaidGuest}: ${detail.enrollmentId} @ rev ${detail.revision}`
            )
          }
          className="border border-rose-500 px-3 py-2 text-xs text-rose-600 disabled:opacity-50"
        >
          {t.cancelUnpaidGuest}
        </button>
      )}
      {detail.authorizedActions.canResolveCancellation && detail.cancellation && (
        <div className="space-y-2 text-xs">
          <label htmlFor="admin-course-enrollment-refund" className="block">
            {t.refund} · max {money(detail.cancellation.maximumRefund)}
            <input
              id="admin-course-enrollment-refund"
              type="number"
              min="0"
              max={detail.cancellation.maximumRefund}
              step="1"
              value={refundAmount}
              onChange={(event) => onRefundAmountChange(event.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!actionReason.trim() || !refundValid}
              onClick={() =>
                onRequestAttempt(
                  {
                    kind: 'resolve_course_enrollment_cancellation',
                    decision: 'approve',
                    refundAmount: Number(refundAmount),
                    reasonExplanation: actionReason.trim(),
                  },
                  `${t.approveCancel}: ${detail.enrollmentId} @ rev ${detail.revision}`
                )
              }
              className="border border-[var(--border)] px-3 py-2 disabled:opacity-50"
            >
              {t.approveCancel}
            </button>
            <button
              type="button"
              disabled={!actionReason.trim()}
              onClick={() =>
                onRequestAttempt(
                  {
                    kind: 'resolve_course_enrollment_cancellation',
                    decision: 'reject',
                    reasonExplanation: actionReason.trim(),
                  },
                  `${t.rejectCancel}: ${detail.enrollmentId} @ rev ${detail.revision}`
                )
              }
              className="border border-[var(--border)] px-3 py-2 disabled:opacity-50"
            >
              {t.rejectCancel}
            </button>
          </div>
        </div>
      )}
    </section>
  ) : null;

  const guest = (
    <section aria-label={t.guestTab} className="space-y-4">
      {layout === 'stacked' ? (
        <h4 className="text-xs font-medium uppercase tracking-wide">{t.guestTab}</h4>
      ) : null}
      <p className="text-xs">{courseEnrollmentGuestStateLabel(detail.guestState, t)}</p>
      <p className="text-xs">
        {t.participant}: {detail.participant.displayName}
      </p>
      {detail.authorizedActions.canLinkGuest ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">{t.linkGuestTitle}</p>
          <p className="text-xs text-[var(--ink-dim)]">{t.linkGuestHint}</p>
          <AdminManagedParticipantPicker
            selected={linkSelection}
            onChange={(selection) => {
              onLinkSelectionChange(selection);
            }}
          />
          <label className="block text-xs">
            {t.reason}
            <input
              aria-label="Link reason"
              value={linkReason}
              onChange={(event) => onLinkReasonChange(event.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
            />
          </label>
          {linkSelection && (
            <p className="text-xs text-[var(--ink-dim)]">
              {t.linkReview
                .replace('{guest}', detail.participant.displayName)
                .replace('{account}', linkSelection.accountDisplayName ?? linkSelection.accountId)
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
                  kind: 'link_guest_course_enrollment_to_account_as_administrator',
                  targetAccountId: linkSelection.accountId,
                  targetParticipantId: linkSelection.participantId,
                  ...(linkSelection.accountDisplayName
                    ? { targetAccountDisplayName: linkSelection.accountDisplayName }
                    : {}),
                  targetParticipantDisplayName: linkSelection.displayName,
                  reasonExplanation: linkReason.trim(),
                },
                t.confirmLinkGuest
              );
            }}
            className="w-full border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
          >
            {t.linkGuest}
          </button>
        </div>
      ) : (
        detail.guestState !== 'not_guest' && (
          <div className="space-y-1 text-xs text-[var(--ink-dim)]">
            <p>{t.linkUnavailable}</p>
            <p>{guestEnrollmentLinkUnavailableLabel(detail.guestIdentityLinkUnavailableReason, t)}</p>
          </div>
        )
      )}
    </section>
  );

  const issues =
    detail.relatedIssues.length > 0 ? (
      <section aria-label={t.issuesTab} className="space-y-3">
        {layout === 'stacked' ? (
          <h4 className="text-xs font-medium uppercase tracking-wide">{t.issuesTab}</h4>
        ) : null}
        {detail.relatedIssues.map((issue) => (
          <button
            key={issue.issueId}
            type="button"
            onClick={() => onOpenIssue(issue.issueId)}
            className="block w-full rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left text-xs"
          >
            {t.issue}: {issue.kind} · {issue.lifecycleStatus}
          </button>
        ))}
      </section>
    ) : null;

  const technical = (
    <section aria-label={t.technicalTab} className="space-y-3">
      {layout === 'stacked' ? (
        <h4 className="text-xs font-medium uppercase tracking-wide">{t.technicalTab}</h4>
      ) : null}
      <dl className="rounded-[var(--radius-md)] bg-[var(--profile-bg)] p-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 break-all font-mono text-[10px] text-[var(--ink-dim)]">
          <dt>{t.enrollmentId}</dt>
          <dd>{detail.enrollmentId}</dd>
          <dt>{t.courseId}</dt>
          <dd>{detail.course.courseId}</dd>
          <dt>{t.originalCourseId}</dt>
          <dd>{detail.originalCourseId}</dd>
          <dt>{t.participantId}</dt>
          <dd>{detail.participant.participantId}</dd>
          {detail.payerAccountId ? (
            <>
              <dt>{t.payerAccountId}</dt>
              <dd>{detail.payerAccountId}</dd>
            </>
          ) : null}
          <dt>{t.paymentId}</dt>
          <dd>{detail.paymentId}</dd>
          <dt>{t.revision}</dt>
          <dd>{detail.revision}</dd>
          <dt>{t.rawLifecycle}</dt>
          <dd>{detail.lifecycleStatus}</dd>
          <dt>{t.rawGuestState}</dt>
          <dd>{detail.guestState}</dd>
          {detail.guestIdentityLinkUnavailableReason ? (
            <>
              <dt>{t.guestLinkUnavailableReason}</dt>
              <dd>{detail.guestIdentityLinkUnavailableReason}</dd>
            </>
          ) : null}
          <dt>{t.capacityRaw}</dt>
          <dd>
            {detail.capacity.availableSeats}/{detail.capacity.totalSeats} ·{' '}
            {detail.capacity.seatHeldByEnrollment ? t.seatHeld : t.seatReleased}
          </dd>
          {payment ? (
            <>
              <dt>{t.paymentRevision}</dt>
              <dd>
                {payment.paymentId} · {payment.status} · rev {payment.revision}
              </dd>
            </>
          ) : null}
          <dt>{t.bookingOrigin}</dt>
          <dd>{detail.auditContext.bookingOrigin}</dd>
          <dt>{t.createdAt}</dt>
          <dd>{formatCourseEnrollmentInstant(detail.auditContext.createdAt, locale)}</dd>
          <dt>{t.updatedAt}</dt>
          <dd>{formatCourseEnrollmentInstant(detail.auditContext.updatedAt, locale)}</dd>
          {detail.transfer.blockedReason ? (
            <>
              <dt>{t.transferBlocked}</dt>
              <dd>{detail.transfer.blockedReason}</dd>
            </>
          ) : null}
          {detail.reconciliation.evidenceIssueIds.length > 0 ? (
            <>
              <dt>{t.reconciliationEvidence}</dt>
              <dd>{detail.reconciliation.evidenceIssueIds.join(', ')}</dd>
            </>
          ) : null}
          <dt>{t.authorizedActions}</dt>
          <dd>{trueCourseAuthorizedActionKeys(detail).join(', ') || '—'}</dd>
          {attendanceDays.length > 0 ? (
            <>
              <dt>{t.attendanceTechnical}</dt>
              <dd>
                {attendanceDays
                  .map(
                    (day) =>
                      `${day.courseDayId}:${day.attendanceStatus ?? 'missing'}${
                        day.attendanceRevision === undefined ? '' : `@${day.attendanceRevision}`
                      }`
                  )
                  .join(', ')}
              </dd>
            </>
          ) : null}
        </dl>
        {detail.authorizedActions.canReconcile && (
          <button
            type="button"
            onClick={() =>
              onRequestAttempt(
                { kind: 'reconcile_course_enrollment' },
                `${t.reconcile}: ${detail.reconciliation.evidenceIssueIds.join(', ')} @ rev ${detail.revision}`
              )
            }
            className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t.reconcile}
          </button>
        )}
    </section>
  );

  const header = (
    <header className="space-y-3 p-4 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-medium">{detail.participant.displayName}</h3>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">{headerSubtitle}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <AdminLessonStatusChip status={primaryStatus} label={statusLabel} />
            {payment ? (
              <AdminLessonPaymentIndicator
                status={payment.status}
                label={courseEnrollmentPaymentStatusLabel(payment.status, t)}
              />
            ) : null}
            <AdminLessonOriginBadge origin={origin} label={originLabel} />
            <AdminLessonKindChip label={t.typeCourse} />
          </div>
        </div>
        {showClose ? (
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {(awaitingPayment ||
        detail.lifecycleStatus === 'pending_cancellation' ||
        openCriticalIssues.length > 0) && (
        <div className="grid gap-2 xl:grid-cols-2">
          {awaitingPayment && (
            <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t.awaitingPaymentTitle}
              </p>
              <p className="mt-1 text-[var(--ink-dim)]">
                {t.awaitingPaymentDetail.replace('{amount}', money(payment?.outstanding ?? 0))}
              </p>
              {detail.guestState !== 'not_guest' && (
                <p className="mt-1 text-[var(--ink-dim)]">{t.guestDeferred}</p>
              )}
            </div>
          )}
          {detail.lifecycleStatus === 'pending_cancellation' && (
            <div className="rounded-[var(--radius-md)] border border-rose-500/30 bg-rose-500/[0.07] p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-rose-900 dark:text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t.cancellationRequested}
              </p>
              {layout === 'tabs' ? (
                <button
                  type="button"
                  onClick={() => setActiveSection('cancellation')}
                  className="mt-2 text-xs font-semibold text-rose-700 underline-offset-2 hover:underline dark:text-rose-300"
                >
                  {t.openCancellation}
                </button>
              ) : null}
            </div>
          )}
          {openCriticalIssues.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/[0.07] p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-red-900 dark:text-red-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t.criticalIssues.replace('{n}', String(openCriticalIssues.length))}
              </p>
              {layout === 'tabs' ? (
                <button
                  type="button"
                  onClick={() => setActiveSection('issues')}
                  className="mt-2 text-xs font-semibold text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                >
                  {t.issuesTab}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </header>
  );

  return (
    <div>
      <div
        className={
          layout === 'tabs'
            ? 'sticky top-3 z-20 rounded-t-[var(--radius)] bg-[var(--card-bg)] shadow-[0_8px_20px_-18px_rgba(17,17,17,0.45)] lg:top-0'
            : undefined
        }
      >
        {header}
        {layout === 'tabs' && (
          <AdminLessonDetailTabs
            sections={sections}
            activeSection={activeSection}
            onChange={setActiveSection}
            ariaLabel={t.detailSections}
            attentionLabel={t.requiresAttention}
            idPrefix="admin-course"
          />
        )}
      </div>
      <div
        {...(layout === 'tabs'
          ? {
              id: `admin-course-panel-${activeSection}`,
              role: 'tabpanel' as const,
              'aria-labelledby': `admin-course-tab-${activeSection}`,
            }
          : {})}
        className="space-y-5 p-4 lg:p-5"
      >
        {layout === 'stacked' && needsSharedReason ? (
          <ReasonField
            value={actionReason}
            onChange={onActionReasonChange}
            label={t.reason}
            ariaLabel="Action reason"
          />
        ) : null}
        {show('overview') && overview}
        {show('payment') && paymentSection}
        {show('attendance') && attendance}
        {show('cancellation') && cancellation}
        {show('guest') && guest}
        {show('issues') && issues}
        {show('technical') && technical}
      </div>
      {layout === 'tabs'
        ? sections
            .filter((section) => section.id !== activeSection)
            .map((section) => (
              <div
                key={section.id}
                id={`admin-course-panel-${section.id}`}
                role="tabpanel"
                aria-labelledby={`admin-course-tab-${section.id}`}
                hidden
              />
            ))
        : null}
    </div>
  );
}
