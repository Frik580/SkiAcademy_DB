import React, { useState, useMemo } from 'react';
import { 
  db,
  doc, 
  updateDoc,
  writeBatch
} from '../lib/firebase';
import { UserProfile, Instructor, Booking, Review, Course } from '../types';
import { 
  User, 
  Calendar, 
  Clock, 
  MessageSquare, 
  CheckCircle,
  Users, 
  Star, 
  Lock,
  Award
} from 'lucide-react';
import { BookingChatModal } from './BookingChatModal'; 
import { useLanguage, translateInstructorName, translateCourse, splitCourseDates, parseDurationHours, getDifficultyLabel } from '../lib/LanguageContext';
import { useNotifications } from './PushNotificationHub';
import { useTheme } from './useTheme';
import { SkillConfig } from '../lib/skillData';
import { StudentSkillEvaluationModal } from './StudentSkillEvaluationModal';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  toAvailabilitySlot,
} from '../lib/availabilitySlots';

interface InstructorWorkspaceProps {
  userProfile: UserProfile;
  instructors: Instructor[];
  allBookings: Booking[];
  reviews: Review[];
  courses: Course[];
  usersList: UserProfile[];
  skillConfig?: SkillConfig;
}

export const InstructorWorkspace: React.FC<InstructorWorkspaceProps> = ({
  userProfile,
  instructors,
  allBookings,
  reviews,
  courses,
  usersList,
  skillConfig
}) => {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const { addNotification } = useNotifications();
  const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed'>('all');

  const [evalModalState, setEvalModalState] = useState<{
    isOpen: boolean;
    studentUid: string;
    studentName: string;
    studentLevel: number;
    existingScores?: Record<string, number>;
  }>({
    isOpen: false,
    studentUid: '',
    studentName: '',
    studentLevel: 1,
    existingScores: {}
  });

  const handleSaveStudentScores = async (studentUid: string, updatedScores: Record<string, number>, calculatedLevel: number) => {
    try {
      await updateDoc(doc(db, 'users', studentUid), {
        skillScores: updatedScores,
        level: calculatedLevel
      });
      addNotification(
        'success',
        t('instructorRatingsSaved'),
        `${t('instructorRatingsSavedDesc')} ${calculatedLevel}`
      );
    } catch (err) {
      console.error("Error saving student skill scores:", err);
    }
  };

  // Find linked instructor
  const linkedInstructor = useMemo(() => {
    return instructors.find(ins => ins.id === userProfile.instructorId);
  }, [instructors, userProfile.instructorId]);

  // Filtered bookings for the linked instructor
  const instructorBookings = useMemo(() => {
    if (!userProfile.instructorId) return [];

    // 1. Get individual lessons
    const individualLessons = allBookings
      .filter(b => 
          b.instructorId === userProfile.instructorId &&
          !b.userId?.startsWith('system_block_') &&
          b.status !== 'cancelled'
      )
      .map(b => {
        const client = usersList.find(u => u.uid === b.userId);
        const name = client?.displayName || 
          b.guestName || 
          (b.isGuest || b.userId?.startsWith('guest_') ? (b.guestName ? `${b.guestName} (${t('guestBadge') || 'Гость'})` : (t('guestBadge') || 'Гость')) : t('instructorEnrolledStudent'));
        const avatar = client?.avatarUrl || '';
        return { 
          ...b, 
          clientName: name, 
          clientAvatar: avatar,
          guestPhone: b.guestPhone,
          guestEmail: b.guestEmail,
          isGuest: b.isGuest || b.userId?.startsWith('guest_')
        };
      });

    // 2. Get course bookings for courses this instructor teaches
    const instructorCourseIds = courses
      .filter(c => c.instructorIds?.includes(userProfile.instructorId!))
      .map(c => c.id);
      
    const groupedCourses = new Map<string, any>();

    // Group bookings by course ID
    allBookings.forEach(b => {
      if (!b.instructorId.startsWith('course_') || b.status === 'cancelled') return;
      const courseId = b.instructorId.replace('course_', '');
      if (!instructorCourseIds.includes(courseId)) return;

      if (!groupedCourses.has(courseId)) {
        const course = courses.find(c => c.id === courseId);
        if (!course) return;

        const translated = translateCourse(course, language);
        const { datePart, timePart } = splitCourseDates(translated.dates);

        groupedCourses.set(courseId, {
          id: courseId, // For chat and key
          isCourse: true,
          instructorName: `${translated.title} (${t('instructorGroupSuffix')})`,
          instructorAvatar: translated.bgImageUrl || b.instructorAvatar,
          date: datePart,
          time: timePart,
          durationHours: parseDurationHours(translated.duration, b.durationHours),
          status: 'confirmed', // Courses are generally considered confirmed
          difficulty: b.difficulty, // Assume difficulty is same for all in a course
          notes: translated.description,
          clients: [],
        });
      }

      const client = usersList.find(u => u.uid === b.userId);
      if (client) {
        groupedCourses.get(courseId).clients.push({
          uid: client.uid,
          name: client.displayName,
          avatar: client.avatarUrl,
          phone: client.phoneNumber,
          email: client.email,
        });
      } else {
        const guestNameStr = b.guestName || (b.isGuest || b.userId?.startsWith('guest_') ? (t('guestBadge') || 'Гость') : t('instructorEnrolledStudent'));
        groupedCourses.get(courseId).clients.push({
          uid: b.userId,
          name: guestNameStr,
          avatar: '',
          phone: b.guestPhone,
          email: b.guestEmail,
          isGuest: true,
        });
      }
    });

    return [...individualLessons, ...Array.from(groupedCourses.values())];
  }, [allBookings, userProfile.instructorId, courses, language, usersList, t]);

  // Statistics
  const stats = useMemo(() => {
    const total = instructorBookings.length;
    const pending = instructorBookings.filter(b => b.status === 'pending' || b.status === 'pending_cancellation').length;
    const confirmed = instructorBookings.filter(b => b.status === 'confirmed').length;
    const completed = instructorBookings.filter(b => b.status === 'completed').length;
    const cancelled = instructorBookings.filter(b => b.status === 'cancelled').length;
    
    // Calculate total earned credits
    const revenue = instructorBookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    return { total, pending, confirmed, completed, cancelled, revenue };
  }, [instructorBookings]);

  // Displayed filtered bookings
  const displayedBookings = useMemo(() => {
    return instructorBookings
      .filter(b => {
        return statusFilter === 'all' || b.status === statusFilter;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [instructorBookings, statusFilter]);

  // Reviews for this instructor
  const instructorReviews = useMemo(() => {
    if (!userProfile.instructorId) return [];
    return reviews
      .filter(r => r.instructorId === userProfile.instructorId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reviews, userProfile.instructorId]);

  // Quick Action Handlers for Instructor
  const myStudents = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; avatar?: string; lessonsCount: number }>();

    instructorBookings.forEach(b => {
      if ((b as any).isCourse) {
        ((b as any).clients || []).forEach((c: any) => {
          if (!c.uid) return;
          const existing = map.get(c.uid) || { uid: c.uid, name: c.name, avatar: c.avatar, lessonsCount: 0 };
          existing.lessonsCount += 1;
          map.set(c.uid, existing);
        });
      } else if (b.userId && !b.userId.startsWith('system_block_')) {
        const existing = map.get(b.userId) || { 
          uid: b.userId, 
          name: (b as any).clientName || 'Student', 
          avatar: (b as any).clientAvatar, 
          lessonsCount: 0 
        };
        existing.lessonsCount += 1;
        map.set(b.userId, existing);
      }
    });

    return Array.from(map.values());
  }, [instructorBookings]);

  const handleUpdateStudentLevel = async (studentUid: string, studentName: string, newLevel: number) => {
    try {
      await updateDoc(doc(db, 'users', studentUid), { level: newLevel });
      addNotification(
        'info',
        t('instructorLevelUpdated'),
        `${t('instructorLevelUpdatedPrefix')} ${studentName} ${t('instructorLevelUpdatedTo')} ${newLevel}`
      );
    } catch (err) {
      console.error("Error updating student level:", err);
    }
  };

  const handleUpdateStatus = async (bookingId: string, nextStatus: 'confirmed' | 'completed') => {
    try {
      const booking = allBookings.find((item) => item.id === bookingId);
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', bookingId), { status: nextStatus });
      if (booking) {
        const updatedBooking = { ...booking, status: nextStatus };
        if (blocksInstructorAvailability(updatedBooking)) {
          batch.set(
            doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId),
            toAvailabilitySlot(updatedBooking)
          );
        } else {
          batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId));
        }
      }
      await batch.commit();
    } catch (err) {
      console.error("Error updating lesson status:", err);
    }
  };

  // Rendering screen to select profile
  if (!userProfile.instructorId) {
    return (
      <div className="border border-slate-200/70 dark:border-slate-800/70 p-8 space-y-6 animate-fade-in bg-[var(--card-bg)] text-center max-w-xl mx-auto my-12 rounded-xs shadow-xs">
        <div className="w-16 h-16 border border-slate-200/60 dark:border-slate-800/60 rounded-full flex items-center justify-center mx-auto text-accent bg-accent-muted dark:bg-accent-muted">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-serif font-light text-[var(--ink)] tracking-tight">
            {t('instructorProfileNotLinked')}
          </h3>
          <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
            {t('instructorProfileNotLinkedDesc')}
          </p>
          <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
            {t('instructorContactAdmin')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Active Profile Header */}
      <div className="border border-slate-200/70 dark:border-slate-800/70 p-6 bg-[var(--card-bg)] rounded-xs shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 border border-slate-200/60 dark:border-slate-800/60 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 relative">
            {linkedInstructor?.avatarUrl ? (
              <img 
                src={linkedInstructor.avatarUrl} 
                alt={linkedInstructor.name} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-8 h-8 text-[var(--ink-dim)] absolute inset-0 m-auto" />
            )}
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-black animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase bg-accent-muted dark:bg-accent-muted border border-accent-soft px-2 py-0.5 text-accent dark:text-accent tracking-wider rounded-xs font-bold">
                {t('instructorActiveAccount')}
              </span>
            </div>
            <h3 className="text-2xl font-serif font-light text-[var(--ink)] tracking-tight mt-1.5 leading-none">
              {linkedInstructor ? translateInstructorName(linkedInstructor.name, language) : userProfile.displayName}
            </h3>
            <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] mt-2">
              {linkedInstructor?.specialty === 'both'
                ? t('instructorSkiSnowboardSpecialist')
                : linkedInstructor?.specialty === 'ski'
                  ? t('instructorSkiCoach')
                  : t('instructorSnowboardCoach')}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">{t('rating')}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-serif font-light text-[var(--ink)]">{linkedInstructor?.rating || '0.0'}</span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 self-center" />
          </div>
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {linkedInstructor?.reviewsCount || 0} {t('instructorReviewsCount')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">{t('instructorTotalLessons')}</span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">{stats.total}</span>
          <span className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            {stats.completed} {t('completed')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorPendingActions')}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">{stats.pending}</span>
          <span className="text-[8px] font-mono text-accent dark:text-accent uppercase tracking-wider block">
            {stats.confirmed} {t('confirmed')}
          </span>
        </div>

        <div className="border border-slate-200/70 dark:border-slate-800/70 p-4 bg-[var(--card-bg)] rounded-xs shadow-xs space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorEstimatedEarnings')}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">${stats.revenue}</span>
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {t('instructorCompletedEarnings')}
          </span>
        </div>
      </div>

      {/* Main Roster Block */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
          <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight">
            {t('instructorActiveRoster')} ({displayedBookings.length})
          </h4>
          
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Status Filter buttons */}
            {(['all', 'pending', 'confirmed', 'completed'] as const).map((filter) => {
              const isActive = statusFilter === filter;
              const label = filter === 'all' 
                ? t('allFilter')
                : filter === 'pending'
                ? t('pending')
                : filter === 'confirmed'
                ? t('confirmed')
                : filter === 'completed'
                ? t('completed') : '';

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

        {/* Lessons List */}
        {displayedBookings.length === 0 ? (
          <div className="py-12 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs">
            <Calendar className="w-8 h-8 mx-auto opacity-20 mb-2 text-[var(--ink-dim)]" />
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)]">{t('noLessons')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedBookings.map((b) => {
              return (
                <div 
                  key={b.id}
                  className={`border p-5 space-y-4 bg-[var(--card-bg)] rounded-xs shadow-xs transition-colors duration-300 ${(b as any).isCourse ? 'border-violet-200 dark:border-violet-800/50 hover:border-violet-300 bg-violet-50/40 dark:bg-violet-950/20' : 'border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700'}`}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    {/* Date/Time & Client details */}
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
                        <span className={`px-2 py-0.5 text-[8px] font-mono uppercase font-bold rounded-xs ${
                          b.status === 'confirmed'
                            ? 'text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-950/50'
                            : b.status === 'completed'
                            ? 'badge-accent'
                            : b.status === 'cancelled'
                            ? 'text-rose-700 bg-rose-100/80 dark:text-rose-300 dark:bg-rose-950/50'
                            : 'text-amber-700 bg-amber-100/80 dark:text-amber-300 dark:bg-amber-950/50'
                        }`}>
                          {b.status === 'pending'
                            ? t('pending')
                            : b.status === 'confirmed'
                            ? t('confirmed')
                            : b.status === 'completed'
                            ? t('completed')
                            : b.status === 'cancelled'
                            ? t('cancelled')
                            : t('pendingCancellationStatus')}
                        </span>
                      </div>

                      {/* Client profile(s) representation */}
                      <div className="p-3.5 border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 rounded-xs w-full space-y-2.5">
                        <h5 className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] flex items-center gap-1.5 font-bold">
                          <Users className="w-3.5 h-3.5 text-accent" />
                          {(b as any).isCourse 
                            ? t('instructorCourseParticipants')
                            : t('instructorLessonClient')} 
                          {((b as any).isCourse ? ` (${(b as any).clients.length})` : '')}
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {(b as any).isCourse ? (
                            (b as any).clients.map((client: any) => {
                              const studentUser = usersList.find(u => u.uid === client.uid);
                              const studentLevel = studentUser?.level || 1;
                              return (
                                <div key={client.uid} className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/70 dark:border-slate-800/70 rounded-xs hover:border-slate-300 transition-colors duration-200 w-full" title={client.name}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                                      {client.avatar ? (
                                        <img src={client.avatar} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-serif">👤</div>
                                      )}
                                    </div>
                                    <span className="text-xs font-mono text-[var(--ink)] font-medium max-w-[140px] truncate">{client.name}</span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setEvalModalState({
                                        isOpen: true,
                                        studentUid: client.uid,
                                        studentName: client.name,
                                        studentLevel: studentLevel,
                                        existingScores: studentUser?.skillScores || {}
                                      })}
                                      className="px-2.5 py-1 badge-accent-outline text-[9px] font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1 rounded-xs font-bold"
                                      title="Оценить навыки ученика"
                                    >
                                      <Award className="w-3 h-3 text-accent" />
                                      {t('instructorAssess')}
                                    </button>

                                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-xs" title={`${t('instructorLevel')}: ${studentLevel}`}>
                                      <img 
                                        key={`${theme}-${studentLevel}`}
                                        src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${studentLevel}.png`} 
                                        alt={`Level ${studentLevel}`} 
                                        className="w-4 h-4 object-contain shrink-0" 
                                        referrerPolicy="no-referrer"
                                        onLoad={(e) => { e.currentTarget.style.display = 'block'; }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                      <span className="text-[9px] font-mono font-bold text-[var(--ink)]">
                                        {t('instructorLevelShort')} {studentLevel}
                                      </span>
                                    </div>

                                    <select
                                      value={studentLevel}
                                      onChange={(e) => handleUpdateStudentLevel(client.uid, client.name, Number(e.target.value))}
                                      className="text-[9px] font-mono bg-white dark:bg-slate-900 text-[var(--ink)] border border-slate-200 dark:border-slate-700 rounded-xs px-1.5 py-0.5 focus:outline-none focus:ring-1 ring-accent cursor-pointer"
                                    >
                                      <option value={1}>{t('instructorLevelShort')} 1</option>
                                      <option value={2}>{t('instructorLevelShort')} 2</option>
                                      <option value={3}>{t('instructorLevelShort')} 3</option>
                                      <option value={4}>{t('instructorLevelShort')} 4</option>
                                    </select>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            (() => {
                              const studentUser = usersList.find(u => u.uid === b.userId);
                              const studentLevel = studentUser?.level || 1;
                              const studentName = (b as any).clientName || 'Student';
                              return (
                                <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/70 dark:border-slate-800/70 rounded-xs hover:border-slate-300 transition-colors duration-200 w-full">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                                      {(b as any).clientAvatar ? (
                                        <img src={(b as any).clientAvatar} alt={studentName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-serif">👤</div>
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-xs font-mono text-[var(--ink)] font-medium flex items-center gap-1.5">
                                        {studentName}
                                        {(b as any).isGuest && (
                                          <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-mono rounded-xs border border-amber-500/30">
                                            {t('guestBadge') || 'Гость'}
                                          </span>
                                        )}
                                      </div>
                                      {((b as any).guestPhone || (b as any).guestEmail) && (
                                        <div className="text-[10px] font-mono text-[var(--ink-dim)] flex flex-wrap gap-2 mt-0.5">
                                          {(b as any).guestPhone && (
                                            <a href={`tel:${(b as any).guestPhone}`} className="hover:text-accent">
                                              📞 {(b as any).guestPhone}
                                            </a>
                                          )}
                                          {(b as any).guestEmail && (
                                            <a href={`mailto:${(b as any).guestEmail}`} className="hover:text-accent">
                                              ✉️ {(b as any).guestEmail}
                                            </a>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setEvalModalState({
                                        isOpen: true,
                                        studentUid: b.userId,
                                        studentName: studentName,
                                        studentLevel: studentLevel,
                                        existingScores: studentUser?.skillScores || {}
                                      })}
                                      className="px-2.5 py-1 badge-accent-outline text-[9px] font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1 rounded-xs font-bold"
                                      title="Оценить навыки ученика"
                                    >
                                      <Award className="w-3 h-3 text-accent" />
                                      {t('instructorAssess')}
                                    </button>

                                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-xs" title={`${t('instructorCurrentLevel')}: ${studentLevel}`}>
                                      <img 
                                        key={`${theme}-${studentLevel}`}
                                        src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${studentLevel}.png`} 
                                        alt={`Level ${studentLevel}`} 
                                        className="w-4 h-4 object-contain shrink-0" 
                                        referrerPolicy="no-referrer"
                                        onLoad={(e) => { e.currentTarget.style.display = 'block'; }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                      <span className="text-[9px] font-mono font-bold text-[var(--ink)]">
                                        {t('instructorLevelShort')} {studentLevel}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider hidden sm:inline">
                                        {t('instructorSetLevel')}
                                      </span>
                                      <select
                                        value={studentLevel}
                                        onChange={(e) => handleUpdateStudentLevel(b.userId, studentName, Number(e.target.value))}
                                        className="text-[9px] font-mono bg-white dark:bg-slate-900 text-[var(--ink)] border border-slate-200 dark:border-slate-700 rounded-xs px-1.5 py-0.5 focus:outline-none focus:ring-1 ring-accent cursor-pointer"
                                      >
                                        <option value={1}>{t('instructorLevel')} 1</option>
                                        <option value={2}>{t('instructorLevel')} 2</option>
                                        <option value={3}>{t('instructorLevel')} 3</option>
                                        <option value={4}>{t('instructorLevel')} 4</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </div>
                      

                      

                      {/* Lesson Notes & Difficulty */}
                      <div className={`grid grid-cols-1 ${(b as any).isCourse ? '' : 'md:grid-cols-2'} gap-4 text-xs font-mono text-[var(--ink-dim)] border-t border-slate-200/60 dark:border-slate-800/60 pt-3`}>
                        <div>
                          <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">{t('instructorDifficulty')}</span>
                          <span className="text-[var(--ink)] font-bold">{getDifficultyLabel(b.difficulty, language, 'compact')}</span>
                        </div>
                        {!(b as any).isCourse && (
                          <div>
                            <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">{t('instructorStudentNotes')}</span>
                            <span className="text-[var(--ink)] italic leading-relaxed block">
                              {b.notes || t('instructorNoNotes')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions and real-time Chat */}
                    <div className="flex flex-col gap-2 w-full md:w-56 justify-end shrink-0 self-stretch">
                      <button
                        onClick={() => setSelectedChatBooking(b)}
                        className="w-full py-2.5 px-4 badge-accent-outline text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs"
                      >
                        {(b as any).isCourse ? <Users className="w-4 h-4 text-accent" /> : <MessageSquare className="w-4 h-4 text-accent" />}
                        {(b as any).isCourse ? t('instructorChatGroup') : t('instructorChatStudent')}
                      </button>

                      {b.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateStatus(b.id, 'confirmed')}
                          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t('instructorConfirmLesson')}
                        </button>
                      )}

                      {b.status === 'confirmed' && (
                        <button
                          onClick={() => handleUpdateStatus(b.id, 'completed')}
                          className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t('instructorCompleteLesson')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Students Roster & Level Management */}
      <div className="space-y-4">
        <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight border-b border-slate-200/80 dark:border-slate-800/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-accent" />
            <span>{t('instructorStudentsTitle')} ({myStudents.length})</span>
          </div>
          <span className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider font-normal">
            {t('instructorStudentsHint')}
          </span>
        </h4>

        {myStudents.length === 0 ? (
          <div className="py-8 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs font-mono text-xs text-[var(--ink-dim)]">
            {t('instructorNoStudents')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myStudents.map((student) => {
              const studentUser = usersList.find(u => u.uid === student.uid);
              const studentLevel = studentUser?.level || 1;
              return (
                <div key={student.uid} className="border border-slate-200/70 dark:border-slate-800/70 p-3 space-y-2 bg-[var(--card-bg)] rounded-xs shadow-xs flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors duration-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                      {student.avatar ? (
                        <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs">👤</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="font-serif text-xs text-[var(--ink)] font-bold truncate">{student.name}</h5>
                      <span className="text-[9px] font-mono text-[var(--ink-dim)] block">
                        {student.lessonsCount} {t('instructorLessonsWord')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <img 
                      key={`${theme}-${studentLevel}`}
                      src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${studentLevel}.png`} 
                      alt={`Level ${studentLevel}`} 
                      className="w-7 h-7 object-contain shrink-0" 
                      referrerPolicy="no-referrer"
                      onLoad={(e) => { e.currentTarget.style.display = 'block'; }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <select
                      value={studentLevel}
                      onChange={(e) => handleUpdateStudentLevel(student.uid, student.name, Number(e.target.value))}
                      className="text-[9px] font-mono uppercase bg-white dark:bg-slate-900 text-[var(--ink)] border border-slate-200 dark:border-slate-700 rounded-xs px-1.5 py-1 focus:outline-none focus:ring-1 ring-accent cursor-pointer"
                    >
                      <option value={1}>{t('instructorLevelShort')} 1</option>
                      <option value={2}>{t('instructorLevelShort')} 2</option>
                      <option value={3}>{t('instructorLevelShort')} 3</option>
                      <option value={4}>{t('instructorLevelShort')} 4</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reviews Feedback block */}
      <div className="space-y-4">
        <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
          {t('instructorFeedback')} ({instructorReviews.length})
        </h4>

        {instructorReviews.length === 0 ? (
          <div className="py-10 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs font-mono text-xs text-[var(--ink-dim)]">
            {t('instructorNoReviews')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {instructorReviews.map((rev) => (
              <div key={rev.id} className="border border-slate-200/70 dark:border-slate-800/70 p-4 space-y-3 bg-[var(--card-bg)] rounded-xs shadow-xs">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src={rev.userAvatar} 
                      alt={rev.userName} 
                      className="w-8 h-8 rounded-full border border-slate-200/60 dark:border-slate-800/60 object-cover bg-slate-100 dark:bg-slate-800" 
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <h5 className="font-serif text-xs text-[var(--ink)] font-bold leading-none">{rev.userName}</h5>
                      <span className="text-[8px] font-mono text-[var(--ink-dim)] mt-1.5 block">{rev.date}</span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 text-amber-400">
                    {Array.from({ length: rev.rating }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-[var(--ink-dim)] leading-relaxed italic font-mono">
                  "{rev.comment}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal chat window */}
      {selectedChatBooking && (
        <BookingChatModal
          booking={selectedChatBooking}
          currentUserProfile={userProfile}
          onClose={() => setSelectedChatBooking(null)}
          instructors={instructors}
          usersList={usersList}
        />
      )}

      {/* Student Skill Evaluation Modal */}
      <StudentSkillEvaluationModal
        isOpen={evalModalState.isOpen}
        onClose={() => setEvalModalState(prev => ({ ...prev, isOpen: false }))}
        studentUid={evalModalState.studentUid}
        studentName={evalModalState.studentName}
        studentLevel={evalModalState.studentLevel}
        existingScores={evalModalState.existingScores}
        skillConfig={skillConfig}
        onSaveScores={handleSaveStudentScores}
      />
    </div>
  );
};

