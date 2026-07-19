import React, { useState, useMemo } from 'react';
import { 
  db,
  doc, 
  updateDoc
} from '../lib/firebase';
import { UserProfile, Instructor, Booking, Review, LessonDifficulty, Course } from '../types';
import { 
  User, 
  Calendar, 
  Clock, 
  MessageSquare, 
  CheckCircle,
  Users, 
  Star, 
  Lock
} from 'lucide-react';
import { BookingChatModal } from './BookingChatModal'; 
import { useLanguage, translateInstructorName, translateCourse, splitCourseDates, parseDurationHours } from '../lib/LanguageContext';

interface InstructorWorkspaceProps {
  userProfile: UserProfile;
  instructors: Instructor[];
  allBookings: Booking[];
  reviews: Review[];
  courses: Course[];
  usersList: UserProfile[];
}

export const InstructorWorkspace: React.FC<InstructorWorkspaceProps> = ({
  userProfile,
  instructors,
  allBookings,
  reviews,
  courses,
  usersList
}) => {
  const { language } = useLanguage();
  const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed'>('all');

  // Translate helper labels
  const t = {
    title: language === 'en' ? 'Instructor Workspace' : 'Кабинет Инструктора',
    subtitle: language === 'en' 
      ? 'Manage scheduled lessons, track client progress, and answer messages in real-time.' 
      : 'Управляйте расписанием уроков, отслеживайте прогресс учеников и отвечайте на сообщения.',
    selectProfile: language === 'en' ? 'Link your instructor profile' : 'Привяжите ваш профиль инструктора',
    selectDesc: language === 'en' 
      ? 'Choose one of our professional instructors to connect with your active account. This will grant you secure messaging permissions.' 
      : 'Выберите одного из профессиональных инструкторов, чтобы связать с вашим аккаунтом. Это даст вам доступ к чату с учениками.',
    linkBtn: language === 'en' ? 'Link & Enter Cabinet' : 'Связать и войти в кабинет',
    unlink: language === 'en' ? 'Disconnect Instructor Profile' : 'Отключить профиль инструктора',
    noLessons: language === 'en' ? 'No scheduled lessons found' : 'Занятий не найдено',
    chatBtn: language === 'en' ? 'Chat with Student' : 'Чат с учеником',
    clientDetails: language === 'en' ? 'Student Details' : 'Информация об ученике',
    groupChatBtn: language === 'en' ? 'Chat with Group' : 'Чат с группой',
    statsTitle: language === 'en' ? 'Season Overview' : 'Обзор сезона',
    rating: language === 'en' ? 'Rating' : 'Рейтинг',
    lessonsCount: language === 'en' ? 'Total Lessons' : 'Всего занятий',
    reviewsCount: language === 'en' ? 'Reviews' : 'Отзывов',
    activeLessons: language === 'en' ? 'Active Roster' : 'Список учеников',
    recentReviews: language === 'en' ? 'Student Feedback' : 'Отзывы учеников',
    difficulty: language === 'en' ? 'Difficulty' : 'Сложность',
    notes: language === 'en' ? 'Student Notes' : 'Заметки ученика',
    confirmLesson: language === 'en' ? 'Confirm Lesson' : 'Подтвердить занятие',
    completeLesson: language === 'en' ? 'Mark Completed' : 'Завершить занятие',
    statusPending: language === 'en' ? 'Pending' : 'Ожидает',
    statusConfirmed: language === 'en' ? 'Confirmed' : 'Подтвержден',
    statusCompleted: language === 'en' ? 'Completed' : 'Завершен',
    statusCancelled: language === 'en' ? 'Cancelled' : 'Отменен',
    statusPendingCancel: language === 'en' ? 'Cancellation Pending' : 'Ожидает отмены',
    experience: language === 'en' ? 'Experience' : 'Опыт работы'
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
        return client 
          ? { ...b, clientName: client.displayName, clientAvatar: client.avatarUrl } 
          : { ...b, clientName: 'Enrolled Student', clientAvatar: '' };
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
          instructorName: language === 'ru' ? `${translated.title} (Группа)` : `${translated.title} (Group)`,
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
        });
      }
    });

    return [...individualLessons, ...Array.from(groupedCourses.values())];
  }, [allBookings, userProfile.instructorId, courses, language, usersList]);

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
  const handleUpdateStatus = async (bookingId: string, nextStatus: 'confirmed' | 'completed') => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), { status: nextStatus });
    } catch (err) {
      console.error("Error updating lesson status:", err);
    }
  };

  const getDifficultyLabel = (diff: LessonDifficulty) => {
    if (language === 'ru') {
      switch (diff) {
        case 'beginner': return '🟢 Начинающий';
        case 'intermediate': return '🔵 Средний уровень';
        case 'advanced': return '🔴 Продвинутый';
        case 'freeride': return '🏔️ Фрирайд';
        case 'freestyle': return '🛹 Фристайл';
      }
    }
    return diff.charAt(0).toUpperCase() + diff.slice(1);
  };

  // Rendering screen to select profile
  if (!userProfile.instructorId) {
    return (
      <div className="border border-[var(--border)] p-8 space-y-6 animate-fade-in bg-black/10 dark:bg-black/30 text-center max-w-xl mx-auto my-12">
        <div className="w-16 h-16 border border-[var(--border)] rounded-none flex items-center justify-center mx-auto text-indigo-400 bg-black/10">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-serif font-light text-[var(--ink)] tracking-tight">
            {language === 'en' ? 'Instructor Profile Not Linked' : 'Профиль инструктора не привязан'}
          </h3>
          <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
            {language === 'en' 
              ? 'Your account is authorized as an instructor, but no specific professional instructor profile has been linked to your account yet by the administrator.' 
              : 'Ваша учетная запись авторизована как инструктор, но администратор еще не связал ее с конкретным профилем профессионального инструктора.'}
          </p>
          <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
            {language === 'en'
              ? 'Please contact the resort administration to assign your instructor profile.'
              : 'Пожалуйста, свяжитесь с администрацией курорта для привязки вашего профиля.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Active Profile Header */}
      <div className="border border-[var(--border)] p-6 bg-black/10 dark:bg-black/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 border border-[var(--border)] bg-slate-900 shrink-0 overflow-hidden relative">
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
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase bg-indigo-950/40 border border-indigo-950/80 px-2 py-0.5 text-indigo-400 tracking-wider">
                {language === 'en' ? 'Active Coach Account' : 'Учетная запись гида'}
              </span>
            </div>
            <h3 className="text-2xl font-serif font-light text-[var(--ink)] tracking-tight mt-1.5 leading-none">
              {linkedInstructor ? translateInstructorName(linkedInstructor.name, language) : userProfile.displayName}
            </h3>
            <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] mt-2">
              {linkedInstructor?.specialty === 'both' ? (language === 'en' ? 'Ski & Snowboard Specialist' : 'Универсал: Лыжи и Сноуборд') : (linkedInstructor?.specialty === 'ski' ? (language === 'en' ? 'Elite Ski Coach' : 'Элитный лыжный гид') : (language === 'en' ? 'Elite Snowboard Coach' : 'Элитный сноуборд-гид'))}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-[var(--border)] p-4 bg-black/5 space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">{t.rating}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-serif font-light text-[var(--ink)]">{linkedInstructor?.rating || '0.0'}</span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 self-center" />
          </div>
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {linkedInstructor?.reviewsCount || 0} {t.reviewsCount}
          </span>
        </div>

        <div className="border border-[var(--border)] p-4 bg-black/5 space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">{t.lessonsCount}</span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">{stats.total}</span>
          <span className="text-[8px] font-mono text-emerald-400 uppercase tracking-wider block">
            {stats.completed} {t.statusCompleted}
          </span>
        </div>

        <div className="border border-[var(--border)] p-4 bg-black/5 space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {language === 'en' ? 'Pending Actions' : 'Ожидает действий'}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">{stats.pending}</span>
          <span className="text-[8px] font-mono text-indigo-400 uppercase tracking-wider block">
            {stats.confirmed} {t.statusConfirmed}
          </span>
        </div>

        <div className="border border-[var(--border)] p-4 bg-black/5 space-y-1">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {language === 'en' ? 'Estimated Earnings' : 'Выручка за сезон'}
          </span>
          <span className="text-3xl font-serif font-light text-[var(--ink)] block">${stats.revenue}</span>
          <span className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider block">
            {language === 'en' ? 'From completed lessons' : 'За завершенные уроки'}
          </span>
        </div>
      </div>

      {/* Main Roster Block */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--border)] pb-3">
          <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight">
            {t.activeLessons} ({displayedBookings.length})
          </h4>
          
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Status Filter buttons */}
            {(['all', 'pending', 'confirmed', 'completed'] as const).map((filter) => {
              const isActive = statusFilter === filter;
              const label = filter === 'all' 
                ? (language === 'en' ? 'All' : 'Все')
                : filter === 'pending'
                ? t.statusPending
                : filter === 'confirmed'
                ? t.statusConfirmed
                : filter === 'completed'
                ? t.statusCompleted : '';

              return (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider border rounded-none transition cursor-pointer ${
                    isActive 
                      ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)] font-bold' 
                      : 'border-[var(--border)] text-[var(--ink-dim)] hover:border-[var(--ink)] hover:text-[var(--ink)]'
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
          <div className="py-12 border border-dashed border-[var(--border)] text-center bg-black/5">
            <Calendar className="w-8 h-8 mx-auto opacity-20 mb-2 text-[var(--ink-dim)]" />
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)]">{t.noLessons}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedBookings.map((b) => {
              return (
                <div 
                  key={b.id}
                  className={`border p-5 space-y-4 bg-black/5 hover:border-[var(--ink)] transition-colors duration-300 ${(b as any).isCourse ? 'border-violet-500/40 hover:border-violet-400' : 'border-[var(--border)]'}`}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    {/* Date/Time & Client details */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink)] font-bold">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          {b.date}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink)] font-bold">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                          {b.time} ({b.durationHours}h)
                        </div>
                        <span className={`px-2 py-0.5 text-[8px] font-mono uppercase font-black border rounded-none ${
                          b.status === 'confirmed'
                            ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20'
                            : b.status === 'completed'
                            ? 'border-slate-500/30 text-slate-400 bg-slate-950/20'
                            : b.status === 'cancelled'
                            ? 'border-rose-500/30 text-rose-400 bg-rose-950/20'
                            : 'border-amber-500/30 text-amber-400 bg-amber-950/20'
                        }`}>
                          {b.status === 'pending'
                            ? t.statusPending
                            : b.status === 'confirmed'
                            ? t.statusConfirmed
                            : b.status === 'completed'
                            ? t.statusCompleted
                            : b.status === 'cancelled'
                            ? t.statusCancelled
                            : t.statusPendingCancel}
                        </span>
                      </div>

                      {/* Client profile(s) representation */}
                      {(b as any).isCourse ? (
                        <div className="p-3 border border-[var(--border)] bg-black/10 w-full space-y-2">
                          <h5 className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> {language === 'ru' ? 'Участники курса' : 'Course Participants'} ({(b as any).clients.length})</h5>
                          <div className="flex flex-wrap gap-2">
                            {(b as any).clients.map((client: any) => (
                              <div key={client.uid} className="flex items-center gap-1.5 bg-black/20 p-1.5 border border-[var(--border)]/50" title={client.name}>
                                <img src={client.avatar} alt={client.name} className="w-5 h-5 rounded-none object-cover" />
                                <span className="text-xs font-mono text-[var(--ink)] max-w-[100px] truncate">{client.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 border border-[var(--border)] bg-black/10 flex items-center justify-between gap-4 w-full">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-none border border-[var(--border)] bg-black/20 flex items-center justify-center shrink-0 overflow-hidden">
                              {(b as any).clientAvatar ? <img src={(b as any).clientAvatar} alt={(b as any).clientName} className="w-full h-full object-cover" /> : '👤'}
                            </div>
                            <div>
                              <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">{t.clientDetails}</span>
                              <span className="text-xs font-serif font-light text-[var(--ink)] block">{(b as any).clientName}</span>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-[var(--ink-dim)]">
                            ID: {b.userId.substring(0, 10)}...
                          </div>
                        </div>
                      )}
                      

                      

                      {/* Lesson Notes & Difficulty */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-[var(--ink-dim)] border-t border-[var(--border)]/30 pt-3">
                        <div>
                          <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">{t.difficulty}</span>
                          <span className="text-[var(--ink)] font-bold">{getDifficultyLabel(b.difficulty)}</span>
                        </div>
                        <div>
                          <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">{t.notes}</span>
                          <span className="text-[var(--ink)] italic leading-relaxed block">
                            {b.notes || (language === 'en' ? 'No specific notes provided.' : 'Особых пожеланий не указано.')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions and real-time Chat */}
                    <div className="flex flex-col gap-2 w-full md:w-56 justify-end shrink-0 self-stretch">
                      <button
                        onClick={() => setSelectedChatBooking(b)}
                        className="w-full py-2.5 px-4 border border-indigo-500/80 text-indigo-400 hover:bg-indigo-950/20 text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        {(b as any).isCourse ? <Users className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                        {(b as any).isCourse ? t.groupChatBtn : t.chatBtn}
                      </button>

                      {b.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateStatus(b.id, 'confirmed')}
                          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-600 hover:border-emerald-500 text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t.confirmLesson}
                        </button>
                      )}

                      {b.status === 'confirmed' && (
                        <button
                          onClick={() => handleUpdateStatus(b.id, 'completed')}
                          className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white border border-slate-700 hover:border-slate-600 text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t.completeLesson}
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

      {/* Reviews Feedback block */}
      <div className="space-y-4">
        <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight border-b border-[var(--border)] pb-3">
          {t.recentReviews} ({instructorReviews.length})
        </h4>

        {instructorReviews.length === 0 ? (
          <div className="py-10 border border-dashed border-[var(--border)] text-center bg-black/5 font-mono text-xs text-[var(--ink-dim)]">
            {language === 'en' ? 'No reviews received yet.' : 'Отзывов пока нет.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {instructorReviews.map((rev) => (
              <div key={rev.id} className="border border-[var(--border)] p-4 space-y-3 bg-black/5">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src={rev.userAvatar} 
                      alt={rev.userName} 
                      className="w-8 h-8 rounded-none border border-[var(--border)] object-cover bg-slate-900" 
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
    </div>
  );
};

