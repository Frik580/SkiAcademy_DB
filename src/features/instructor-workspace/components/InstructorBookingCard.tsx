import React, { useState } from 'react';
import { Calendar, Check, Clock, MessageSquare, Users, X } from 'lucide-react';
import { formatLessonDifficultyOrUnspecified } from '../../../app/providers/LanguageContext';
import { UserProfile } from '../../../types';
import { DisplayBooking } from './useInstructorWorkspace';
import { StudentLevelControls } from './StudentLevelControls';
import { StudentAssessButton } from './StudentAssessButton';
import { type TranslationKey, type Language } from '../../../app/providers/LanguageContext';
import { StatusBadge } from '../../../ui/StatusBadge';
import { ActionButton } from '../../../ui/ActionButton';
import { ChatUnreadIndicator } from '../../chat/components/chat/ChatUnreadIndicator';
import {
  InstructorCollaborationPanel,
  type useInstructorBookingCollaboration,
} from '../../booking-collaboration';
import { instructorLessonAttendanceSubmissionId } from '../../booking-collaboration/deriveCollaborationIdempotencyKeys';
import {
  emptyParticipantProgressView,
  useParticipantProgressStore,
} from '../../participant-progress';
import { isLessonContextProgressAssessmentEnabled } from '../instructorLessonProgressAssessment';
import type { InstructorLessonFeedbackEditorTarget } from '../instructorLessonFeedbackContracts';
import { InstructorParticipantLessonFeedbackButton } from './InstructorParticipantLessonFeedbackButton';
import { InstructorParticipantLessonFeedbackEditor } from './InstructorParticipantLessonFeedbackEditor';

interface InstructorBookingCardProps {
  booking: DisplayBooking;
  usersList: UserProfile[];
  theme: string;
  language: Language;
  t: (key: TranslationKey) => string;
  onOpenChat: (booking: DisplayBooking) => void;
  hasUnreadChat?: (
    bookingOrId: string | import('../../../domain/chat').CourseChatBooking
  ) => boolean;
  onUpdateStudentLevel: (participantId: string, studentName: string, newLevel: number) => void;
  onOpenEval: (
    participantId: string,
    studentName: string,
    studentLevel: number,
    existingScores?: Record<string, number>,
    existingComments?: Record<string, string>
  ) => void;
  collaboration: ReturnType<typeof useInstructorBookingCollaboration>;
  canCreateProposal: boolean;
  onCreateProposal: () => void;
}

