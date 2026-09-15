import { AlertTriangle, ChevronRight, RefreshCw, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CourseIdSchema,
  type AdminCourseEnrollmentDetailReadModel,
} from '@ski-academy/shared-domain';
import { AdminManagedParticipantPicker } from '../identity';
import type { AdminManagedParticipantSelection } from '../identity';
import { AdminPaymentCaptureSection } from '../components/finance/AdminPaymentCaptureSection';
import type { AdminCourseEnrollmentMutationDraft } from './adminCourseEnrollmentContracts';
import { useAdminCourseEnrollmentTranslations } from './useAdminCourseEnrollmentTranslations';

export type AdminCourseEnrollmentDetailLayout = 'stacked' | 'tabs';
type CourseDetailSection = 'overview' | 'payment' | 'attendance' | 'operations';

function formatKzt(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} KZT`;
}

function attendanceActorLabel(
  actor: { kind: 'instructor'; instructorId: string } | { kind: 'administrator'; accountId: string }
): string {
  return actor.kind === 'instructor'
    ? `instructor:${actor.instructorId}`
    : `administrator:${actor.accountId}`;
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
}: AdminCourseEnrollmentDetailProps) {
  const [activeSection, setActiveSection] = useState<CourseDetailSection>('overview');
  const availableTargetCourses = detail.transfer.targetOptions;
  const hasAnyAction = Object.values(detail.authorizedActions).some(Boolean);
  const parsedPaymentAmount = Number(paymentAmount);
  const show = (section: CourseDetailSection) => layout === 'stacked' || activeSection === section;
  const sections = useMemo(
    () =>
      [
        { id: 'overview' as const, label: t.overviewTab },
        {
          id: 'payment' as const,
          label: t.paymentTab,
          attention: Boolean(detail.authorizedActions.canRecordPayment),
        },
        { id: 'attendance' as const, label: t.attendance },
        { id: 'operations' as const, label: t.operationsTab },
      ] as const,
    [detail.authorizedActions.canRecordPayment, t.attendance, t.operationsTab, t.overviewTab, t.paymentTab]
  );

  const overview = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
      <dt className="text-[var(--ink-dim)]">ID</dt>
      <dd className="break-all">{detail.enrollmentId}</dd>
      <dt className="text-[var(--ink-dim)]">Participant</dt>
      <dd>{detail.participant.displayName}</dd>
      <dt className="text-[var(--ink-dim)]">Course</dt>
      <dd>{detail.course.title}</dd>
      <dt className="text-[var(--ink-dim)]">Lifecycle</dt>
      <dd>{detail.lifecycleStatus}</dd>
      <dt className="text-[var(--ink-dim)]">Guest identity</dt>
      <dd>{detail.guestState}</dd>
      <dt className="text-[var(--ink-dim)]">Capacity</dt>
      <dd>
        {detail.capacity.availableSeats}/{detail.capacity.totalSeats} available · seat{' '}
        {detail.capacity.seatHeldByEnrollment ? 'held' : 'released'}
      </dd>
      <dt className="text-[var(--ink-dim)]">Attendance</dt>
      <dd>{detail.attendanceSummary?.recordedDayCount ?? 0} recorded days</dd>
    </dl>
  );

  const payment = detail.payment ? (
    <div className="space-y-2 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-[var(--ink-dim)]">{t.paymentPrice}</dt>
        <dd className="text-right tabular-nums">{formatKzt(detail.payment.price)}</dd>
        <dt className="text-[var(--ink-dim)]">{t.paymentPaid}</dt>
        <dd className="text-right tabular-nums">{formatKzt(detail.payment.paid)}</dd>
        <dt className="text-[var(--ink-dim)]">{t.paymentOutstanding}</dt>
        <dd className="text-right tabular-nums">{formatKzt(detail.payment.outstanding)}</dd>
        <dt className="text-[var(--ink-dim)]">Status</dt>
        <dd>{detail.payment.status}</dd>
      </dl>
      <p>
        {detail.payment.status} · required {formatKzt(detail.payment.price)} · paid{' '}
        {formatKzt(detail.payment.paid)} · settled {formatKzt(detail.payment.settled)} · outstanding{' '}
        {formatKzt(detail.payment.outstanding)} · rev {detail.payment.revision}
      </p>
      {detail.lifecycleStatus === 'pending' && detail.guestState !== 'not_guest' && (
        <p className="text-amber-700">{t.guestDeferred}</p>
      )}
      <AdminPaymentCaptureSection
        canRecordPayment={detail.authorizedActions.canRecordPayment}
        amount={paymentAmount}
        outstanding={detail.payment.outstanding}
        onAmountChange={onPaymentAmountChange}
        onRecord={() =>
          onRequestAttempt(
            {
              kind: 'record_provider_payment_event',
              paymentRevision: detail.payment!.revision,
              amount: parsedPaymentAmount,
            },
            t.confirmPayment.replace('{amount}', formatKzt(parsedPaymentAmount))
          )
        }
        amountLabel={t.paymentAmount}
        recordLabel={t.recordPayment}
        inputId="admin-course-enrollment-payment-amount"
      />
      <button
        type="button"
        onClick={() => onOpenPayment(detail.payment!.paymentId)}
        className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2"
      >
        {t.payment} <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;

  const attendance = (
    <div className="space-y-2">
      <h4 className="text-xs font-mono uppercase">{t.attendance}</h4>
      {(detail.attendanceDays ?? []).map((day) => (
        <div key={day.courseDayId} className="space-y-2 border border-[var(--border)] p-3 text-xs">
          <p className="font-medium">
            {new Date(day.startsAt.seconds * 1_000).toLocaleString()} ·{' '}
            {day.attendanceStatus ?? t.attendanceMissing}
            {day.attendanceRevision === undefined ? '' : ` · rev ${day.attendanceRevision}`}
          </p>
          {day.recordedBy && day.lastChangedBy && (
            <p className="break-all text-[var(--ink-dim)]">
              {t.recordedBy}: {attendanceActorLabel(day.recordedBy)} · {t.lastChangedBy}:{' '}
              {attendanceActorLabel(day.lastChangedBy)}
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
      ))}
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
    </div>
  );

  const operations = (
    <div className="space-y-4">
      <div className="space-y-2">
        {detail.relatedIssues.map((issue) => (
          <button
            key={issue.issueId}
            type="button"
            onClick={() => onOpenIssue(issue.issueId)}
            className="block w-full border border-[var(--border)] p-2 text-left text-xs"
          >
            {t.issue}: {issue.kind} · {issue.lifecycleStatus}
          </button>
        ))}
      </div>
      <label htmlFor="admin-course-enrollment-action-reason" className="block text-xs">
        {t.reason}
        <input
          id="admin-course-enrollment-action-reason"
          aria-label="Action reason"
          value={actionReason}
          onChange={(event) => onActionReasonChange(event.target.value)}
          className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
        />
      </label>
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
          className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
        >
          {t.cancelUnpaidGuest}
        </button>
      )}
      {detail.authorizedActions.canResolveCancellation && detail.cancellation && (
        <div className="space-y-2 border border-[var(--border)] p-3 text-xs">
          <label htmlFor="admin-course-enrollment-refund" className="block">
            {t.refund} · max {formatKzt(detail.cancellation.maximumRefund)}
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
              disabled={
                !actionReason.trim() ||
                !Number.isInteger(Number(refundAmount)) ||
                Number(refundAmount) < 0 ||
                Number(refundAmount) > detail.cancellation.maximumRefund
              }
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
      {detail.authorizedActions.canTransfer && (
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
      )}
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
      {detail.authorizedActions.canLinkGuest ? (
        <div className="space-y-2 border border-[var(--border)] p-3">
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
          <p className="flex gap-2 border border-amber-400 p-3 text-xs text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t.linkUnavailable}: {guestEnrollmentLinkUnavailableLabel(detail.guestIdentityLinkUnavailableReason, t)}
          </p>
        )
      )}
      {!hasAnyAction && (
        <p className="flex gap-2 text-xs text-[var(--ink-dim)]">
          <Users className="h-4 w-4" /> {t.noActions}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="font-mono text-xs uppercase tracking-wider">{t.details}</h3>
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--border)] px-3 py-2 text-xs"
            aria-label={t.close}
          >
            <span className="inline-flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> {t.close}
            </span>
          </button>
        ) : null}
      </div>
      {layout === 'tabs' && (
        <div role="tablist" aria-label={t.details} className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-1">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
              className={`relative shrink-0 appearance-none rounded-[0px] border-0 border-b-2 border-solid px-2.5 py-3 text-xs font-medium ${
                activeSection === section.id
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--ink-dim)]'
              }`}
            >
              {section.label}
              {'attention' in section && section.attention ? (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              ) : null}
            </button>
          ))}
        </div>
      )}
      {show('overview') && overview}
      {show('payment') && payment}
      {show('attendance') && attendance}
      {show('operations') && operations}
    </div>
  );
}
