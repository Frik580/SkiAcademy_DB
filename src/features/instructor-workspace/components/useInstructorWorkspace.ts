import { useState, useMemo, useEffect } from 'react';
import {
  UserProfile,
  Instructor,
  Review,
  Course,
  LessonDifficulty,
  BookingStatus,
} from '../../../types';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useNotifications } from '../../../features/notifications';
import { useTheme } from '../../../hooks/useTheme';
import { logger } from '../../../shared';
import { SkillConfig, DEFAULT_SKILL_ITEMS } from '../../../domain/achievements';
import { useBookingChatUnread } from '../../../features/student-cabinet/useBookingChatUnread';
import { activityLogId, logActivityForUser } from '../../../domain/activity';
import {
  emptyParticipantProgressView,
  resolveSelfParticipantIdFromAccount,
  updateCanonicalParticipantProgress,
  useParticipantProgressStore,
  type ParticipantProgressView,
} from '../../participant-progress';
import type { InstructorLessonBookingItem } from '../../booking-collaboration/bookingCollaborationContracts';
import {
  computeInstructorLessonMetrics,
  countInstructorRosterLessons,
} from '../instructorLessonMetrics';
import {
  instructorLessonAttendanceFollowUp,
  type InstructorLessonAttendanceFollowUp,
} from '../instructorAttendanceOverdue';

export interface InstructorWorkspaceInput {
  userProfile: UserProfile;
  instructors: Instructor[];
  lessonBookings: readonly InstructorLessonBookingItem[];
  reviews: Review[];
  courses: Course[];
  usersList: UserProfile[];
  skillConfig?: SkillConfig;
}

export interface EnrichedBooking {
  id: string;
  revision: number;
  instructorId: string;
  instructorName: string;
  date: string;
  time: string;
  durationHours: number;
  startsAtEpochMs: number;
  endsAtEpochMs: number;
  status: BookingStatus;
  difficulty?: LessonDifficulty;
  notes: string;
  participantId: string;
  participantIds: readonly string[];
  participants: readonly {
    participantId: string;
    userId?: string;
    clientName: string;
    clientAvatar?: string;
    attendanceStatus?: 'present' | 'absent';
    attendanceRevision?: number;
    canRecordPresent: boolean;
    canRecordAbsent: boolean;
  }[];
  userId?: string;
  clientName: string;
  clientAvatar?: string;
  isGuest: boolean;
  authorizedActions: InstructorLessonBookingItem['authorizedActions'];
  attendanceFollowUp: InstructorLessonAttendanceFollowUp;
  attendanceOverdue: boolean;
  missingAttendanceCount: number;
}

export type DisplayBooking = EnrichedBooking;

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed';

export function hasOutstandingInstructorLessonAttendance(
  booking: Pick<EnrichedBooking, 'participants'>
): boolean {
  return booking.participants.some(
    (participant) => participant.canRecordPresent || participant.canRecordAbsent
  );
}

export function isInstructorBookingVisibleForStatusFilter(
  booking: Pick<EnrichedBooking, 'status' | 'participants'>,
  statusFilter: StatusFilter
): boolean {
  if (statusFilter === 'all' || booking.status === statusFilter) {
    return true;
  }
  // After one family/group present, Booking may become completed. Keep it on the
  // confirmed filter while any service participant still has recordable Attendance
  // so the Instructor can finish remaining facts without a fake lifecycle.
  return statusFilter === 'confirmed' && hasOutstandingInstructorLessonAttendance(booking);
}

type InstructorLessonScheduleSortable = Pick<
  EnrichedBooking,
  'startsAtEpochMs' | 'endsAtEpochMs' | 'id'
>;

type InstructorLessonScheduleRank = 0 | 1 | 2;

export function getInstructorLessonScheduleRank(
  booking: Pick<EnrichedBooking, 'startsAtEpochMs' | 'endsAtEpochMs'>,
  nowMs: number = Date.now()
): InstructorLessonScheduleRank {
  if (nowMs >= booking.startsAtEpochMs && nowMs < booking.endsAtEpochMs) {
    return 0;
  }
  if (nowMs < booking.startsAtEpochMs) {
    return 1;
  }
  return 2;
}

