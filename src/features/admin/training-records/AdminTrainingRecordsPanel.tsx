import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionButton } from '../../../ui/ActionButton';
import { queryAdminCourseReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import {
  ADMIN_CHANGE_REQUEST_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY,
  ADMIN_PLANNER_DATE_QUERY_KEY,
  ADMIN_PLANNER_FOCUS_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
  ADMIN_TRAINING_KIND_QUERY_KEY,
  ADMIN_TRAINING_SCOPE_QUERY_KEY,
} from '../adminNavigation';
import { AdminCourseEnrollmentDetail } from '../course-enrollments/AdminCourseEnrollmentDetail';
import { courseEnrollmentPrimaryStatus } from '../course-enrollments/adminCourseEnrollmentPresentation';
import type {
  AdminCourseEnrollmentAttempt,
  AdminCourseEnrollmentCourseOption,
} from '../course-enrollments/adminCourseEnrollmentContracts';
import { useAdminCourseEnrollmentCommands } from '../course-enrollments/useAdminCourseEnrollmentCommands';
import { useAdminCourseEnrollmentReadModels } from '../course-enrollments/useAdminCourseEnrollmentReadModels';
import { useAdminCourseEnrollmentTranslations } from '../course-enrollments/useAdminCourseEnrollmentTranslations';
import {
  captureAdminCourseEnrollmentTarget,
  createAdminCourseEnrollmentAttemptId,
  parseAdminCourseEnrollmentView,
  resolveCourseEnrollmentInstructorLabel,
  toAdminCourseEnrollmentCourseOptions,
} from '../course-enrollments/adminCourseEnrollmentUtils';
import { AdminManagedParticipantPicker } from '../identity';
import type { AdminManagedParticipantSelection } from '../identity';
import { AdminLessonBookingDetail } from '../lesson-bookings/AdminLessonBookingDetail';
import type {
  AdminLessonBookingAttempt,
  AdminLessonBookingMutationAttempt,
  AdminLessonBookingMutationDraft,
  AdminLessonInstructorOption,
} from '../lesson-bookings/lessonBookingAdminContracts';
import {
  formatLessonAdminDuration,
  LESSON_ADMIN_ORIGIN_LABEL_KEYS,
  LESSON_ADMIN_PRIMARY_STATUS_KEYS,
  PAYMENT_STATUS_LABEL_KEYS,
  resolveLessonAdminPrimaryStatus,
} from '../lesson-bookings/lessonBookingAdminPresentation';
import { useAdminLessonBookingCommands } from '../lesson-bookings/useAdminLessonBookingCommands';
import { useAdminLessonBookingReadModels } from '../lesson-bookings/useAdminLessonBookingReadModels';
import { useAdminLessonBookingTranslations } from '../lesson-bookings/useAdminLessonBookingTranslations';
import {
  captureAdminLessonBookingTarget,
  createAdminLessonBookingAttemptId,
  parseAdminLessonBookingView,
} from '../lesson-bookings/lessonBookingAdminUtils';
import { useSharedAdminMonitorReadModels } from '../operations/AdminMonitorReadModelsContext';
import type { AdminTrainingKindFilter } from './adminTrainingRecordContracts';
import {
  courseEnrollmentListCardInput,
  trainingPaymentStatus,
} from './adminTrainingRecordPresentation';
import { AdminTrainingRecordListRow } from './AdminTrainingRecordListRow';
import {
  courseViewForTrainingScope,
  lessonViewForTrainingScope,
  mergeAdminTrainingRecords,
  resolveAdminTrainingKindFilter,
  resolveAdminTrainingScope,
} from './adminTrainingRecordUtils';

interface AdminTrainingRecordsPanelProps {
  readonly adminAccountId: string;
  readonly instructors: readonly AdminLessonInstructorOption[];
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

export function AdminTrainingRecordsPanel({
  adminAccountId,
  instructors,
}: AdminTrainingRecordsPanelProps) {
  const { language, t } = useAdminLessonBookingTranslations();
  const courseCopy = useAdminCourseEnrollmentTranslations();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const [searchParams, setSearchParams] = useSearchParams();
  const bookingView = parseAdminLessonBookingView(
    searchParams.get(ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY)
  );
  const enrollmentView = parseAdminCourseEnrollmentView(
    searchParams.get(ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY)
  );
  const bookingParam = searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY);
  const parsedBooking = BookingIdSchema.safeParse(bookingParam);
  const selectedBookingId = parsedBooking.success ? parsedBooking.data : undefined;
  const selectedEnrollment = CourseEnrollmentIdSchema.safeParse(
    searchParams.get(ADMIN_COURSE_ENROLLMENT_QUERY_KEY)
  );
  const selectedEnrollmentId = selectedEnrollment.success ? selectedEnrollment.data : undefined;
  const filteredCourse = CourseIdSchema.safeParse(
    searchParams.get(ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY)
  );
  const courseId = filteredCourse.success ? filteredCourse.data : undefined;
  const kind = resolveAdminTrainingKindFilter({
    explicit: searchParams.get(ADMIN_TRAINING_KIND_QUERY_KEY),
    hasBooking: Boolean(selectedBookingId),
    hasEnrollment: Boolean(selectedEnrollmentId),
    hasCourseFilter: Boolean(courseId),
  });
  const scope = resolveAdminTrainingScope({
    explicit: searchParams.get(ADMIN_TRAINING_SCOPE_QUERY_KEY),
    kind,
    bookingView,
    enrollmentView,
  });
  const changeRequestParam = searchParams.get(ADMIN_CHANGE_REQUEST_QUERY_KEY);
  const parsedChangeRequest = BookingChangeRequestIdSchema.safeParse(changeRequestParam);
  const focusedChangeRequestId = parsedChangeRequest.success ? parsedChangeRequest.data : undefined;
  const { refreshAllProjections } = useSharedAdminMonitorReadModels();

  const lessonEnabled = kind !== 'course' || Boolean(selectedBookingId);
  const courseEnabled = kind !== 'lesson' || Boolean(selectedEnrollmentId);
  const lessonReads = useAdminLessonBookingReadModels({
    enabled: lessonEnabled,
    view: lessonViewForTrainingScope(scope),
    ...(selectedBookingId ? { selectedBookingId } : {}),
  });
  const courseReads = useAdminCourseEnrollmentReadModels({
    enabled: courseEnabled,
    view: courseViewForTrainingScope(scope),
    courseId,
    selectedEnrollmentId,
  });

  const refreshLessonBooking = lessonReads.refreshBooking;
  const refreshBookingWithProjections = useCallback(
    async (bookingId: Parameters<typeof refreshLessonBooking>[0]) => {
      const result = await refreshLessonBooking(bookingId);
      if (result.status === 'success') await refreshAllProjections();
      return result;
    },
    [refreshAllProjections, refreshLessonBooking]
  );
  const lessonCommands = useAdminLessonBookingCommands({
    adminAccountId,
    refreshBooking: refreshBookingWithProjections,
  });

  const [courses, setCourses] = useState<AdminCourseEnrollmentCourseOption[]>([]);
  const courseGeneration = useRef(0);
  const loadCourses = useCallback(async () => {
    const generation = ++courseGeneration.current;
    try {
      const result = await queryAdminCourseReadModels({ scope: 'admin_course_list', pageSize: 50 });
      if (generation !== courseGeneration.current || result.scope !== 'admin_course_list') return;
      setCourses(toAdminCourseEnrollmentCourseOptions(result.items));
    } catch {
      // Course catalog is only needed for enroll-on-behalf; list records still render.
    }
  }, []);
  const courseCommands = useAdminCourseEnrollmentCommands({
    adminAccountId,
    refreshList: courseReads.refreshList,
    refreshEnrollment: courseReads.refreshEnrollment,
    refreshCourses: loadCourses,
  });

  useEffect(() => {
    if (kind === 'lesson') return;
    void loadCourses();
    return () => {
      courseGeneration.current += 1;
    };
  }, [kind, loadCourses]);

  const [lessonConfirmation, setLessonConfirmation] = useState<{
    readonly attempt: AdminLessonBookingAttempt;
    readonly message: string;
  }>();
  const [courseConfirmation, setCourseConfirmation] = useState<{
    readonly attempt: AdminCourseEnrollmentAttempt;
    readonly message: string;
  }>();
  const [mutationPending, setMutationPending] = useState(false);
  const [attendanceFinalizeSuccessNonce, setAttendanceFinalizeSuccessNonce] = useState(0);
  const [mutationError, setMutationError] = useState<{ code: string; message: string } | string>();
  const [mutationNotice, setMutationNotice] = useState<string>();
  const [actionReason, setActionReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [linkSelection, setLinkSelection] = useState<AdminManagedParticipantSelection>();
  const [linkReason, setLinkReason] = useState('');
  const [createCourseId, setCreateCourseId] = useState('');
  const [createSelection, setCreateSelection] = useState<AdminManagedParticipantSelection>();
  const [createReason, setCreateReason] = useState('');
  const [targetCourseId, setTargetCourseId] = useState('');
  const detailPanelRef = useRef<HTMLElement>(null);

  // Lesson-booking drafts (reason / refund / payment / guest link) are owned by
  // `AdminLessonBookingDetail` now, so only the course-enrollment drafts are seeded here.
  useEffect(() => {
    const item = courseReads.detail.item;
    if (!item || selectedBookingId) return;
    setRefundAmount(String(item.cancellation?.maximumRefund ?? 0));
    setPaymentAmount(String(item.payment?.outstanding ?? 0));
    setTargetCourseId('');
    setActionReason('');
  }, [courseReads.detail.item, selectedBookingId]);

  useEffect(() => {
    setLinkSelection(undefined);
    setLinkReason('');
    setMutationNotice(undefined);
  }, [selectedBookingId, selectedEnrollmentId]);

  const updateQuery = (updates: Readonly<Record<string, string | undefined>>) => {
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

  const setKind = (next: AdminTrainingKindFilter) =>
    updateQuery({
      [ADMIN_TRAINING_KIND_QUERY_KEY]: next,
      [ADMIN_LESSON_BOOKING_QUERY_KEY]: undefined,
      [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined,
    });

  const setScope = (next: typeof scope) =>
    updateQuery({
      [ADMIN_TRAINING_SCOPE_QUERY_KEY]: next,
      [ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY]: lessonViewForTrainingScope(next),
      [ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY]: courseViewForTrainingScope(next),
      [ADMIN_LESSON_BOOKING_QUERY_KEY]: undefined,
      [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined,
    });

  const records = useMemo(
    () =>
      mergeAdminTrainingRecords({
        kind,
        lessons: lessonReads.list.items.map((data) => ({
          kind: 'lesson' as const,
          id: data.bookingId,
          data,
        })),
        courses: courseReads.list.items.map((data) => ({
          kind: 'course' as const,
          id: data.enrollmentId,
          data,
        })),
      }),
    [courseReads.list.items, kind, lessonReads.list.items]
  );

  const listLoading =
    (lessonEnabled && lessonReads.list.loading) || (courseEnabled && courseReads.list.loading);
  const listError = lessonReads.list.error || courseReads.list.error;
  const hasMore = lessonReads.list.hasMore || Boolean(courseReads.list.hasMore);

  const requestLessonAttempt = (attempt: AdminLessonBookingAttempt, message: string) => {
    setMutationError(undefined);
    setMutationNotice(undefined);
    setCourseConfirmation(undefined);
    setLessonConfirmation({ attempt, message });
  };

  const requestCourseAttempt = (attempt: AdminCourseEnrollmentAttempt, message: string) => {
    setMutationError(undefined);
    setMutationNotice(undefined);
    setLessonConfirmation(undefined);
    setCourseConfirmation({ attempt, message });
  };

  const runConfirmation = async () => {
    if (mutationPending) return;
    if (lessonConfirmation) {
      setMutationPending(true);
      const result = await lessonCommands.runAttempt(lessonConfirmation.attempt);
      setMutationPending(false);
      if (result.status === 'success') {
        if (
          result.refreshFailed &&
          lessonConfirmation.attempt.kind === 'record_provider_payment_event'
        ) {
          setMutationNotice(t('adminLessonPaymentRecordedRefreshPending'));
        }
        setLessonConfirmation(undefined);
        return;
      }
      setMutationError(result.error);
      if (result.error.code === 'stale_version') setLessonConfirmation(undefined);
      return;
    }
    if (!courseConfirmation) return;
    setMutationPending(true);
    const result = await courseCommands.runAttempt(courseConfirmation.attempt);
    setMutationPending(false);
    if (result.status === 'success') {
      if (
        result.refreshFailed &&
        courseConfirmation.attempt.kind === 'record_provider_payment_event'
      ) {
        setMutationNotice(courseCopy.paymentRecordedRefreshPending);
      }
      setCourseConfirmation(undefined);
      setCreateReason('');
      return;
    }
    setMutationError(result.error.message);
    if (result.error.code === 'stale_version') setCourseConfirmation(undefined);
  };

  const lessonDetail = lessonReads.detail.item;
  const lessonAdmin = lessonDetail?.admin;
  const courseDetail = courseReads.detail.item;
  const confirmation = lessonConfirmation ?? courseConfirmation;

  const handleCommitAttendanceFinalize = useCallback(
    async (attempt: AdminLessonBookingMutationDraft): Promise<boolean> => {
      if (!lessonDetail || mutationPending) return false;
      setMutationPending(true);
      setMutationError(undefined);
      const fullAttempt = {
        ...attempt,
        target: captureAdminLessonBookingTarget(lessonDetail),
        idempotencyKey: createAdminLessonBookingAttemptId(attempt.kind),
      } as AdminLessonBookingMutationAttempt;
      const result = await lessonCommands.runAttempt(fullAttempt);
      setMutationPending(false);
      if (result.status === 'success') {
        setAttendanceFinalizeSuccessNonce((value) => value + 1);
        return true;
      }
      setMutationError(result.error);
      return false;
    },
    [lessonCommands, lessonDetail, mutationPending]
  );

  return (
    <div className="space-y-6">
      {typeof mutationError === 'object' && mutationError && !confirmation && (
        <div role="alert" className="border border-red-500/30 bg-red-500/5 p-3 text-xs">
          {readableError(mutationError)}
        </div>
      )}
      {typeof mutationError === 'string' && !confirmation && (
        <div role="alert" className="border border-red-500/30 bg-red-500/5 p-3 text-xs">
          {mutationError}
        </div>
      )}
      {mutationNotice && (
        <div role="status" className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          {mutationNotice}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,38fr)_minmax(0,62fr)]">
        <section
          aria-label={t('adminTrainingListLabel')}
          className="overflow-hidden rounded-[var(--radius)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)]"
        >
          <div className="space-y-3 border-b border-[var(--border)] p-3">
            <div className="inline-flex rounded-full bg-[var(--profile-bg)] p-1">
              {(['all', 'lesson', 'course'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={kind === candidate}
                  onClick={() => setKind(candidate)}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${
                    kind === candidate
                      ? 'bg-[var(--ink)] text-[var(--bg)] shadow-sm'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {candidate === 'all'
                    ? t('adminTrainingFilterAll')
                    : candidate === 'lesson'
                      ? t('adminTrainingFilterLessons')
                      : t('adminTrainingFilterCourses')}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['current', 'history', 'pending_guest'] as const).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={scope === candidate}
                    onClick={() => setScope(candidate)}
                    className={`border px-3 py-1.5 text-xs ${
                      scope === candidate
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    {candidate === 'current'
                      ? t('adminTrainingScopeCurrent')
                      : candidate === 'history'
                        ? t('adminTrainingScopeHistory')
                        : t('adminTrainingScopePendingGuests')}
                  </button>
                ))}
              {kind !== 'lesson' && (
                <select
                  aria-label={courseCopy.selectCourse}
                  value={courseId ?? ''}
                  onChange={(event) =>
                    updateQuery({
                      [ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY]: event.target.value || undefined,
                      [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined,
                    })
                  }
                  className="min-w-40 border border-[var(--border)] bg-[var(--bg)] p-1.5 text-xs"
                >
                  <option value="">{courseCopy.allCourses}</option>
                  {courses.map((course) => (
                    <option key={course.courseId} value={course.courseId}>
                      {course.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {kind !== 'lesson' && (
            <section className="space-y-3 border-b border-[var(--border)] p-3">
              <h3 className="text-xs font-mono uppercase tracking-wider">{courseCopy.create}</h3>
              <div className="grid gap-2">
                <select
                  aria-label={courseCopy.selectCourse}
                  value={createCourseId || courseId || ''}
                  onChange={(event) => setCreateCourseId(event.target.value)}
                  className="border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
                >
                  <option value="">{courseCopy.selectCourse}</option>
                  {courses
                    .filter((course) => course.lifecycle === 'active' && course.availableSeats > 0)
                    .map((course) => (
                      <option key={course.courseId} value={course.courseId}>
                        {course.title} · {course.availableSeats} seats
                      </option>
                    ))}
                </select>
                <AdminManagedParticipantPicker
                  selected={createSelection}
                  onChange={setCreateSelection}
                />
                <input
                  aria-label={courseCopy.reason}
                  value={createReason}
                  onChange={(event) => setCreateReason(event.target.value)}
                  placeholder={courseCopy.reason}
                  className="border border-[var(--border)] bg-transparent p-2 text-xs"
                />
                <button
                  type="button"
                  disabled={!(createCourseId || courseId) || !createSelection || !createReason.trim()}
                  onClick={() => {
                    const selectedCreate = createCourseId || courseId || '';
                    const course = courses.find((item) => item.courseId === selectedCreate);
                    if (!course || !createSelection || !createReason.trim()) return;
                    requestCourseAttempt(
                      {
                        kind: 'create_course_enrollments',
                        idempotencyKey: createAdminCourseEnrollmentAttemptId('create'),
                        courseId: course.courseId,
                        courseRevision: course.revision,
                        participantId: createSelection.participantId,
                        reasonExplanation: createReason.trim(),
                      },
                      `${createSelection.displayName} → ${course.title} @ course rev ${course.revision}`
                    );
                  }}
                  className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
                >
                  {courseCopy.create}
                </button>
              </div>
            </section>
          )}

          <div className="p-3">
            {listLoading ? (
              <div role="status" className="flex min-h-36 items-center justify-center gap-2 text-xs">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('adminLessonLoading')}
              </div>
            ) : listError ? (
              <div role="alert" className="border border-red-500/30 p-4 text-xs">
                {listError === 'permission-denied'
                  ? t('adminLessonPermissionDenied')
                  : t('adminLessonReadFailed')}
                <button
                  type="button"
                  onClick={() => {
                    void lessonReads.retryList();
                    void courseReads.retryList();
                  }}
                  className="mt-3 flex items-center gap-2 border border-[var(--border)] px-3 py-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {t('adminLessonRetry')}
                </button>
              </div>
            ) : records.length === 0 ? (
              <p className="border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--ink-dim)]">
                {t('adminLessonEmpty')}
              </p>
            ) : (
              <div className="space-y-2">
                {records.map((record) => {
                  const selected =
                    record.kind === 'lesson'
                      ? selectedBookingId === record.id
                      : selectedEnrollmentId === record.id;
                  if (record.kind === 'lesson') {
                    const occurrence = listOccurrenceParts(record.data, locale);
                    const primaryStatus = resolveLessonAdminPrimaryStatus(record.data);
                    const paymentStatus = trainingPaymentStatus(record);
                    return (
                      <AdminTrainingRecordListRow
                        key={`lesson:${record.id}`}
                        selected={selected}
                        onSelect={() =>
                          updateQuery({
                            [ADMIN_LESSON_BOOKING_QUERY_KEY]: record.id,
                            [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: undefined,
                          })
                        }
                        item={{
                          bookingId: record.data.bookingId,
                          trainingRecordId: `lesson:${record.id}`,
                          recordKind: 'lesson',
                          kindLabel: t('adminTrainingKindLesson'),
                          participantNames: record.data.participants
                            .map((participant) => participant.displayName)
                            .join(', '),
                          date: occurrence.date,
                          time: occurrence.time,
                          instructor: record.data.instructor.displayName,
                          duration: formatLessonAdminDuration(
                            record.data.occurrence.durationMinutes,
                            t
                          ),
                          primaryStatus,
                          primaryStatusLabel: t(LESSON_ADMIN_PRIMARY_STATUS_KEYS[primaryStatus]),
                          ...(paymentStatus
                            ? {
                                paymentStatus,
                                paymentStatusLabel: t(PAYMENT_STATUS_LABEL_KEYS[paymentStatus]),
                              }
                            : {}),
                          origin: record.data.bookingOrigin,
                          originLabel: t(LESSON_ADMIN_ORIGIN_LABEL_KEYS[record.data.bookingOrigin]),
                        }}
                      />
                    );
                  }
                  const paymentStatus = trainingPaymentStatus(record);
                  const recordedDaysLabel = record.data.attendanceSummary
                    ? courseCopy.recordedDays.replace(
                        '{n}',
                        String(record.data.attendanceSummary.recordedDayCount)
                      )
                    : undefined;
                  const primaryStatus = courseEnrollmentPrimaryStatus(record.data);
                  const instructor = resolveCourseEnrollmentInstructorLabel({
                    courseId: record.data.course.courseId,
                    courses,
                    instructorDirectory: instructors,
                  });
                  return (
                    <AdminTrainingRecordListRow
                      key={`course:${record.id}`}
                      selected={selected}
                      onSelect={() =>
                        updateQuery({
                          [ADMIN_COURSE_ENROLLMENT_QUERY_KEY]: record.id,
                          [ADMIN_LESSON_BOOKING_QUERY_KEY]: undefined,
                        })
                      }
                      item={courseEnrollmentListCardInput({
                        item: record.data,
                        kindLabel: t('adminTrainingKindCourse'),
                        primaryStatusLabel: t(LESSON_ADMIN_PRIMARY_STATUS_KEYS[primaryStatus]),
                        originLabel: t(
                          LESSON_ADMIN_ORIGIN_LABEL_KEYS[
                            record.data.guestState === 'not_guest' ? 'account' : 'guest'
                          ]
                        ),
                        ...(paymentStatus
                          ? { paymentStatusLabel: t(PAYMENT_STATUS_LABEL_KEYS[paymentStatus]) }
                          : {}),
                        ...(recordedDaysLabel ? { recordedDaysLabel } : {}),
                        ...(instructor ? { instructor } : {}),
                      })}
                    />
                  );
                })}
                {hasMore && (
                  <button
                    type="button"
                    disabled={lessonReads.list.loadingMore || courseReads.list.loadingMore}
                    onClick={() => {
                      if (lessonReads.list.hasMore) void lessonReads.loadMore();
                      if (courseReads.list.hasMore) void courseReads.loadMore?.();
                    }}
                    className="w-full border border-[var(--border)] px-3 py-2 text-xs font-medium disabled:opacity-50"
                  >
                    {lessonReads.list.loadingMore || courseReads.list.loadingMore
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
          aria-label={t('adminTrainingDetailLabel')}
          tabIndex={-1}
        >
          {!selectedBookingId && !selectedEnrollmentId ? (
            <p className="flex min-h-52 items-center justify-center text-center text-xs text-[var(--ink-dim)]">
              {t('adminTrainingSelectPrompt')}
            </p>
          ) : selectedBookingId ? (
            lessonReads.detail.loading ? (
              <div role="status" className="flex min-h-52 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !lessonDetail || !lessonAdmin ? (
              <p className="p-4 text-xs text-[var(--ink-dim)]">{t('adminLessonNotFound')}</p>
            ) : (
              <AdminLessonBookingDetail
                key={lessonDetail.bookingId}
                detail={lessonDetail}
                admin={lessonAdmin}
                language={language}
                locale={locale}
                t={t}
                onRequestAttempt={(attempt, message) =>
                  requestLessonAttempt(
                    {
                      ...attempt,
                      target: captureAdminLessonBookingTarget(lessonDetail),
                      idempotencyKey: createAdminLessonBookingAttemptId(attempt.kind),
                    } as AdminLessonBookingMutationAttempt,
                    message
                  )
                }
                onCommitAttendanceFinalize={handleCommitAttendanceFinalize}
                attendanceFinalizePending={mutationPending}
                attendanceFinalizeSuccessNonce={attendanceFinalizeSuccessNonce}
                onClearConfirmation={() => setLessonConfirmation(undefined)}
                focusedChangeRequestId={focusedChangeRequestId}
                onOpenPlanner={() => {
                  const parts = localParts(lessonDetail);
                  updateQuery({
                    [ADMIN_TAB_QUERY_KEY]: 'operations',
                    [ADMIN_PLANNER_DATE_QUERY_KEY]: parts.date,
                    [ADMIN_PLANNER_FOCUS_QUERY_KEY]: lessonDetail.bookingId,
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
            )
          ) : courseReads.detail.loading ? (
            <div role="status" className="flex min-h-52 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !courseDetail ? (
            <p className="p-4 text-xs text-[var(--ink-dim)]">{courseCopy.empty}</p>
          ) : (
              <AdminCourseEnrollmentDetail
                key={courseDetail.enrollmentId}
                detail={courseDetail}
                t={courseCopy}
                layout="tabs"
                instructorLabel={resolveCourseEnrollmentInstructorLabel({
                  courseId: courseDetail.course.courseId,
                  courses,
                  instructorDirectory: instructors,
                  attendanceInstructorIds: courseDetail.attendanceDays.flatMap(
                    (day) => day.instructorIds
                  ),
                })}
                actionReason={actionReason}
                onActionReasonChange={setActionReason}
                refundAmount={refundAmount}
                onRefundAmountChange={setRefundAmount}
                paymentAmount={paymentAmount}
                onPaymentAmountChange={(value) => {
                  setPaymentAmount(value);
                  setCourseConfirmation(undefined);
                }}
                targetCourseId={targetCourseId}
                onTargetCourseIdChange={setTargetCourseId}
                linkSelection={linkSelection}
                onLinkSelectionChange={(selection) => {
                  setLinkSelection(selection);
                  setCourseConfirmation(undefined);
                }}
                linkReason={linkReason}
                onLinkReasonChange={(value) => {
                  setLinkReason(value);
                  setCourseConfirmation(undefined);
                }}
                onRequestAttempt={(attempt, message) =>
                  requestCourseAttempt(
                    {
                      ...attempt,
                      target: captureAdminCourseEnrollmentTarget(courseDetail),
                      idempotencyKey: createAdminCourseEnrollmentAttemptId(attempt.kind),
                    } as AdminCourseEnrollmentAttempt,
                    message
                  )
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
          )}
        </aside>
      </div>

      {confirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            lessonConfirmation ? t('adminLessonConfirmTitle') : courseCopy.confirmTitle
          }
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-4"
        >
          <div className="w-full max-w-md space-y-4 border border-[var(--border)] bg-[var(--bg)] p-5">
            <h3 className="text-sm font-medium">
              {lessonConfirmation ? t('adminLessonConfirmTitle') : courseCopy.confirmTitle}
            </h3>
            <p className="text-xs text-[var(--ink-dim)]">{confirmation.message}</p>
            {mutationError && (
              <p role="alert" className="text-xs text-red-700">
                {typeof mutationError === 'string' ? mutationError : readableError(mutationError)}
              </p>
            )}
            <div className="flex gap-2">
              <ActionButton
                type="button"
                size="sm"
                disabled={mutationPending}
                onClick={() => {
                  setLessonConfirmation(undefined);
                  setCourseConfirmation(undefined);
                  setMutationError(undefined);
                }}
                className="flex-1"
              >
                {lessonConfirmation ? t('adminLessonConfirmCancel') : courseCopy.cancel}
              </ActionButton>
              <ActionButton
                type="button"
                variant="primary"
                size="sm"
                pending={mutationPending}
                pendingLabel={
                  lessonConfirmation ? t('adminLessonSubmitting') : courseCopy.submitting
                }
                onClick={() => void runConfirmation()}
                className="flex-1"
              >
                {mutationError
                  ? lessonConfirmation
                    ? t('adminLessonRetrySame')
                    : courseCopy.retrySame
                  : lessonConfirmation
                    ? t('adminLessonConfirmSubmit')
                    : courseCopy.confirm}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminTrainingRecordsPanel;
