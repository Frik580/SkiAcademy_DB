import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ActionButton } from '../../../ui/ActionButton';
import { CourseEnrollmentIdSchema, CourseIdSchema } from '@ski-academy/shared-domain';
import {
  ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';
import { queryAdminCourseReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { useAdminCoursesRevisionRefresh } from '../courses/useAdminCoursesRevisionRefresh';
import type {
  AdminCourseEnrollmentAttempt,
  AdminCourseEnrollmentCourseOption,
  AdminCourseEnrollmentMutationDraft,
  AdminCourseEnrollmentView,
} from './adminCourseEnrollmentContracts';
import {
  captureAdminCourseEnrollmentTarget,
  createAdminCourseEnrollmentAttemptId,
  parseAdminCourseEnrollmentView,
  resolveCourseEnrollmentInstructorLabel,
  toAdminCourseEnrollmentCourseOptions,
} from './adminCourseEnrollmentUtils';
import { AdminManagedParticipantPicker } from '../identity';
import type { AdminManagedParticipantSelection } from '../identity';
import { useAdminCourseEnrollmentReadModels } from './useAdminCourseEnrollmentReadModels';
import { useAdminCourseEnrollmentCommands } from './useAdminCourseEnrollmentCommands';
import { useAdminCourseEnrollmentTranslations } from './useAdminCourseEnrollmentTranslations';
import { AdminCourseEnrollmentDetail } from './AdminCourseEnrollmentDetail';

export interface AdminCourseEnrollmentPanelProps {
  readonly adminAccountId: string;
}

export const AdminCourseEnrollmentPanel: React.FC<AdminCourseEnrollmentPanelProps> = ({
  adminAccountId,
}) => {
  const t = useAdminCourseEnrollmentTranslations();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseAdminCourseEnrollmentView(
    searchParams.get(ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY)
  );
  const selectedEnrollment = CourseEnrollmentIdSchema.safeParse(
    searchParams.get(ADMIN_COURSE_ENROLLMENT_QUERY_KEY)
  );
  const filteredCourse = CourseIdSchema.safeParse(
    searchParams.get(ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY)
  );
  const selectedEnrollmentId = selectedEnrollment.success ? selectedEnrollment.data : undefined;
  const courseId = filteredCourse.success ? filteredCourse.data : undefined;
  const readModels = useAdminCourseEnrollmentReadModels({
    view,
    courseId,
    selectedEnrollmentId,
  });
  const [courses, setCourses] = useState<AdminCourseEnrollmentCourseOption[]>([]);
  const [courseError, setCourseError] = useState(false);
  const courseGeneration = useRef(0);
  const [reason, setReason] = useState('');
  const [createCourseId, setCreateCourseId] = useState('');
  const [createSelection, setCreateSelection] = useState<AdminManagedParticipantSelection>();
  const [linkSelection, setLinkSelection] = useState<AdminManagedParticipantSelection>();
  const [linkReason, setLinkReason] = useState('');
  const [targetCourseId, setTargetCourseId] = useState('');
  const [refundAmount, setRefundAmount] = useState('0');
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [confirmation, setConfirmation] = useState<{
    readonly attempt: AdminCourseEnrollmentAttempt;
    readonly message: string;
  }>();
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<string>();
  const [mutationNotice, setMutationNotice] = useState<string>();

  const loadCourses = useCallback(async () => {
    const generation = ++courseGeneration.current;
    setCourseError(false);
    try {
      const result = await queryAdminCourseReadModels({ scope: 'admin_course_list', pageSize: 50 });
      if (generation !== courseGeneration.current || result.scope !== 'admin_course_list') return;
      setCourses(toAdminCourseEnrollmentCourseOptions(result.items));
    } catch {
      if (generation === courseGeneration.current) setCourseError(true);
    }
  }, []);

  useAdminCoursesRevisionRefresh(() => {
    void loadCourses();
  }, true);

  const commands = useAdminCourseEnrollmentCommands({
    adminAccountId,
    refreshList: readModels.refreshList,
    refreshEnrollment: readModels.refreshEnrollment,
    refreshCourses: loadCourses,
  });

  useEffect(() => {
    void loadCourses();
    return () => {
      courseGeneration.current += 1;
    };
  }, [loadCourses]);

  useEffect(() => {
    const detail = readModels.detail.item;
    if (!detail) return;
    setRefundAmount(String(detail.cancellation?.maximumRefund ?? 0));
    setPaymentAmount(String(detail.payment?.outstanding ?? 0));
    setTargetCourseId('');
  }, [readModels.detail.item]);

  useEffect(() => {
    setLinkSelection(undefined);
    setLinkReason('');
    setConfirmation((current) =>
      current?.attempt.kind === 'link_guest_course_enrollment_to_account_as_administrator'
        ? undefined
        : current
    );
  }, [selectedEnrollmentId]);

  const updateQuery = (updates: Record<string, string | undefined>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );
  };

  const setView = (nextView: AdminCourseEnrollmentView) =>
    updateQuery({
      [ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY]: nextView,
      [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined,
    });

  const requestCreate = () => {
    const course = courses.find((item) => item.courseId === createCourseId);
    if (!course || !createSelection || !reason.trim()) return;
    setMutationError(undefined);
    setMutationNotice(undefined);
    setConfirmation({
      attempt: {
        kind: 'create_course_enrollments',
        idempotencyKey: createAdminCourseEnrollmentAttemptId('create'),
        courseId: course.courseId,
        courseRevision: course.revision,
        participantId: createSelection.participantId,
        reasonExplanation: reason.trim(),
      },
      message: `${createSelection.displayName} → ${course.title} @ course rev ${course.revision}`,
    });
  };

  const requestDetailAttempt = (attempt: AdminCourseEnrollmentMutationDraft, message: string) => {
    const detail = readModels.detail.item;
    if (!detail) return;
    setMutationError(undefined);
    setMutationNotice(undefined);
    setConfirmation({
      attempt: {
        ...attempt,
        target: captureAdminCourseEnrollmentTarget(detail),
        idempotencyKey: createAdminCourseEnrollmentAttemptId(attempt.kind),
      } as AdminCourseEnrollmentAttempt,
      message,
    });
  };

  const runConfirmation = async () => {
    if (!confirmation || mutationPending) return;
    setMutationPending(true);
    const result = await commands.runAttempt(confirmation.attempt);
    setMutationPending(false);
    if (result.status === 'success') {
      if (
        result.refreshFailed &&
        (confirmation.attempt.kind === 'record_provider_payment_event' ||
          confirmation.attempt.kind === 'pay_service_from_wallet_as_administrator')
      ) {
        setMutationNotice(t.paymentRecordedRefreshPending);
      }
      setConfirmation(undefined);
      setMutationError(undefined);
      setReason('');
      return;
    }
    setMutationError(result.error.message);
    if (result.error.code === 'stale_version') {
      setConfirmation(undefined);
    }
  };

  const detail = readModels.detail.item;

  return (
    <div className="space-y-5">
      {mutationNotice && (
        <div role="status" className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          {mutationNotice}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['roster', t.roster],
            ['pending_guest', t.pending],
            ['history', t.history],
          ] as const
        ).map(([candidate, label]) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setView(candidate)}
            className={`border px-3 py-2 text-xs ${view === candidate ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]' : 'border-[var(--border)]'}`}
          >
            {label}
          </button>
        ))}
        <select
          aria-label={t.selectCourse}
          value={courseId ?? ''}
          onChange={(event) =>
            updateQuery({
              [ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY]: event.target.value || undefined,
              [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined,
            })
          }
          className="min-w-48 border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
        >
          <option value="">{t.allCourses}</option>
          {courses.map((course) => (
            <option key={course.courseId} value={course.courseId}>
              {course.title}
            </option>
          ))}
        </select>
      </div>

      <section className="space-y-3 border border-[var(--border)] p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider">{t.create}</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <select
            aria-label={t.selectCourse}
            value={createCourseId}
            onChange={(event) => setCreateCourseId(event.target.value)}
            className="border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
          >
            <option value="">{t.selectCourse}</option>
            {courses
              .filter((course) => course.lifecycle === 'active' && course.availableSeats > 0)
              .map((course) => (
                <option key={course.courseId} value={course.courseId}>
                  {course.title} · {course.availableSeats} seats
                </option>
              ))}
          </select>
          <AdminManagedParticipantPicker selected={createSelection} onChange={setCreateSelection} />
          <input
            aria-label={t.reason}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t.reason}
            className="border border-[var(--border)] bg-transparent p-2 text-xs"
          />
        </div>
        <p className="text-[11px] text-[var(--ink-dim)]">{t.participantLimitation}</p>
        <button
          type="button"
          disabled={!createCourseId || !createSelection || !reason.trim()}
          onClick={requestCreate}
          className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
        >
          {t.create}
        </button>
      </section>

      {courseError && (
        <button type="button" onClick={() => void loadCourses()} className="text-xs text-red-700">
          {t.failed} · {t.retry}
        </button>
      )}

      {readModels.list.loading ? (
        <p className="text-xs text-[var(--ink-dim)]">{t.loading}</p>
      ) : readModels.list.error ? (
        <div role="alert" className="flex items-center gap-2 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <span>{readModels.list.error === 'permission-denied' ? t.denied : t.failed}</span>
          <button type="button" onClick={() => void readModels.retryList()} className="underline">
            {t.retry}
          </button>
        </div>
      ) : readModels.list.items.length === 0 ? (
        <p className="text-xs text-[var(--ink-dim)]">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface)] font-mono uppercase text-[var(--ink-dim)]">
              <tr>
                <th className="p-3">Participant</th>
                <th className="p-3">Course</th>
                <th className="p-3">Lifecycle</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Guest</th>
                <th className="p-3">Rev</th>
              </tr>
            </thead>
            <tbody>
              {readModels.list.items.map((item) => (
                <tr
                  key={item.enrollmentId}
                  className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface)]"
                  onClick={() =>
                    updateQuery({ [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: item.enrollmentId })
                  }
                >
                  <td className="p-3">{item.participant.displayName}</td>
                  <td className="p-3">{item.course.title}</td>
                  <td className="p-3">{item.lifecycleStatus}</td>
                  <td className="p-3">{item.payment?.status ?? 'missing'}</td>
                  <td className="p-3">{item.guestState}</td>
                  <td className="p-3">{item.revision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {readModels.list.hasMore && readModels.loadMore && (
        <button
          type="button"
          disabled={readModels.list.loadingMore}
          onClick={() => void readModels.loadMore?.()}
          className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
        >
          {readModels.list.loadingMore ? t.loading : t.loadMore}
        </button>
      )}

      {selectedEnrollmentId && (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] p-5 shadow-2xl">
          {readModels.detail.loading ? (
            <p className="text-xs text-[var(--ink-dim)]">{t.loading}</p>
          ) : readModels.detail.error ? (
            <button
              type="button"
              onClick={() => void readModels.retryDetail?.()}
              className="text-xs text-red-700 underline"
            >
              {t.failed} · {t.retry}
            </button>
          ) : detail ? (
            <AdminCourseEnrollmentDetail
              detail={detail}
              t={t}
              layout="stacked"
              instructorLabel={resolveCourseEnrollmentInstructorLabel({
                courseId: detail.course.courseId,
                courses,
                attendanceInstructorIds: (detail.attendanceDays ?? []).flatMap(
                  (day) => day.instructorIds
                ),
              })}
              actionReason={reason}
              onActionReasonChange={setReason}
              refundAmount={refundAmount}
              onRefundAmountChange={setRefundAmount}
              paymentAmount={paymentAmount}
              onPaymentAmountChange={(value) => {
                setPaymentAmount(value);
                setConfirmation(undefined);
              }}
              targetCourseId={targetCourseId}
              onTargetCourseIdChange={setTargetCourseId}
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
              onRequestAttempt={requestDetailAttempt}
              paymentActionPending={
                mutationPending && confirmation?.attempt.kind === 'record_provider_payment_event'
                  ? 'cash'
                  : mutationPending &&
                      confirmation?.attempt.kind === 'pay_service_from_wallet_as_administrator'
                    ? 'wallet'
                    : undefined
              }
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
              onClose={() => updateQuery({ [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined })}
            />
          ) : null}
        </aside>
      )}

      {confirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.confirmTitle}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-4"
        >
          <div className="w-full max-w-md space-y-4 border border-[var(--border)] bg-[var(--bg)] p-5">
            <h3 className="text-sm font-medium">{t.confirmTitle}</h3>
            <p className="break-all text-xs text-[var(--ink-dim)]">{confirmation.message}</p>
            {confirmation.attempt.kind ===
              'link_guest_course_enrollment_to_account_as_administrator' && (
              <p className="break-all font-mono text-[10px] text-[var(--ink-dim)]">
                {confirmation.attempt.target.enrollmentId} @ rev{' '}
                {confirmation.attempt.target.revision} → {confirmation.attempt.targetAccountId}/
                {confirmation.attempt.targetParticipantId}
              </p>
            )}
            {mutationError && <p className="text-xs text-red-700">{mutationError}</p>}
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
                {t.cancel}
              </ActionButton>
              <ActionButton
                type="button"
                variant="primary"
                size="sm"
                pending={mutationPending}
                pendingLabel={t.submitting}
                onClick={() => void runConfirmation()}
                className="flex-1"
              >
                {mutationError ? t.retrySame : t.confirm}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCourseEnrollmentPanel;
