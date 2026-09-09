import React from 'react';
import { Calendar, Check, Clock, MessageSquare, Users, X } from 'lucide-react';
import { formatLessonDifficultyOrUnspecified } from '../../../app/providers/LanguageContext';
import { UserProfile } from '../../../types';
import { DisplayBooking } from './useInstructorWorkspace';
import { StudentLevelControls } from './StudentLevelControls';
import { StudentAssessButton } from './StudentAssessButton';
import { type TranslationKey, type Language } from '../../../app/providers/LanguageContext';
import { StatusBadge } from '../../../ui/StatusBadge';
import { ChatUnreadIndicator } from '../../chat/components/chat/ChatUnreadIndicator';
import {
  InstructorCollaborationPanel,
  type useInstructorBookingCollaboration,
} from '../../booking-collaboration';
import { instructorLessonAttendanceSubmissionId } from '../../booking-collaboration/deriveCollaborationIdempotencyKeys';

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
  onUpdateStudentLevel: (studentUid: string, studentName: string, newLevel: number) => void;
  onOpenEval: (
    studentUid: string,
    studentName: string,
    studentLevel: number,
    existingScores?: Record<string, number>,
    existingComments?: Record<string, string>
  ) => void;
  collaboration: ReturnType<typeof useInstructorBookingCollaboration>;
}

export const InstructorBookingCard: React.FC<InstructorBookingCardProps> = ({
  booking,
  usersList,
  theme,
  language,
  t,
  onOpenChat,
  hasUnreadChat,
  onUpdateStudentLevel,
  onOpenEval,
  collaboration,
}) => {
  const b = booking;
  const renderParticipant = (participant: DisplayBooking['participants'][number]) => {
    const studentAccountId = participant.userId;
    const studentUser = studentAccountId
      ? usersList.find((u) => u.uid === studentAccountId)
      : undefined;
    const studentLevel = studentUser?.level || 1;
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
          <button
            type="button"
            onClick={() => record('present')}
            disabled={submitting || !participant.canRecordPresent}
            aria-label={`${studentName}: ${t('instructorAttendancePresent')}`}
            aria-pressed={participant.attendanceStatus === 'present'}
            className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[10px] font-mono font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              participant.attendanceStatus === 'present'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-slate-300 text-[var(--ink)] hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            {t('instructorAttendancePresent')}
          </button>
          <button
            type="button"
            onClick={() => record('absent')}
            disabled={submitting || !participant.canRecordAbsent}
            aria-label={`${studentName}: ${t('instructorAttendanceAbsent')}`}
            aria-pressed={participant.attendanceStatus === 'absent'}
            className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[10px] font-mono font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              participant.attendanceStatus === 'absent'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-slate-300 text-[var(--ink)] hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            {t('instructorAttendanceAbsent')}
          </button>
          {studentAccountId && (
            <>
              <StudentAssessButton
                t={t}
                onClick={() =>
                  onOpenEval(
                    studentAccountId,
                    studentName,
                    studentLevel,
                    studentUser?.skillScores || {},
                    studentUser?.skillComments || {}
                  )
                }
              />
              <StudentLevelControls
                studentUid={studentAccountId}
                usersList={usersList}
                theme={theme}
                t={t}
                badgeTitleKey="instructorCurrentLevel"
                selectLabelKey="instructorLevel"
                showSetLevelLabel
                onChange={(newLevel) =>
                  onUpdateStudentLevel(studentAccountId, studentName, newLevel)
                }
              />
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border p-5 space-y-4 bg-[var(--card-bg)] rounded-xs shadow-xs transition-colors duration-300 border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700">
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

      {b.participantId && (
        <InstructorCollaborationPanel
          proposals={collaboration.proposals}
          changeRequests={collaboration.changeRequests}
          bookingId={b.id}
          participantId={b.participantId}
          onCreateProposal={() =>
            collaboration.setCreateProposalParticipant({
              participantId: b.participantId,
              label: b.clientName ?? 'Student',
            })
          }
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
