import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Calendar, Loader2, RefreshCw, Users } from 'lucide-react';
import type { TranslationKey } from '../../../app/providers/LanguageContext';
import {
  formatInstructorCourseAssignedDaysSummary,
  formatInstructorCourseScheduleSummary,
  selectInstructorCourseViewModel,
  selectActiveInstructorCourseRosterParticipants,
  useInstructorCourseReadSync,
  useInstructorCourseStore,
} from '../../instructor-courses';
import type { CourseEnrollmentLifecycleStatus } from '@ski-academy/shared-domain';

interface InstructorCourseSectionProps {
  readonly accountId: string;
  readonly instructorId: string;
  readonly t: (key: TranslationKey) => string;
}

function lifecycleStatusLabel(
  status: CourseEnrollmentLifecycleStatus,
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
    if (selectedCourseId && !assignedCourses.some((course) => course.courseId === selectedCourseId)) {
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

  const rosterParticipants = useMemo(
    () =>
      selectedCourseViewModel
        ? selectActiveInstructorCourseRosterParticipants(selectedCourseViewModel)
        : [],
    [selectedCourseViewModel]
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
              onClick={() => setSelectedCourseId(assignment.courseId)}
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
        <div className="border border-slate-200/70 dark:border-slate-800/70 bg-[var(--card-bg)] rounded-xs p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
            <h5 className="text-sm font-serif text-[var(--ink)] font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              {t('instructorCourseRosterTitle')}
            </h5>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {selectedAssignment.title}
            </span>
          </div>

          {rosterLoading ? (
            <StatePanel
              icon={<Loader2 className="w-5 h-5 animate-spin text-[var(--ink-dim)]" />}
              message={t('instructorCourseRosterLoading')}
            />
          ) : rosterParticipants.length === 0 ? (
            <StatePanel
              icon={<Users className="w-5 h-5 text-[var(--ink-dim)]" />}
              message={t('instructorCourseRosterEmpty')}
            />
          ) : (
            <div className="space-y-2">
              {rosterParticipants.map((participant) => (
                <div
                  key={participant.enrollmentId}
                  className="flex items-center justify-between gap-3 border border-slate-200/70 dark:border-slate-800/70 rounded-xs px-3 py-2.5 bg-white/70 dark:bg-slate-900/40"
                >
                  <span className="text-xs font-mono text-[var(--ink)] font-medium truncate">
                    {participant.displayName}
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] shrink-0">
                    {lifecycleStatusLabel(participant.lifecycleStatus, t)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

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
    <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] px-4">{message}</p>
    {action ? <div>{action}</div> : null}
  </div>
);
