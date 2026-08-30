import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import type { TranslationKey } from '../../../app/providers/LanguageContext';
import {
  formatInstructorCourseAssignedDaysSummary,
  formatInstructorCourseDayDate,
  formatInstructorCourseDayTimeRange,
  formatInstructorCourseScheduleSummary,
  buildInstructorCourseDayViewModels,
  selectInstructorCourseViewModel,
  useInstructorCourseAttendanceCommands,
  useInstructorCourseAttendanceMutation,
  useInstructorCourseReadSync,
  useInstructorCourseStore,
} from '../../instructor-courses';
import type {
  InstructorCourseAttendanceActionInput,
  InstructorCourseAttendanceMutationState,
  InstructorCourseDayParticipantViewModel,
  InstructorCourseDayViewModel,
} from '../../instructor-courses';

interface InstructorCourseSectionProps {
  readonly accountId: string;
  readonly instructorId: string;
  readonly t: (key: TranslationKey) => string;
}

function lifecycleStatusLabel(
  status: InstructorCourseDayParticipantViewModel['lifecycleStatus'],
  t: (key: TranslationKey) => string
): string {
  switch (status) {
    case 'confirmed':
      return t('instructorCourseLifecycleConfirmed');
    case 'pending_cancellation':
      return t('instructorCourseLifecyclePendingCancellation');
    default:
      return status;
  }
}

