import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  type AdminCourseReadModel,
} from '@ski-academy/shared-domain';
import {
  ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';
import { queryAdminCourseReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import type {
  AdminCourseEnrollmentAttempt,
  AdminCourseEnrollmentCourseOption,
  AdminCourseEnrollmentMutationDraft,
  AdminCourseEnrollmentView,
} from './adminCourseEnrollmentContracts';
import {
  captureAdminCourseEnrollmentTarget,
  collectAdminCourseEnrollmentParticipantOptions,
  createAdminCourseEnrollmentAttemptId,
  parseAdminCourseEnrollmentView,
} from './adminCourseEnrollmentUtils';
import { useAdminCourseEnrollmentReadModels } from './useAdminCourseEnrollmentReadModels';
import { useAdminCourseEnrollmentCommands } from './useAdminCourseEnrollmentCommands';
import { useAdminCourseEnrollmentTranslations } from './useAdminCourseEnrollmentTranslations';

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

function courseOptions(
  items: readonly AdminCourseReadModel[]
): AdminCourseEnrollmentCourseOption[] {
  return items
    .map((course) => ({
      courseId: course.courseId,
      title: course.title,
      revision: course.revision,
      availableSeats: course.capacity.availableSeats,
      lifecycle: course.lifecycle,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

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
  const [createParticipantId, setCreateParticipantId] = useState('');
  const [targetCourseId, setTargetCourseId] = useState('');
  const [refundAmount, setRefundAmount] = useState('0');
  const [confirmation, setConfirmation] = useState<{
    readonly attempt: AdminCourseEnrollmentAttempt;
    readonly message: string;
  }>();
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<string>();

  const loadCourses = useCallback(async () => {
    const generation = ++courseGeneration.current;
    setCourseError(false);
    try {
      const result = await queryAdminCourseReadModels({ scope: 'admin_course_list', pageSize: 50 });
      if (generation !== courseGeneration.current || result.scope !== 'admin_course_list') return;
      setCourses(courseOptions(result.items));
    } catch {
      if (generation === courseGeneration.current) setCourseError(true);
    }
  }, []);

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
    setTargetCourseId('');
  }, [readModels.detail.item]);

  const participants = useMemo(
    () => collectAdminCourseEnrollmentParticipantOptions(readModels.list.items),
    [readModels.list.items]
  );

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
    const participant = participants.find((item) => item.participantId === createParticipantId);
    if (!course || !participant || !reason.trim()) return;
    setMutationError(undefined);
    setConfirmation({
      attempt: {
        kind: 'create_course_enrollments',
        idempotencyKey: createAdminCourseEnrollmentAttemptId('create'),
        courseId: course.courseId,
        courseRevision: course.revision,
        participantId: participant.participantId,
        reasonExplanation: reason.trim(),
      },
      message: `${participant.displayName} → ${course.title} @ course rev ${course.revision}`,
    });
  };

  const requestDetailAttempt = (attempt: AdminCourseEnrollmentMutationDraft, message: string) => {
    const detail = readModels.detail.item;
    if (!detail) return;
    setMutationError(undefined);
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
  const availableTargetCourses = detail?.transfer.targetOptions ?? [];
  const hasAnyAction = detail ? Object.values(detail.authorizedActions).some(Boolean) : false;

  return (
    <div className="space-y-5">
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
          <select
            aria-label={t.selectParticipant}
            value={createParticipantId}
            onChange={(event) => setCreateParticipantId(event.target.value)}
            className="border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
          >
            <option value="">{t.selectParticipant}</option>
            {participants.map((participant) => (
              <option key={participant.participantId} value={participant.participantId}>
                {participant.displayName}
              </option>
            ))}
          </select>
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
          disabled={!createCourseId || !createParticipantId || !reason.trim()}
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
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-wider">{t.details}</h3>
            <button
              type="button"
              onClick={() => updateQuery({ [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined })}
              className="border border-[var(--border)] px-3 py-2 text-xs"
            >
              {t.close}
            </button>
          </div>
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
            <div className="space-y-5">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-[var(--ink-dim)]">ID</dt>
                <dd className="break-all">{detail.enrollmentId}</dd>
                <dt className="text-[var(--ink-dim)]">Participant</dt>
                <dd>{detail.participant.displayName}</dd>
                <dt className="text-[var(--ink-dim)]">Course</dt>
                <dd>{detail.course.title}</dd>
                <dt className="text-[var(--ink-dim)]">Lifecycle</dt>
                <dd>{detail.lifecycleStatus}</dd>
                <dt className="text-[var(--ink-dim)]">Capacity</dt>
                <dd>
                  {detail.capacity.availableSeats}/{detail.capacity.totalSeats} available · seat{' '}
                  {detail.capacity.seatHeldByEnrollment ? 'held' : 'released'}
                </dd>
                <dt className="text-[var(--ink-dim)]">Attendance</dt>
                <dd>{detail.attendanceSummary?.recordedDayCount ?? 0} recorded days</dd>
              </dl>

              {detail.payment && (
                <div className="space-y-2 border-t border-[var(--border)] pt-4 text-xs">
                  <p>
                    {detail.payment.status} · {formatKzt(detail.payment.price)} · outstanding{' '}
                    {formatKzt(detail.payment.outstanding)} · rev {detail.payment.revision}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuery({
                        [ADMIN_TAB_QUERY_KEY]: 'finance',
                        [ADMIN_FINANCE_PAYMENT_QUERY_KEY]: detail.payment!.paymentId,
                      })
                    }
                    className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2"
                  >
                    {t.payment} <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                {detail.relatedIssues.map((issue) => (
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
                    {t.issue}: {issue.kind} · {issue.lifecycleStatus}
                  </button>
                ))}
              </div>

              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h4 className="text-xs font-mono uppercase">{t.attendance}</h4>
                {(detail.attendanceDays ?? []).map((day) => (
                  <div
                    key={day.courseDayId}
                    className="space-y-2 border border-[var(--border)] p-3 text-xs"
                  >
                    <p className="font-medium">
                      {new Date(day.startsAt.seconds * 1_000).toLocaleString()} ·{' '}
                      {day.attendanceStatus ?? t.attendanceMissing}
                      {day.attendanceRevision === undefined
                        ? ''
                        : ` · rev ${day.attendanceRevision}`}
                    </p>
                    {day.recordedBy && day.lastChangedBy && (
                      <p className="break-all text-[var(--ink-dim)]">
                        {t.recordedBy}: {attendanceActorLabel(day.recordedBy)} · {t.lastChangedBy}:{' '}
                        {attendanceActorLabel(day.lastChangedBy)}
                      </p>
                    )}
                    {(day.authorizedActions.canRecordPresent ||
                      day.authorizedActions.canRecordAbsent) && (
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
                              disabled={!reason.trim()}
                              onClick={() =>
                                requestDetailAttempt(
                                  {
                                    kind: 'record_course_day_attendance',
                                    courseDayId: day.courseDayId,
                                    attendanceStatus,
                                    ...(day.attendanceRevision === undefined
                                      ? {}
                                      : { expectedAttendanceRevision: day.attendanceRevision }),
                                    reasonExplanation: reason.trim(),
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
              </div>

              <label htmlFor="admin-course-enrollment-action-reason" className="block text-xs">
                {t.reason}
                <input
                  id="admin-course-enrollment-action-reason"
                  aria-label="Action reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                />
              </label>

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
                      onChange={(event) => setRefundAmount(event.target.value)}
                      className="mt-1 w-full border border-[var(--border)] bg-transparent p-2"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={
                        !reason.trim() ||
                        !Number.isInteger(Number(refundAmount)) ||
                        Number(refundAmount) < 0 ||
                        Number(refundAmount) > detail.cancellation.maximumRefund
                      }
                      onClick={() =>
                        requestDetailAttempt(
                          {
                            kind: 'resolve_course_enrollment_cancellation',
                            decision: 'approve',
                            refundAmount: Number(refundAmount),
                            reasonExplanation: reason.trim(),
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
                      disabled={!reason.trim()}
                      onClick={() =>
                        requestDetailAttempt(
                          {
                            kind: 'resolve_course_enrollment_cancellation',
                            decision: 'reject',
                            reasonExplanation: reason.trim(),
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
                    onChange={(event) => setTargetCourseId(event.target.value)}
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
                    disabled={!targetCourseId || !reason.trim()}
                    onClick={() => {
                      const parsed = CourseIdSchema.safeParse(targetCourseId);
                      if (!parsed.success) return;
                      requestDetailAttempt(
                        {
                          kind: 'transfer_course_enrollment',
                          targetCourseId: parsed.data,
                          reasonExplanation: reason.trim(),
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
                    requestDetailAttempt(
                      { kind: 'reconcile_course_enrollment' },
                      `${t.reconcile}: ${detail.reconciliation.evidenceIssueIds.join(', ')} @ rev ${detail.revision}`
                    )
                  }
                  className="inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {t.reconcile}
                </button>
              )}

              {detail.authorizedActions.canResolveAttendanceOutcome && (
                <button
                  type="button"
                  onClick={() =>
                    requestDetailAttempt(
                      { kind: 'resolve_attendance_outcome' },
                      `${t.resolveOutcome}: ${detail.enrollmentId} @ rev ${detail.revision}`
                    )
                  }
                  className="border border-[var(--border)] px-3 py-2 text-xs"
                >
                  {t.resolveOutcome}
                </button>
              )}

              {detail.guestState !== 'not_guest' && (
                <p className="flex gap-2 border border-amber-400 p-3 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {t.guestDeferred}
                </p>
              )}
              {!hasAnyAction && (
                <p className="flex gap-2 text-xs text-[var(--ink-dim)]">
                  <Users className="h-4 w-4" /> {t.noActions}
                </p>
              )}
            </div>
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
            {mutationError && <p className="text-xs text-red-700">{mutationError}</p>}
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
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={mutationPending}
                onClick={() => void runConfirmation()}
                className="flex-1 border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)]"
              >
                {mutationPending ? t.submitting : mutationError ? t.retrySame : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCourseEnrollmentPanel;
