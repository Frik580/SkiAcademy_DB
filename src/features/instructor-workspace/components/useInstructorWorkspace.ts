import { useState, useMemo, useEffect } from 'react';
import {
  UserProfile,
  Instructor,
  Booking,
  Review,
  Course,
  LessonDifficulty,
} from '../../../types';
import {
  useLanguage,
  translateCourse,
  splitCourseDates,
  parseDurationHours,
} from '../../../app/providers/LanguageContext';
import { useNotifications } from '../../../features/notifications';
import { useTheme } from '../../../hooks/useTheme';
import { logger } from '../../../lib/logger';
import { SkillConfig, DEFAULT_SKILL_ITEMS } from '../../../lib/skillData';
import { LessonRecommendation } from '../../../types';
import { useBookingChatUnread } from '../../../lib/useBookingChatUnread';
import {
  activityLogId,
  buildBookingCompletedMetadata,
  logActivityForUser,
} from '../../../lib/activityLog';
import {
  completeBookingService,
  saveBookingRecommendationsService,
  updateBookingStatusService,
} from '../../bookings/bookingService';
import { updateStudentLevelService, updateStudentSkillsService } from '../../profile/profileService';

export interface InstructorWorkspaceInput {
  userProfile: UserProfile;
  instructors: Instructor[];
  allBookings: Booking[];
  reviews: Review[];
  courses: Course[];
  usersList: UserProfile[];
  skillConfig?: SkillConfig;
}

export interface EnrichedBooking extends Booking {
  clientName?: string;
  clientAvatar?: string;
  isGuest?: boolean;
  guestPhone?: string;
  guestEmail?: string;
}

export interface EnrichedCourseBooking {
  id: string;
  chatId: string;
  courseId: string;
  instructorId: string;
  participantBookingIds: string[];
  isCourse: true;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  status: 'confirmed';
  difficulty: LessonDifficulty;
  notes: string;
  clients: CourseClient[];
  totalPrice?: number;
  userId?: string;
}

export interface CourseClient {
  uid: string;
  name: string;
  avatar?: string;
  phone?: string;
  email?: string;
  isGuest?: boolean;
  bookingId: string;
  recommendations?: LessonRecommendation[];
}

export type DisplayBooking = EnrichedBooking | EnrichedCourseBooking;

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed';

