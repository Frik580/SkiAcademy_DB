import React from 'react';
import { Calendar } from 'lucide-react';
import { useInstructorWorkspace } from './useInstructorWorkspace';
import { InstructorBookingCard } from './InstructorBookingCard';
import type { useInstructorBookingCollaboration } from '../../booking-collaboration/useInstructorBookingCollaboration';
import { useBookingCollaborationStore } from '../../booking-collaboration/bookingCollaborationStore';
import { selectInstructorProposalPartyCandidates } from '../../booking-collaboration/selectInstructorProposalPartyCandidates';
import type { InstructorProposalPartyBookingView } from '../../booking-collaboration/selectInstructorProposalPartyCandidates';
import type { InstructorProposalPartyCandidate } from '../../booking-collaboration/bookingCollaborationContracts';

interface InstructorBookingListProps {
  workspace: ReturnType<typeof useInstructorWorkspace>;
  collaboration: ReturnType<typeof useInstructorBookingCollaboration>;
}

function instructorProposalBookings(
  workspace: ReturnType<typeof useInstructorWorkspace>
): InstructorProposalPartyBookingView[] {
  return workspace.instructorBookings.map((booking) => ({
    instructorId: booking.instructorId,
    participantIds: booking.participantIds,
    lifecycleStatus: booking.status,
    participants: booking.participants.map((participant) => ({
      participantId: participant.participantId,
      label: participant.clientName,
      ...(participant.userId ? { accountId: participant.userId } : {}),
    })),
  }));
}

function relationshipStatusByParticipantId(
  participantAccess: ReturnType<typeof useBookingCollaborationStore.getState>['participantAccess'],
  instructorId: string
): Map<string, 'active' | 'revoked' | 'expired' | undefined> {
  return new Map(
    [...participantAccess.values()]
      .filter((item) => item.instructorId === instructorId)
      .map((item) => [item.participantId, item.relationshipStatus])
  );
}

function proposalPartyCandidatesForBooking(
  workspace: ReturnType<typeof useInstructorWorkspace>,
  booking: ReturnType<typeof useInstructorWorkspace>['displayedBookings'][number],
  participantAccess: ReturnType<typeof useBookingCollaborationStore.getState>['participantAccess']
): readonly InstructorProposalPartyCandidate[] {
  return selectInstructorProposalPartyCandidates({
    instructorId: booking.instructorId,
    seedParticipantIds: booking.participantIds,
    seedAccountId: booking.userId,
    bookings: instructorProposalBookings(workspace),
    relationshipStatusByParticipantId: relationshipStatusByParticipantId(
      participantAccess,
      booking.instructorId
    ),
  });
}