export function compareInstructorLessonDisplayOrder(
  left: InstructorLessonScheduleSortable,
  right: InstructorLessonScheduleSortable,
  nowMs: number = Date.now()
): number {
  const leftRank = getInstructorLessonScheduleRank(left, nowMs);
  const rightRank = getInstructorLessonScheduleRank(right, nowMs);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const startCompare =
    leftRank === 2
      ? right.startsAtEpochMs - left.startsAtEpochMs
      : left.startsAtEpochMs - right.startsAtEpochMs;
  if (startCompare !== 0) {
    return startCompare;
  }

  return left.id.localeCompare(right.id);
}

export const useInstructorWorkspace = ({
  userProfile,
  instructors,
  lessonBookings,
  reviews,
  courses,
  usersList,
  skillConfig,
}: InstructorWorkspaceInput) => {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const { addNotification } = useNotifications();
  const [selectedChatBooking, setSelectedChatBooking] = useState<DisplayBooking | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [evalModalState, setEvalModalState] = useState({
    isOpen: false,
    participantId: '',
    studentName: '',
    studentLevel: 1,
    existingScores: {} as Record<string, number>,
    existingComments: {} as Record<string, string>,
  });
  const progressById = useParticipantProgressStore((state) => state.byId);

  const linkedInstructor = useMemo(() => {
    return instructors.find((ins) => ins.id === userProfile.instructorId);
  }, [instructors, userProfile.instructorId]);

  const mappedInstructorBookings = useMemo<DisplayBooking[]>(() => {
    if (!userProfile.instructorId) return [];

    return lessonBookings
      .filter((booking) => booking.instructorId === userProfile.instructorId)
      .map((booking): EnrichedBooking => {
        const attendanceByParticipantId = new Map(
          (booking.attendance ?? []).map((row) => [row.participantId, row])
        );
        const participants = booking.participants.map((participant) => {
          const client = participant.selfAccountId
            ? usersList.find((user) => user.uid === participant.selfAccountId)
            : undefined;
          const attendance = attendanceByParticipantId.get(participant.participantId);
          return {
            participantId: participant.participantId,
            ...(participant.selfAccountId ? { userId: participant.selfAccountId } : {}),
            clientName: client?.displayName || participant.displayName,
            clientAvatar: client?.avatarUrl || '',
            ...(attendance?.attendanceStatus
              ? { attendanceStatus: attendance.attendanceStatus }
              : {}),
            ...(attendance?.revision !== undefined
              ? { attendanceRevision: attendance.revision }
              : {}),
            canRecordPresent: attendance?.authorizedActions.canRecordPresent ?? false,
            canRecordAbsent: attendance?.authorizedActions.canRecordAbsent ?? false,
          };
        });
        const primaryParticipant = participants[0]!;
        return {
          id: booking.bookingId,
          revision: booking.revision,
          instructorId: booking.instructorId,
          instructorName: booking.instructorName,
          date: booking.date,
          time: booking.time,
          durationHours: booking.durationHours,
          startsAtEpochMs: booking.startsAtEpochMs,
          endsAtEpochMs: booking.endsAtEpochMs,
          status: booking.status,
          ...(booking.difficulty ? { difficulty: booking.difficulty } : {}),
          notes: booking.notes ?? '',
          participantId: primaryParticipant.participantId,
          participantIds: booking.participantIds,
          participants,
          ...(primaryParticipant.userId ? { userId: primaryParticipant.userId } : {}),
          clientName: primaryParticipant.clientName,
          clientAvatar: primaryParticipant.clientAvatar,
          isGuest: booking.bookingOrigin === 'guest',
          authorizedActions: booking.authorizedActions,
          ...(() => {
            const attendanceFollowUp = instructorLessonAttendanceFollowUp({
              status: booking.status,
              startsAtEpochMs: booking.startsAtEpochMs,
              endsAtEpochMs: booking.endsAtEpochMs,
              attendance: booking.attendance,
            });
            return {
              attendanceFollowUp,
              attendanceOverdue: attendanceFollowUp === 'overdue_admin_required',
              missingAttendanceCount: (booking.attendance ?? []).filter(
                (row) => row.attendanceStatus !== 'present' && row.attendanceStatus !== 'absent'
              ).length,
            };
          })(),
        };
      });
  }, [lessonBookings, userProfile.instructorId, usersList]);

  const instructorBookings = useMemo(
    () => mappedInstructorBookings.filter((booking) => booking.status !== 'cancelled'),
    [mappedInstructorBookings]
  );

  const { hasUnreadChat, markBookingChatRead } = useBookingChatUnread(
    userProfile.uid,
    instructorBookings
  );

  const stats = useMemo(
    () =>
      computeInstructorLessonMetrics(
        mappedInstructorBookings.map((booking) => ({
          id: booking.id,
          revision: booking.revision,
          status: booking.status,
        }))
      ),
    [mappedInstructorBookings]
  );

  const displayedBookings = useMemo(() => {
    return instructorBookings
      .filter((b) => isInstructorBookingVisibleForStatusFilter(b, statusFilter))
      .sort(compareInstructorLessonDisplayOrder);
  }, [instructorBookings, statusFilter]);

  const missingInWindowBookings = useMemo(
    () =>
      instructorBookings
        .filter((booking) => booking.attendanceFollowUp === 'missing_in_window')
        .sort(compareInstructorLessonDisplayOrder),
    [instructorBookings]
  );

  const overdueBookings = useMemo(
    () =>
      instructorBookings
        .filter((booking) => booking.attendanceFollowUp === 'overdue_admin_required')
        .sort(compareInstructorLessonDisplayOrder),
    [instructorBookings]
  );

  const instructorReviews = useMemo(() => {
    if (!userProfile.instructorId) return [];
    return reviews
      .filter((r) => r.instructorId === userProfile.instructorId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reviews, userProfile.instructorId]);

  const myStudents = useMemo(() => {
    const map = new Map<
      string,
      {
        participantId: string;
        uid?: string;
        name: string;
        avatar?: string;
        lessonsCount: number;
      }
    >();

    const rosterCounts = countInstructorRosterLessons(instructorBookings);
    instructorBookings.forEach((booking) => {
      booking.participants.forEach((participant) => {
        const existing = map.get(participant.participantId) || {
          participantId: participant.participantId,
          ...(participant.userId ? { uid: participant.userId } : {}),
          name: participant.clientName || 'Student',
          avatar: participant.clientAvatar,
          lessonsCount: 0,
        };
        existing.lessonsCount = rosterCounts.get(participant.participantId) ?? 0;
        map.set(participant.participantId, existing);
      });
    });

    return Array.from(map.values());
  }, [instructorBookings]);

  const currentProgress = (participantId: string): ParticipantProgressView =>
    progressById[participantId] ?? emptyParticipantProgressView(participantId);

  const activityLogAccountIdFor = (participantId: string, linkedUserId?: string) => {
    if (!linkedUserId) return undefined;
    return resolveSelfParticipantIdFromAccount(linkedUserId) === participantId
      ? linkedUserId
      : undefined;
  };

  const handleSaveStudentScores = async (
    participantId: string,
    updatedScores: Record<string, number>,
    calculatedLevel: number,
    updatedComments: Record<string, string> = {}
  ) => {
    try {
      const previous = currentProgress(participantId);
      const oldLevel = previous.level || 1;
      const oldScores = previous.skillScores;
      const oldComments = previous.skillComments;
      const oldTotal = Object.values(oldScores).reduce((sum, value) => sum + value, 0);
      const newTotal = Object.values(updatedScores).reduce((sum, value) => sum + value, 0);
      const pointsDelta = newTotal - oldTotal;

      const mergedComments = { ...oldComments, ...updatedComments };
      for (const itemId of Object.keys(mergedComments)) {
        if (!(itemId in updatedScores) || updatedScores[itemId] === 0) {
          delete mergedComments[itemId];
        }
      }
      for (const itemId of Object.keys(updatedScores)) {
        if (updatedScores[itemId] === 0) {
          delete mergedComments[itemId];
        }
      }

      await updateCanonicalParticipantProgress({
        accountId: userProfile.uid,
        participantId,
        level: calculatedLevel,
        skillScores: updatedScores,
        skillComments: mergedComments,
        expectedRevision: previous.revision,
      });

      const skillItems = skillConfig?.items || DEFAULT_SKILL_ITEMS;

      const skillDeltas = Object.entries(updatedScores)
        .map(([itemId, newScore]) => {
          const oldScore = oldScores[itemId] ?? 0;
          const delta = newScore - oldScore;
          if (delta === 0) return null;
          const item = skillItems.find((i) => i.id === itemId);
          return {
            itemId,
            title: item?.title ?? itemId,
            oldScore,
            newScore,
            delta,
            maxPoints: item?.maxPoints ?? 20,
          };
        })
        .filter(Boolean) as Array<{
        itemId: string;
        title: string;
        oldScore: number;
        newScore: number;
        delta: number;
        maxPoints?: number;
      }>;

      const commentedSkillIds = Object.entries(mergedComments)
        .filter(([itemId, comment]) => Boolean(comment?.trim()) && (updatedScores[itemId] ?? 0) > 0)
        .map(([itemId]) => itemId);

      const commentsChanged = Object.keys({ ...oldComments, ...updatedComments }).some(
        (itemId) => (updatedComments[itemId]?.trim() ?? '') !== (oldComments[itemId]?.trim() ?? '')
      );

      const student = myStudents.find((item) => item.participantId === participantId);
      const logAccountId = activityLogAccountIdFor(participantId, student?.uid);
      if (logAccountId) {
        if (calculatedLevel > oldLevel) {
          await logActivityForUser(
            logAccountId,
            userProfile.uid,
            'level_up',
            {
              oldLevel,
              newLevel: calculatedLevel,
              skillDeltas,
              pointsDelta,
              instructorId: userProfile.instructorId,
              commentedSkillIds,
            },
            activityLogId.levelUp(logAccountId, calculatedLevel)
          );
        } else if (skillDeltas.length > 0 || commentsChanged) {
          await logActivityForUser(logAccountId, userProfile.uid, 'skill_scores_updated', {
            pointsDelta,
            newLevel: calculatedLevel,
            skillDeltas,
            instructorId: userProfile.instructorId,
            commentedSkillIds,
          });
        }
      }

      addNotification(
        'success',
        t('instructorRatingsSaved'),
        `${t('instructorRatingsSavedDesc')} ${calculatedLevel}`
      );
    } catch (err) {
      logger.error('Error saving student skill scores:', err);
    }
  };

  const handleUpdateStudentLevel = async (
    participantId: string,
    studentName: string,
    newLevel: number
  ) => {
    try {
      const previous = currentProgress(participantId);
      const oldLevel = previous.level || 1;

      await updateCanonicalParticipantProgress({
        accountId: userProfile.uid,
        participantId,
        level: newLevel,
        skillScores: previous.skillScores,
        skillComments: previous.skillComments,
        expectedRevision: previous.revision,
      });

      const student = myStudents.find((item) => item.participantId === participantId);
      const logAccountId = activityLogAccountIdFor(participantId, student?.uid);
      if (logAccountId && newLevel > oldLevel) {
        await logActivityForUser(
          logAccountId,
          userProfile.uid,
          'level_up',
          { oldLevel, newLevel },
          activityLogId.levelUp(logAccountId, newLevel)
        );
      }

      addNotification(
        'info',
        t('instructorLevelUpdated'),
        `${t('instructorLevelUpdatedPrefix')} ${studentName} ${t('instructorLevelUpdatedTo')} ${newLevel}`
      );
    } catch (err) {
      logger.error('Error updating student level:', err);
    }
  };

  const openEvalModal = (
    participantId: string,
    studentName: string,
    studentLevel: number,
    existingScores?: Record<string, number>,
    existingComments?: Record<string, string>
  ) => {
    setEvalModalState({
      isOpen: true,
      participantId,
      studentName,
      studentLevel,
      existingScores: existingScores || {},
      existingComments: existingComments || {},
    });
  };

  const closeEvalModal = () => {
    setEvalModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const closeChatModal = () => setSelectedChatBooking(null);

  useEffect(() => {
    if (selectedChatBooking) {
      markBookingChatRead(selectedChatBooking);
    }
  }, [selectedChatBooking, markBookingChatRead]);

  return {
    theme,
    t,
    language,
    linkedInstructor,
    stats,
    displayedBookings,
    missingInWindowBookings,
    overdueBookings,
    instructorBookings,
    instructorReviews,
    myStudents,
    progressById,
    selectedChatBooking,
    setSelectedChatBooking,
    closeChatModal,
    statusFilter,
    setStatusFilter,
    evalModalState,
    openEvalModal,
    closeEvalModal,
    handleSaveStudentScores,
    handleUpdateStudentLevel,
    hasUnreadChat,
    markBookingChatRead,
    userProfile,
    instructors,
    courses,
    usersList,
    skillConfig,
  };
};