export const InstructorCourseSection: React.FC<InstructorCourseSectionProps> = ({
  accountId,
  instructorId,
  t,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>();
  const [selectedCourseDayId, setSelectedCourseDayId] = useState<string | undefined>();
  const assignedCourses = useInstructorCourseStore((state) => state.assignedCourses);
  const discoveryLoading = useInstructorCourseStore((state) => state.discoveryLoading);
  const rosterLoading = useInstructorCourseStore((state) => state.rosterLoading);
  const loaded = useInstructorCourseStore((state) => state.loaded);
  const error = useInstructorCourseStore((state) => state.error);
  const errorCode = useInstructorCourseStore((state) => state.errorCode);
  const { reload } = useInstructorCourseReadSync({
    enabled: true,
    accountId,
    instructorId,
    selectedCourseId,
  });

  useEffect(() => {
    if (!selectedCourseId && assignedCourses.length > 0) {
      setSelectedCourseId(assignedCourses[0]?.courseId);
    }
    if (
      selectedCourseId &&
      !assignedCourses.some((course) => course.courseId === selectedCourseId)
    ) {
      setSelectedCourseId(assignedCourses[0]?.courseId);
    }
  }, [assignedCourses, selectedCourseId]);

  const selectedAssignment = useMemo(
    () => assignedCourses.find((course) => course.courseId === selectedCourseId),
    [assignedCourses, selectedCourseId]
  );

  const selectedCourseViewModel = useInstructorCourseStore((state) =>
    selectedCourseId ? selectInstructorCourseViewModel(state, selectedCourseId) : undefined
  );
  const { recordCourseDayAttendance, refetchCourseAttendance } =
    useInstructorCourseAttendanceCommands(accountId);
  const attendanceMutation = useInstructorCourseAttendanceMutation(
    recordCourseDayAttendance,
    refetchCourseAttendance
  );

  const courseDays = useMemo(
    () =>
      selectedCourseViewModel && selectedAssignment
        ? buildInstructorCourseDayViewModels({
            assignment: selectedAssignment,
            course: selectedCourseViewModel,
          })
        : [],
    [selectedAssignment, selectedCourseViewModel]
  );

  useEffect(() => {
    if (!courseDays.some((courseDay) => courseDay.courseDayId === selectedCourseDayId)) {
      setSelectedCourseDayId(courseDays[0]?.courseDayId);
    }
  }, [courseDays, selectedCourseDayId]);

  const selectedCourseDay = useMemo(
    () =>
      courseDays.find((courseDay) => courseDay.courseDayId === selectedCourseDayId) ??
      courseDays[0],
    [courseDays, selectedCourseDayId]
  );

  if (discoveryLoading && !loaded) {
    return (
      <div className="space-y-4">
        <SectionHeader t={t} />
        <StatePanel
          icon={<Loader2 className="w-6 h-6 animate-spin text-[var(--ink-dim)]" />}
          message={t('instructorCourseDiscoveryLoading')}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <SectionHeader t={t} />
        <StatePanel
          icon={<BookOpen className="w-6 h-6 text-[var(--ink-dim)]" />}
          message={
            errorCode === 'permission-denied'
              ? t('instructorCourseReadPermissionDenied')
              : t('instructorCourseReadFailed')
          }
          action={
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-slate-200 dark:border-slate-700 rounded-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('retry')}
            </button>
          }
        />
      </div>
    );
  }

  if (loaded && assignedCourses.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader t={t} />
        <StatePanel
          icon={<BookOpen className="w-6 h-6 text-[var(--ink-dim)]" />}
          message={t('instructorAssignedCoursesEmpty')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader t={t} count={assignedCourses.length} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {assignedCourses.map((assignment) => {
          const isSelected = assignment.courseId === selectedCourseId;
          const scheduleSummary = formatInstructorCourseScheduleSummary(assignment);
          const assignedDaysSummary = formatInstructorCourseAssignedDaysSummary(assignment);

          return (
            <button
              key={assignment.courseId}
              type="button"
              onClick={() => {
                setSelectedCourseId(assignment.courseId);
                setSelectedCourseDayId(undefined);
              }}
              className={`text-left border p-4 rounded-xs transition-colors duration-200 space-y-2 ${
                isSelected
                  ? 'border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/30 shadow-xs'
                  : 'border-slate-200/70 dark:border-slate-800/70 bg-[var(--card-bg)] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <h5 className="font-serif text-sm text-[var(--ink)] font-bold leading-snug">
                {assignment.title}
              </h5>
              {scheduleSummary ? (
                <p className="text-[10px] font-mono text-[var(--ink-dim)] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                  {scheduleSummary}
                </p>
              ) : null}
              {assignedDaysSummary ? (
                <p className="text-[10px] font-mono text-[var(--ink-dim)]">
                  {t('instructorCourseAssignedDays')}: {assignedDaysSummary}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedAssignment ? (
        <div className="border border-slate-200/70 dark:border-slate-800/70 bg-[var(--card-bg)] rounded-xs p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
            <h5 className="text-sm font-serif text-[var(--ink)] font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              {t('instructorCourseDaysTitle')}
            </h5>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {selectedAssignment.title}
            </span>
          </div>

          {rosterLoading || !selectedCourseViewModel ? (
            <StatePanel
              icon={<Loader2 className="w-5 h-5 animate-spin text-[var(--ink-dim)]" />}
              message={t('instructorCourseRosterLoading')}
            />
          ) : (
            <>
              <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-2"
                aria-label={t('instructorCourseDaysTitle')}
              >
                {courseDays.map((courseDay) => (
                  <CourseDayButton
                    key={courseDay.courseDayId}
                    courseDay={courseDay}
                    selected={courseDay.courseDayId === selectedCourseDay?.courseDayId}
                    onSelect={() => setSelectedCourseDayId(courseDay.courseDayId)}
                    t={t}
                  />
                ))}
              </div>
              {selectedCourseDay ? (
                <CourseDayDetail
                  courseId={selectedAssignment.courseId}
                  courseDay={selectedCourseDay}
                  getMutationState={attendanceMutation.getState}
                  onRecord={attendanceMutation.record}
                  onRetry={attendanceMutation.retry}
                  onRetryRefresh={attendanceMutation.retryRefresh}
                  t={t}
                />
              ) : (
                <StatePanel
                  icon={<Calendar className="w-5 h-5 text-[var(--ink-dim)]" />}
                  message={t('instructorCourseDaysEmpty')}
                />
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

const CourseDayButton: React.FC<{
  courseDay: InstructorCourseDayViewModel;
  selected: boolean;
  onSelect: () => void;
  t: (key: TranslationKey) => string;
}> = ({ courseDay, selected, onSelect, t }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    className={`text-left rounded-xs border px-3 py-3 space-y-2 transition-colors ${
      selected
        ? 'border-violet-300 dark:border-violet-700 bg-violet-50/70 dark:bg-violet-950/30'
        : 'border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-serif font-bold text-[var(--ink)]">
          {t('instructorCourseDay')} {courseDay.dayOrder}
        </p>
        <p className="text-[10px] font-mono text-[var(--ink-dim)]">{courseDay.title}</p>
      </div>
      <span className="text-[8px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        {t('instructorCourseDayAssigned')}
      </span>
    </div>
    <p className="text-[10px] font-mono text-[var(--ink-dim)] flex flex-wrap gap-x-3 gap-y-1">
      <span>{formatInstructorCourseDayDate(courseDay)}</span>
      <span>{formatInstructorCourseDayTimeRange(courseDay)}</span>
      <span>
        {t('instructorCourseRosterCount')}: {courseDay.rosterCount}
      </span>
    </p>
    <AttendanceSummary courseDay={courseDay} t={t} />
  </button>
);

const AttendanceSummary: React.FC<{
  courseDay: InstructorCourseDayViewModel;
  t: (key: TranslationKey) => string;
}> = ({ courseDay, t }) => (
  <p className="text-[9px] font-mono text-[var(--ink-dim)] flex flex-wrap gap-x-3 gap-y-1">
    <span>
      {t('instructorAttendancePresent')}: {courseDay.attendanceSummary.present}
    </span>
    <span>
      {t('instructorAttendanceAbsent')}: {courseDay.attendanceSummary.absent}
    </span>
    <span>
      {t('instructorAttendanceMissing')}: {courseDay.attendanceSummary.missing}
    </span>
  </p>
);

const CourseDayDetail: React.FC<{
  courseId: string;
  courseDay: InstructorCourseDayViewModel;
  getMutationState: (input: {
    readonly enrollmentId: string;
    readonly courseDayId: string;
  }) => InstructorCourseAttendanceMutationState | undefined;
  onRecord: (input: InstructorCourseAttendanceActionInput) => Promise<void>;
  onRetry: (input: {
    readonly enrollmentId: string;
    readonly courseDayId: string;
  }) => Promise<void>;
  onRetryRefresh: (input: {
    readonly enrollmentId: string;
    readonly courseDayId: string;
  }) => Promise<void>;
  t: (key: TranslationKey) => string;
}> = ({ courseId, courseDay, getMutationState, onRecord, onRetry, onRetryRefresh, t }) => (
  <section className="border-t border-slate-200/80 dark:border-slate-800/80 pt-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h6 className="text-sm font-serif font-bold text-[var(--ink)]">
          {t('instructorCourseDay')} {courseDay.dayOrder} ·{' '}
          {formatInstructorCourseDayDate(courseDay)}
        </h6>
        <p className="text-[10px] font-mono text-[var(--ink-dim)] flex items-center gap-1.5 mt-1">
          <Clock3 className="w-3.5 h-3.5" />
          {formatInstructorCourseDayTimeRange(courseDay)} · {courseDay.timeZone}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          {courseDay.canRecordAttendance
            ? t('instructorAttendanceWindowOpen')
            : t('instructorAttendanceEditingUnavailable')}
        </p>
      </div>
    </div>

    {courseDay.participants.length === 0 ? (
      <StatePanel
        icon={<Users className="w-5 h-5 text-[var(--ink-dim)]" />}
        message={t('instructorCourseRosterEmpty')}
      />
    ) : (
      <div className="space-y-2" aria-label={t('instructorCourseRosterTitle')}>
        {courseDay.participants.map((participant) => (
          <AttendanceRow
            key={participant.enrollmentId}
            courseId={courseId}
            courseDayId={courseDay.courseDayId}
            participant={participant}
            mutationState={getMutationState({
              enrollmentId: participant.enrollmentId,
              courseDayId: courseDay.courseDayId,
            })}
            onRecord={onRecord}
            onRetry={onRetry}
            onRetryRefresh={onRetryRefresh}
            t={t}
          />
        ))}
      </div>
    )}
  </section>
);

const AttendanceRow: React.FC<{
  courseId: string;
  courseDayId: string;
  participant: InstructorCourseDayParticipantViewModel;
  mutationState?: InstructorCourseAttendanceMutationState;
  onRecord: (input: InstructorCourseAttendanceActionInput) => Promise<void>;
  onRetry: (input: {
    readonly enrollmentId: string;
    readonly courseDayId: string;
  }) => Promise<void>;
  onRetryRefresh: (input: {
    readonly enrollmentId: string;
    readonly courseDayId: string;
  }) => Promise<void>;
  t: (key: TranslationKey) => string;
}> = ({
  courseId,
  courseDayId,
  participant,
  mutationState,
  onRecord,
  onRetry,
  onRetryRefresh,
  t,
}) => {
  const pending = mutationState?.status === 'pending' || mutationState?.status === 'refreshing';
  const mutationDisabled = pending || Boolean(mutationState?.staleRefreshFailed);
  const record = (attendanceStatus: 'present' | 'absent') => {
    void onRecord({
      courseId,
      enrollmentId: participant.enrollmentId,
      courseDayId,
      attendanceStatus,
      expectedEnrollmentRevision: participant.enrollmentRevision,
      ...(participant.attendanceRevision !== undefined
        ? { expectedAttendanceRevision: participant.attendanceRevision }
        : {}),
    });
  };

  return (
    <div
      className="border border-slate-200/70 dark:border-slate-800/70 rounded-xs px-3 py-3 bg-white/70 dark:bg-slate-900/40 space-y-3"
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-mono text-[var(--ink)] font-medium truncate">
            {participant.displayName}
          </p>
          <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
            {lifecycleStatusLabel(participant.lifecycleStatus, t)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
          {attendanceStateLabel(participant.factualState, t)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AttendanceActionButton
          label={t('instructorAttendancePresent')}
          participantName={participant.displayName}
          active={participant.factualState === 'present'}
          disabled={mutationDisabled || !participant.canRecordAttendance}
          onClick={() => record('present')}
          icon={<Check className="w-3.5 h-3.5" />}
        />
        <AttendanceActionButton
          label={t('instructorAttendanceAbsent')}
          participantName={participant.displayName}
          active={participant.factualState === 'absent'}
          disabled={mutationDisabled || !participant.canRecordAttendance}
          onClick={() => record('absent')}
          icon={<X className="w-3.5 h-3.5" />}
        />
        {pending ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[var(--ink-dim)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t(
              mutationState?.status === 'refreshing'
                ? 'instructorAttendanceRefreshing'
                : 'instructorAttendanceSaving'
            )}
          </span>
        ) : null}
      </div>

      {!participant.canRecordAttendance ? (
        <p className="text-[10px] font-mono text-[var(--ink-dim)]">
          {t('instructorAttendanceUnavailableReason')}
        </p>
      ) : null}

      {mutationState?.status === 'error' && mutationState.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-l-2 border-rose-400 pl-2 text-[10px] font-mono text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{mutationState.error.message}</span>
          {mutationState.staleRefreshFailed ? (
            <span>{t('instructorAttendanceStaleRefreshFailed')}</span>
          ) : mutationState.error.code === 'stale_version' ? (
            <span>{t('instructorAttendanceStaleRefreshed')}</span>
          ) : null}
          {mutationState.staleRefreshFailed ? (
            <button
              type="button"
              onClick={() =>
                void onRetryRefresh({ enrollmentId: participant.enrollmentId, courseDayId })
              }
              className="font-bold underline underline-offset-2"
            >
              {t('retry')}
            </button>
          ) : null}
          {mutationState.canRetry ? (
            <button
              type="button"
              onClick={() => void onRetry({ enrollmentId: participant.enrollmentId, courseDayId })}
              className="font-bold underline underline-offset-2"
            >
              {t('retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const AttendanceActionButton: React.FC<{
  label: string;
  participantName: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}> = ({ label, participantName, active, disabled, onClick, icon }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={`${participantName}: ${label}`}
    aria-pressed={active}
    className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[10px] font-mono font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      active
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
        : 'border-slate-300 text-[var(--ink)] hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
    }`}
  >
    {icon}
    {label}
  </button>
);

function attendanceStateLabel(
  state: InstructorCourseDayParticipantViewModel['factualState'],
  t: (key: TranslationKey) => string
): string {
  switch (state) {
    case 'present':
      return t('instructorAttendancePresent');
    case 'absent':
      return t('instructorAttendanceAbsent');
    case 'missing':
      return t('instructorAttendanceMissing');
  }
}

const SectionHeader: React.FC<{
  t: (key: TranslationKey) => string;
  count?: number;
}> = ({ t, count }) => (
  <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight border-b border-slate-200/80 dark:border-slate-800/80 pb-3 flex items-center gap-2">
    <BookOpen className="w-5 h-5 text-accent" />
    <span>
      {t('instructorAssignedCoursesTitle')}
      {typeof count === 'number' ? ` (${count})` : ''}
    </span>
  </h4>
);

const StatePanel: React.FC<{
  icon: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}> = ({ icon, message, action }) => (
  <div className="py-10 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs space-y-3">
    <div className="flex justify-center">{icon}</div>
    <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] px-4">
      {message}
    </p>
    {action ? <div>{action}</div> : null}
  </div>
);