export const InstructorBookingList: React.FC<InstructorBookingListProps> = ({
  workspace,
  collaboration,
}) => {
  const {
    t,
    language,
    theme,
    displayedBookings,
    overdueBookings,
    missingInWindowBookings,
    statusFilter,
    setStatusFilter,
    setSelectedChatBooking,
    hasUnreadChat,
    markBookingChatRead,
    handleUpdateStudentLevel,
    openEvalModal,
    usersList,
    instructors,
  } = workspace;
  const participantAccess = useBookingCollaborationStore((state) => state.participantAccess);

  const filters: Array<'all' | 'pending' | 'confirmed' | 'completed'> = [
    'all',
    'pending',
    'confirmed',
    'completed',
  ];

  return (
    <div className="space-y-4">
      {missingInWindowBookings.length > 0 || overdueBookings.length > 0 ? (
        <div className="space-y-4">
          {missingInWindowBookings.length > 0 ? (
            <div className="space-y-3 border border-slate-300/50 bg-slate-50/60 p-4 dark:border-slate-700/40 dark:bg-slate-900/20 rounded-xs">
              <div>
                <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight">
                  {t('instructorNeedsAttention')}
                </h4>
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-1">
                  {t('instructorAttendanceNotRecordedLessons')} — {missingInWindowBookings.length}
                </p>
              </div>
              <div className="space-y-3">
                {missingInWindowBookings.map((booking) => (
                  <div
                    key={`missing-${booking.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 border border-slate-300/40 bg-[var(--card-bg)] px-3 py-2 rounded-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-[var(--ink)]">
                        {booking.date} {booking.time}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--ink-dim)] truncate">
                        {booking.participants.map((participant) => participant.clientName).join(', ')}
                      </p>
                      {booking.missingAttendanceCount > 1 ? (
                        <p className="text-[10px] font-mono text-[var(--ink-dim)]">
                          {booking.missingAttendanceCount}{' '}
                          {t('instructorAttendanceMissingParticipants')}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider border border-accent/40 text-accent rounded-xs"
                      onClick={() =>
                        document.getElementById(`instructor-lesson-${booking.id}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }
                    >
                      {t('instructorGoToAttendance')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {overdueBookings.length > 0 ? (
            <div className="space-y-3 border border-amber-400/40 bg-amber-50/50 p-4 dark:border-amber-700/40 dark:bg-amber-950/20 rounded-xs">
              <div>
                <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight">
                  {t('instructorNeedsAttention')}
                </h4>
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-300 mt-1">
                  {t('instructorAttendanceOverdueLessons')} — {overdueBookings.length}
                </p>
                <p className="text-[10px] font-mono text-amber-800 dark:text-amber-300 mt-1">
                  {t('instructorAttendanceAdminRequired')}
                </p>
              </div>
              <div className="space-y-3">
                {overdueBookings.map((booking) => (
                  <div
                    key={`overdue-${booking.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 border border-amber-400/30 bg-[var(--card-bg)] px-3 py-2 rounded-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-[var(--ink)]">
                        {booking.date} {booking.time}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--ink-dim)] truncate">
                        {booking.participants.map((participant) => participant.clientName).join(', ')}
                      </p>
                      <p className="text-[10px] font-mono text-amber-800 dark:text-amber-300">
                        {t('instructorAttendanceOverdueBadge')}
                        {booking.missingAttendanceCount > 1
                          ? ` · ${booking.missingAttendanceCount} ${t('instructorAttendanceMissingParticipants')}`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider border border-slate-400/40 text-[var(--ink-dim)] rounded-xs"
                      title={t('instructorAttendanceAdminRequired')}
                      onClick={() =>
                        document.getElementById(`instructor-lesson-${booking.id}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }
                    >
                      {t('instructorViewLessonReadOnly')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
        <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight">
          {t('instructorActiveRoster')} ({displayedBookings.length})
        </h4>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {filters.map((filter) => {
            const isActive = statusFilter === filter;
            const label =
              filter === 'all'
                ? t('allFilter')
                : filter === 'pending'
                  ? t('pending')
                  : filter === 'confirmed'
                    ? t('confirmed')
                    : t('completed');

            return (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider rounded-xs transition cursor-pointer ${
                  isActive
                    ? 'bg-[var(--ink)] text-[var(--bg)] font-bold shadow-xs'
                    : 'border border-slate-200/80 dark:border-slate-800/80 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {displayedBookings.length === 0 ? (
        <div className="py-12 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs">
          <Calendar className="w-8 h-8 mx-auto opacity-20 mb-2 text-[var(--ink-dim)]" />
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)]">
            {t('noLessons')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedBookings.map((b) => {
            const candidates = proposalPartyCandidatesForBooking(workspace, b, participantAccess);
            const hourlyRateKzt = instructors.find(
              (instructor) => instructor.id === b.instructorId
            )?.pricePerHourKZT;
            return (
              <InstructorBookingCard
                key={b.id}
                booking={b}
                usersList={usersList}
                theme={theme}
                language={language}
                t={t}
                hasUnreadChat={hasUnreadChat}
                onOpenChat={(booking) => {
                  markBookingChatRead(booking);
                  setSelectedChatBooking(booking);
                }}
                onUpdateStudentLevel={handleUpdateStudentLevel}
                onOpenEval={openEvalModal}
                collaboration={collaboration}
                canCreateProposal={candidates.some((candidate) => candidate.selectable)}
                onCreateProposal={() => {
                  const selectedParticipantIds = b.participantIds.filter((participantId) =>
                    candidates.some(
                      (candidate) =>
                        candidate.participantId === participantId && candidate.selectable
                    )
                  );
                  collaboration.setCreateProposalParty({
                    participants: candidates,
                    selectedParticipantIds:
                      selectedParticipantIds.length > 0
                        ? selectedParticipantIds
                        : candidates
                            .filter((candidate) => candidate.selectable)
                            .map((candidate) => candidate.participantId),
                    ...(hourlyRateKzt !== undefined ? { hourlyRateKzt } : {}),
                  });
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
