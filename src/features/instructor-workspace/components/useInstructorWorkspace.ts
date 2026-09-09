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
  updateStudentLevelService,
  updateStudentSkillsService,
} from '../../profile/profileService';
import type { InstructorLessonBookingItem } from '../../booking-collaboration/bookingCollaborationContracts';

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
    studentUid: '',
    studentName: '',
    studentLevel: 1,
    existingScores: {} as Record<string, number>,
    existingComments: {} as Record<string, string>,
  });

  const linkedInstructor = useMemo(() => {
    return instructors.find((ins) => ins.id === userProfile.instructorId);
  }, [instructors, userProfile.instructorId]);

  const instructorBookings = useMemo<DisplayBooking[]>(() => {
    if (!userProfile.instructorId) return [];

    return lessonBookings
      .filter(
        (booking) =>
          booking.instructorId === userProfile.instructorId && booking.status !== 'cancelled'
      )
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
        };
      });
  }, [lessonBookings, userProfile.instructorId, usersList]);

  const { hasUnreadChat, markBookingChatRead } = useBookingChatUnread(
    userProfile.uid,
    instructorBookings
  );

  const stats = useMemo(() => {
    const total = instructorBookings.length;
    const pending = instructorBookings.filter(
      (b) => b.status === 'pending' || b.status === 'pending_cancellation'
    ).length;
    const confirmed = instructorBookings.filter((b) => b.status === 'confirmed').length;
    const completed = instructorBookings.filter((b) => b.status === 'completed').length;
    const cancelled = instructorBookings.filter((b) => b.status === 'cancelled').length;
    const revenue: number | undefined = undefined;
    return { total, pending, confirmed, completed, cancelled, revenue };
  }, [instructorBookings]);

  const displayedBookings = useMemo(() => {
    return instructorBookings
      .filter((b) => isInstructorBookingVisibleForStatusFilter(b, statusFilter))
      .sort(compareInstructorLessonDisplayOrder);
  }, [instructorBookings, statusFilter]);

  const instructorReviews = useMemo(() => {
    if (!userProfile.instructorId) return [];
    return reviews
      .filter((r) => r.instructorId === userProfile.instructorId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reviews, userProfile.instructorId]);

  const myStudents = useMemo(() => {
    const map = new Map<
      string,
      { uid: string; name: string; avatar?: string; lessonsCount: number }
    >();

    instructorBookings.forEach((booking) => {
      booking.participants.forEach((participant) => {
        if (participant.userId) {
          const existing = map.get(participant.userId) || {
            uid: participant.userId,
            name: participant.clientName || 'Student',
            avatar: participant.clientAvatar,
            lessonsCount: 0,
          };
          existing.lessonsCount += 1;
          map.set(participant.userId, existing);
        }
      });
    });

    return Array.from(map.values());
  }, [instructorBookings]);

  const handleSaveStudentScores = async (
    studentUid: string,
    updatedScores: Record<string, number>,
    calculatedLevel: number,
    updatedComments: Record<string, string> = {}
  ) => {
    try {
      const student = usersList.find((item) => item.uid === studentUid);
      const oldLevel = student?.level ?? 1;
      const oldScores = student?.skillScores ?? {};
      const oldComments = student?.skillComments ?? {};
      const oldTotal = Object.values(oldScores).reduce((sum, value) => sum + value, 0);
      const newTotal = Object.values(updatedScores).reduce((sum, value) => sum + value, 0);
      const pointsDelta = newTotal - oldTotal;

      const mergedComments = { ...(student?.skillComments ?? {}), ...updatedComments };
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

      await updateStudentSkillsService(studentUid, updatedScores, mergedComments, calculatedLevel);

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

      if (calculatedLevel > oldLevel) {
        await logActivityForUser(
          studentUid,
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
          activityLogId.levelUp(studentUid, calculatedLevel)
        );
      } else if (skillDeltas.length > 0 || commentsChanged) {
        await logActivityForUser(studentUid, userProfile.uid, 'skill_scores_updated', {
          pointsDelta,
          newLevel: calculatedLevel,
          skillDeltas,
          instructorId: userProfile.instructorId,
          commentedSkillIds,
        });
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
    studentUid: string,
    studentName: string,
    newLevel: number
  ) => {
    try {
      const student = usersList.find((item) => item.uid === studentUid);
      const oldLevel = student?.level ?? 1;

      await updateStudentLevelService(studentUid, newLevel);

      if (newLevel > oldLevel) {
        await logActivityForUser(
          studentUid,
          userProfile.uid,
          'level_up',
          { oldLevel, newLevel },
          activityLogId.levelUp(studentUid, newLevel)
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
    studentUid: string,
    studentName: string,
    studentLevel: number,
    existingScores?: Record<string, number>,
    existingComments?: Record<string, string>
  ) => {
    setEvalModalState({
      isOpen: true,
      studentUid,
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
    instructorBookings,
    instructorReviews,
    myStudents,
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