export const InstructorBookingCard: React.FC<InstructorBookingCardProps> = ({
  booking,
  theme,
  language,
  t,
  onOpenChat,
  hasUnreadChat,
  onUpdateStudentLevel,
  onOpenEval,
  collaboration,
  canCreateProposal,
  onCreateProposal,
}) => {
  const b = booking;
  const progressById = useParticipantProgressStore((state) => state.byId);
  const [feedbackEditor, setFeedbackEditor] = useState<InstructorLessonFeedbackEditorTarget | null>(
    null
  );
  const renderParticipant = (participant: DisplayBooking['participants'][number]) => {
    const progress =
      progressById[participant.participantId] ??
      emptyParticipantProgressView(participant.participantId);
    const studentLevel = progress.level || 1;
    const studentName = participant.clientName || 'Student';
    const submitting =
      collaboration.submittingId ===
      instructorLessonAttendanceSubmissionId(b.id, participant.participantId);
    const attendanceLabel =
      participant.attendanceStatus === 'present'
        ? t('instructorAttendancePresent')
        : participant.attendanceStatus === 'absent'
          ? t('instructorAttendanceAbsent')
          : t('instructorAttendanceMissing');
    const canAssessInLesson = isLessonContextProgressAssessmentEnabled(
      participant.attendanceStatus
    );
    const assessDisabledTitle =
      participant.attendanceStatus === undefined
        ? t('instructorAssessMarkAttendanceFirst')
        : undefined;
    const record = (attendanceStatus: 'present' | 'absent') => {
      collaboration.handleRecordLessonAttendance({
        bookingId: b.id,
        participantId: participant.participantId,
        attendanceStatus,
        ...(participant.attendanceRevision !== undefined
          ? { expectedAttendanceRevision: participant.attendanceRevision }
          : {}),
      });
    };

    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/70 dark:border-slate-800/70 rounded-xs hover:border-slate-300 transition-colors duration-200 w-full">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
            {participant.clientAvatar ? (
              <img
                src={participant.clientAvatar}
                alt={studentName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-serif">
                👤
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono text-[var(--ink)] font-medium flex items-center gap-1.5">
              {studentName}
              {b.isGuest && (
                <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-mono rounded-xs border border-amber-500/30">
                  {t('guestBadge') || 'Гость'}
                </span>
              )}
            </div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {t('instructorLessonAttendance')}: {attendanceLabel}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {b.attendanceFollowUp === 'overdue_admin_required' ? (
            <span className="text-[9px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-300">
              {t('instructorAttendanceAdminRequired')}
            </span>
          ) : (
            <>
              <ActionButton
                type="button"
                unstyled
                pending={submitting}
                onClick={() => record('present')}
                disabled={!participant.canRecordPresent}
                aria-label={`${studentName}: ${t('instructorAttendancePresent')}`}
                aria-pressed={participant.attendanceStatus === 'present'}
                className={`h-8 px-2.5 text-[10px] font-mono font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  participant.attendanceStatus === 'present'
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border border-slate-300 text-[var(--ink)] hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                {t('instructorAttendancePresent')}
              </ActionButton>
              <ActionButton
                type="button"
                unstyled
                pending={submitting}
                onClick={() => record('absent')}
                disabled={!participant.canRecordAbsent}
                aria-label={`${studentName}: ${t('instructorAttendanceAbsent')}`}
                aria-pressed={participant.attendanceStatus === 'absent'}
                className={`h-8 px-2.5 text-[10px] font-mono font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  participant.attendanceStatus === 'absent'
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border border-slate-300 text-[var(--ink)] hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <X className="w-3.5 h-3.5" />
                {t('instructorAttendanceAbsent')}
              </ActionButton>
            </>
          )}
          <StudentAssessButton
            t={t}
            disabled={!canAssessInLesson}
            title={assessDisabledTitle}
            ariaLabel={`${studentName}: ${t('instructorAssess')}`}
            onClick={() =>
              onOpenEval(
                participant.participantId,
                studentName,
                studentLevel,
                progress.skillScores,
                progress.skillComments
              )
            }
          />
          <StudentLevelControls
            level={studentLevel}
            theme={theme}
            t={t}
            badgeTitleKey="instructorCurrentLevel"
            selectLabelKey="instructorLevel"
            showSetLevelLabel
            disabled={!canAssessInLesson}
            selectAriaLabel={`${studentName}: ${t('instructorLevel')}`}
            onChange={(newLevel) =>
              onUpdateStudentLevel(participant.participantId, studentName, newLevel)
            }
          />
          <InstructorParticipantLessonFeedbackButton
            t={t}
            studentName={studentName}
            disabled={!canAssessInLesson}
            title={assessDisabledTitle}
            onClick={() =>
              setFeedbackEditor({
                participantId: participant.participantId,
                lessonBookingId: b.id,
                studentName,
              })
            }
          />
        </div>
      </div>
    );
  };

  return (
    <div
      id={`instructor-lesson-${b.id}`}
      className="border p-5 space-y-4 bg-[var(--card-bg)] rounded-xs shadow-xs transition-colors duration-300 border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700"
    >
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink)] font-bold">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              {b.date}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink)] font-bold">
              <Clock className="w-3.5 h-3.5 text-accent" />
              {b.time} ({b.durationHours}h)
            </div>
            <StatusBadge status={b.status} size="xs" />
            {b.attendanceFollowUp === 'overdue_admin_required' ? (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xs">
                {t('instructorAttendanceOverdueBadge')}
                {b.missingAttendanceCount > 1
                  ? ` · ${b.missingAttendanceCount} ${t('instructorAttendanceMissingParticipants')}`
                  : ''}
                {` · ${t('instructorAttendanceAdminRequired')}`}
              </span>
            ) : b.attendanceFollowUp === 'missing_in_window' ? (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-slate-500/10 text-[var(--ink-dim)] border border-slate-400/30 rounded-xs">
                {t('instructorAttendanceNotRecordedBadge')}
                {b.missingAttendanceCount > 1
                  ? ` · ${b.missingAttendanceCount} ${t('instructorAttendanceMissingParticipants')}`
                  : ''}
              </span>
            ) : null}
          </div>

          <div className="p-3.5 border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 rounded-xs w-full space-y-2.5">
            <h5 className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] flex items-center gap-1.5 font-bold">
              <Users className="w-3.5 h-3.5 text-accent" />
              {t('instructorLessonClient')}
            </h5>
            <div className="flex flex-wrap gap-2">
              {b.participants.map((participant) => (
                <React.Fragment key={participant.participantId}>
                  {renderParticipant(participant)}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-[var(--ink-dim)] border-t border-slate-200/60 dark:border-slate-800/60 pt-3">
            <div>
              <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">
                {t('instructorDifficulty')}
              </span>
              <span className="text-[var(--ink)] font-bold">
                {formatLessonDifficultyOrUnspecified(
                  b.difficulty,
                  language,
                  t('difficultyUnspecified'),
                  'compact'
                )}
              </span>
            </div>
            <div>
              <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">
                {t('instructorStudentNotes')}
              </span>
              <span className="text-[var(--ink)] italic leading-relaxed block">
                {b.notes || t('instructorNoNotes')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full md:w-56 justify-end shrink-0 self-stretch">
          <button
            onClick={() => onOpenChat(b)}
            className="w-full py-2.5 px-4 badge-accent-outline text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs"
          >
            <MessageSquare className="w-4 h-4 text-accent" />
            {t('instructorChatStudent')}
            <ChatUnreadIndicator show={hasUnreadChat?.(b) ?? false} />
          </button>
        </div>
      </div>

      {feedbackEditor ? (
        <InstructorParticipantLessonFeedbackEditor
          key={`${feedbackEditor.participantId}:${feedbackEditor.lessonBookingId}`}
          participantId={feedbackEditor.participantId}
          lessonBookingId={feedbackEditor.lessonBookingId}
          studentName={feedbackEditor.studentName}
          t={t}
          onClose={() => setFeedbackEditor(null)}
        />
      ) : null}

      {b.participantIds.length > 0 && (
        <InstructorCollaborationPanel
          proposals={collaboration.proposals}
          changeRequests={collaboration.changeRequests}
          bookingId={b.id}
          participantIds={b.participantIds}
          onCreateProposal={onCreateProposal}
          canCreateProposal={canCreateProposal}
          onWithdrawProposal={collaboration.handleWithdrawProposal}
          onCreateChangeRequest={
            b.authorizedActions.canCreateChangeRequest
              ? (reason: string) =>
                  collaboration.handleCreateChangeRequest({
                    bookingId: b.id,
                    reason,
                    expectedRevision: b.revision,
                  })
              : undefined
          }
          onWithdrawChangeRequest={collaboration.handleWithdrawChangeRequest}
          submittingId={collaboration.submittingId}
        />
      )}
    </div>
  );
};