export const useInstructorWorkspace = ({
  userProfile,
  instructors,
  allBookings,
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

    const individualLessons = allBookings
      .filter(
        (b) =>
          b.instructorId === userProfile.instructorId &&
          !b.userId?.startsWith('system_block_') &&
          b.status !== 'cancelled'
      )
      .map((b): EnrichedBooking => {
        const client = usersList.find((u) => u.uid === b.userId);
        const name =
          client?.displayName ||
          b.guestName ||
          (b.isGuest || b.userId?.startsWith('guest_')
            ? b.guestName
              ? `${b.guestName} (${t('guestBadge') || 'Гость'})`
              : t('guestBadge') || 'Гость'
            : t('instructorEnrolledStudent'));
        return {
          ...b,
          clientName: name,
          clientAvatar: client?.avatarUrl || '',
          guestPhone: b.guestPhone,
          guestEmail: b.guestEmail,
          isGuest: b.isGuest || b.userId?.startsWith('guest_'),
        };
      });

    const instructorCourseIds = courses
      .filter((c) => c.instructorIds?.includes(userProfile.instructorId!))
      .map((c) => c.id);

    const groupedCourses = new Map<string, EnrichedCourseBooking>();

    allBookings.forEach((b) => {
      if (!b.instructorId.startsWith('course_') || b.status === 'cancelled') return;
      const courseId = b.instructorId.replace('course_', '');
      if (!instructorCourseIds.includes(courseId)) return;

      if (!groupedCourses.has(courseId)) {
        const course = courses.find((c) => c.id === courseId);
        if (!course) return;

        const translated = translateCourse(course, language);
        const { datePart, timePart } = splitCourseDates(translated.dates);

        groupedCourses.set(courseId, {
          id: courseId,
          chatId: courseId,
          courseId,
          instructorId: `course_${courseId}`,
          participantBookingIds: [],
          isCourse: true,
          instructorName: `${translated.title} (${t('instructorGroupSuffix')})`,
          instructorAvatar: translated.bgImageUrl || b.instructorAvatar,
          date: datePart,
          time: timePart,
          durationHours: parseDurationHours(translated.duration, b.durationHours),
          status: 'confirmed',
          difficulty: b.difficulty,
          notes: translated.description,
          clients: [],
        });
      }

      const group = groupedCourses.get(courseId)!;
      if (!group.participantBookingIds.includes(b.id)) {
        group.participantBookingIds.push(b.id);
      }
      const client = usersList.find((u) => u.uid === b.userId);
      if (client) {
        group.clients.push({
          uid: client.uid,
          name: client.displayName,
          avatar: client.avatarUrl,
          phone: client.phoneNumber,
          email: client.email,
          bookingId: b.id,
          recommendations: b.recommendations,
        });
      } else {
        const guestNameStr =
          b.guestName ||
          (b.isGuest || b.userId?.startsWith('guest_')
            ? t('guestBadge') || 'Гость'
            : t('instructorEnrolledStudent'));
        group.clients.push({
          uid: b.userId,
          name: guestNameStr,
          avatar: '',
          phone: b.guestPhone,
          email: b.guestEmail,
          isGuest: true,
          bookingId: b.id,
          recommendations: b.recommendations,
        });
      }
    });

    return [...individualLessons, ...Array.from(groupedCourses.values())];
  }, [allBookings, userProfile.instructorId, courses, language, usersList, t]);

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
    const revenue = instructorBookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    return { total, pending, confirmed, completed, cancelled, revenue };
  }, [instructorBookings]);

  const displayedBookings = useMemo(() => {
    return instructorBookings
      .filter((b) => statusFilter === 'all' || b.status === statusFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
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

    instructorBookings.forEach((b) => {
      const courseBooking = b as EnrichedCourseBooking;
      if (courseBooking.isCourse) {
        courseBooking.clients.forEach((c) => {
          if (!c.uid) return;
          const existing = map.get(c.uid) || {
            uid: c.uid,
            name: c.name,
            avatar: c.avatar,
            lessonsCount: 0,
          };
          existing.lessonsCount += 1;
          map.set(c.uid, existing);
        });
      } else if (b.userId && !b.userId.startsWith('system_block_')) {
        const individual = b as EnrichedBooking;
        const existing = map.get(b.userId) || {
          uid: b.userId,
          name: individual.clientName || 'Student',
          avatar: individual.clientAvatar,
          lessonsCount: 0,
        };
        existing.lessonsCount += 1;
        map.set(b.userId, existing);
      }
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

  const handleSaveRecommendations = async (bookingId: string, items: LessonRecommendation[]) => {
    try {
      await saveBookingRecommendationsService(bookingId, items);
      addNotification(
        'success',
        t('instructorRecommendationsSaved'),
        t('instructorRecommendationsSavedDesc')
      );
    } catch (err) {
      logger.error('Error saving recommendations:', err);
      addNotification('error', t('updateFailed'), t('updateFailedDesc'));
    }
  };

  const handleUpdateStatus = async (bookingId: string, nextStatus: 'confirmed' | 'completed') => {
    try {
      const booking = allBookings.find((item) => item.id === bookingId);
      if (!booking) return;

      if (nextStatus === 'completed') {
        const completedBooking = await completeBookingService(bookingId);
        if (!completedBooking) return;

        await logActivityForUser(
          completedBooking.userId,
          userProfile.uid,
          'booking_completed',
          buildBookingCompletedMetadata(completedBooking, courses),
          activityLogId.bookingCompleted(completedBooking.id)
        );
        return;
      }

      await updateBookingStatusService(booking, nextStatus);
    } catch (err) {
      logger.error('Error updating lesson status:', err);
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
    handleUpdateStatus,
    handleSaveRecommendations,
    hasUnreadChat,
    markBookingChatRead,
    userProfile,
    instructors,
    courses,
    usersList,
    skillConfig,
  };
};
