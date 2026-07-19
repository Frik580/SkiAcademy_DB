import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Instructor, UserProfile, Booking, LessonDifficulty, Course } from '../types';
import { X, Calendar, Clock, HelpCircle, Wallet, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage, parseCourseDates } from '../lib/LanguageContext';
import { db, collection, query, getDocs, where } from '../lib/firebase';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess: (booking: Booking, totalCost: number) => Promise<void>;
  onOpenTopUp: () => void;
  courses?: Course[];
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  instructor,
  userProfile,
  onBookingSuccess,
  onOpenTopUp,
  courses = []
}) => {
  const [activeInstructor, setActiveInstructor] = useState<Instructor | null>(instructor);

  useEffect(() => {
    if (instructor) {
      setActiveInstructor(instructor);
    }
  }, [instructor]);

  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('08:00');
  const [duration, setDuration] = useState<number>(2);
  const [difficulty, setDifficulty] = useState<LessonDifficulty>('beginner');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [instructorBookings, setInstructorBookings] = useState<Booking[]>([]);

  // Set default date to tomorrow
  useEffect(() => {
    if (isOpen) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split('T')[0]);
      setTime('08:00'); // Set default to 08:00
    }
  }, [isOpen]);

  // Fetch active bookings for this instructor to prevent double bookings
  useEffect(() => {
    if (!isOpen || !instructor) return;

    const fetchBookings = async () => {
      try {
        const isSandbox = userProfile?.uid?.startsWith('local_') || false;
        if (!isSandbox) {
          const q = query(
            collection(db, 'bookings'),
            where('instructorId', '==', instructor.id)
          );
          const snap = await getDocs(q);
          const list: Booking[] = [];
          if (snap && !snap.empty) {
            snap.forEach((doc) => {
              const b = { id: doc.id, ...doc.data() } as Booking;
              if (b.status !== 'cancelled') {
                list.push(b);
              }
            });
          }
          setInstructorBookings(list);
        } else {
          // Sandbox local storage check
          const savedBookings = localStorage.getItem(`alpine_glide_bookings_${userProfile?.uid}`);
          const localList: Booking[] = savedBookings ? JSON.parse(savedBookings) : [];
          setInstructorBookings(
            localList.filter((b) => b.instructorId === instructor.id && b.status !== 'cancelled')
          );
        }
      } catch (err) {
        console.error('Error fetching instructor bookings:', err);
      }
    };

    fetchBookings();
  }, [isOpen, instructor?.id, userProfile?.uid]);

  const timeToMinutes = (tStr: string): number => {
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  const toYMD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const availableSlots = React.useMemo(() => {
    const slots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    return slots.filter((slot) => {
      const start = timeToMinutes(slot);
      const end = start + duration * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00

      if (!date) return true;

      // Check standard bookings overlap
      const hasBookingOverlap = instructorBookings.some((b) => {
        if (b.isDeleted || b.status === 'cancelled') return false;
        if (b.date !== date) return false;
        const bStart = timeToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;
        return start < bEnd && end > bStart;
      });

      if (hasBookingOverlap) return false;

      // Check group courses overlap
      if (instructor) {
        const hasCourseOverlap = (courses || []).some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(instructor.id)) return false;
          
          const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
          const startStr = toYMD(cStart);
          const endStr = toYMD(cEnd);
          
          if (date < startStr || date > endStr) return false;
          
          const cStartMin = timeToMinutes(cStartTime);
          const cEndMin = timeToMinutes(cEndTime);
          return start < cEndMin && end > cStartMin;
        });
        
        if (hasCourseOverlap) return false;
      }

      return true;
    });
  }, [date, duration, instructorBookings, courses, instructor]);

  // Auto-select first available slot if current selected slot is not available
  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(time)) {
      setTime(availableSlots[0]);
    }
  }, [availableSlots, time]);

  const getOverlappingBooking = (): Booking | null => {
    if (!date || !time) return null;
    const newStart = timeToMinutes(time);
    const newEnd = newStart + duration * 60;

    for (const b of instructorBookings) {
      if (b.isDeleted || b.status === 'cancelled') continue;
      if (b.date !== date) continue;
      const existStart = timeToMinutes(b.time);
      const existEnd = existStart + b.durationHours * 60;

      if (newStart < existEnd && newEnd > existStart) {
        return b;
      }
    }
    return null;
  };

  const getOverlappingCourse = (): Course | null => {
    if (!date || !time || !courses || !instructor) return null;
    const newStart = timeToMinutes(time);
    const newEnd = newStart + duration * 60;

    for (const course of courses) {
      if (!course.instructorIds || !course.instructorIds.includes(instructor.id)) continue;
      
      const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
      const startStr = toYMD(cStart);
      const endStr = toYMD(cEnd);
      
      if (date >= startStr && date <= endStr) {
        const cStartMin = timeToMinutes(cStartTime);
        const cEndMin = timeToMinutes(cEndTime);
        
        if (newStart < cEndMin && newEnd > cStartMin) {
          return course;
        }
      }
    }
    return null;
  };

  const overlappingBooking = getOverlappingBooking();
  const overlappingCourse = getOverlappingCourse();
  const isTimeSlotOccupied = !!overlappingBooking || !!overlappingCourse || availableSlots.length === 0;

  const targetInstructor = activeInstructor || instructor;
  if (!targetInstructor) return null;

  const totalCost = targetInstructor.pricePerHour * duration;
  const userBalance = userProfile?.balanceUSD || 0;
  const hasSufficientFunds = userBalance >= totalCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) {
      addNotification(
        'error',
        language === 'en' ? 'Sign In Required' : 'Требуется войти',
        language === 'en'
          ? 'Sign in to schedule elite instructors, manage wallets, and track training sessions.'
          : 'Войдите, чтобы бронировать инструкторов, пополнять кошелек и видеть расписание.'
      );
      return;
    }
    if (userProfile.isClientActive === false) {
      addNotification(
        'error',
        language === 'en' ? 'Access Suspended' : 'Доступ приостановлен',
        language === 'en'
          ? 'Your student account is suspended. You cannot book training sessions.'
          : 'Ваш аккаунт ученика приостановлен. Вы не можете бронировать занятия.'
      );
      return;
    }
    if (!date) {
      addNotification(
        'warning',
        language === 'en' ? 'Missing Details' : 'Не все поля заполнены',
        language === 'en' ? 'Please select a valid coaching date.' : 'Пожалуйста, выберите дату.'
      );
      return;
    }
    if (!hasSufficientFunds) {
      addNotification(
        'error',
        language === 'en' ? 'Insufficient Funds' : 'Недостаточно средств',
        language === 'en' ? 'Your account balance is too low for this session.' : 'Недостаточно средств для оплаты урока.'
      );
      return;
    }

    if (!targetInstructor.isAvailable) {
      addNotification(
        'error',
        language === 'en' ? 'Instructor Unavailable' : 'Инструктор недоступен',
        language === 'en'
          ? `${targetInstructor.name} is currently not accepting new bookings.`
          : `${targetInstructor.name} временно не принимает записи на новые занятия.`
      );
      return;
    }

    if (isTimeSlotOccupied) {
      addNotification(
        'error',
        language === 'en' ? 'Slot Unavailable' : 'Время недоступно',
        language === 'en'
          ? `${targetInstructor.name} is already booked during this time period.`
          : `${targetInstructor.name} уже занят(а) в данный промежуток времени.`
      );
      return;
    }

    setIsSubmitting(true);
    
    // Simulate transaction processing
    setTimeout(async () => {
      const newBooking: Booking = {
        id: `book_${Math.random().toString(36).substring(2, 9)}`,
        userId: userProfile.uid,
        instructorId: targetInstructor.id,
        instructorName: targetInstructor.name,
        instructorAvatar: targetInstructor.avatarUrl,
        date,
        time,
        durationHours: duration,
        totalPrice: totalCost,
        status: 'confirmed', // immediately confirm in our beautiful sandbox
        difficulty,
        notes: notes.trim() || ""
      };

      try {
        await onBookingSuccess(newBooking, totalCost);
        addNotification(
          'success',
          language === 'en' ? 'Lesson Booked!' : 'Урок забронирован!',
          language === 'en' 
            ? `Coaching with ${targetInstructor.name} scheduled for ${date} at ${time}. $${totalCost} debited.`
            : `Занятие с ${targetInstructor.name} запланировано на ${date} в ${time}. Списано $${totalCost}.`
        );
        onClose();
      } catch (err) {
        addNotification(
          'error',
          language === 'en' ? 'Booking Error' : 'Ошибка бронирования',
          language === 'en' ? 'Failed to record session in database.' : 'Не удалось записать сессию в БД.'
        );
      } finally {
        setIsSubmitting(false);
      }
    }, 1500);
  };

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const getDifficultyLabel = (diff: string) => {
    if (language === 'ru') {
      switch (diff) {
        case 'beginner': return '🟢 Начинающий (Зеленые)';
        case 'intermediate': return '🔵 Средний уровень (Синие)';
        case 'advanced': return '🔴 Продвинутый (Красные/Черные)';
        case 'freeride': return '🏔️ Вне трассы / Фрирайд';
        case 'freestyle': return '🛹 Фристайл в парке';
        default: return diff;
      }
    }
    switch (diff) {
      case 'beginner': return '🟢 Beginner (Green Slopes)';
      case 'intermediate': return '🔵 Intermediate (Blue Slopes)';
      case 'advanced': return '🔴 Advanced (Red/Black)';
      case 'freeride': return '🏔️ Off-Piste / Freeride';
      case 'freestyle': return '🛹 Terrain Park Freestyle';
      default: return diff;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && targetInstructor && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
        >
          {!userProfile ? (
            <motion.div 
              key="signin-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-md overflow-hidden transition-colors duration-300 rounded-none"
            >
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10">
                <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                  {language === 'en' ? 'Sign In Required' : 'Требуется войти'}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 text-center space-y-5">
                <div className="p-3 border border-[var(--border)] bg-black/10 text-[var(--ink)] rounded-none w-12 h-12 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <p className="text-[11px] font-mono text-[var(--ink-dim)] uppercase tracking-wider leading-relaxed">
                  {language === 'en' 
                    ? 'Sign in to schedule elite instructors, manage wallets, and track training sessions.' 
                    : 'Войдите, чтобы бронировать инструкторов, пополнять кошелек и видеть расписание.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    const authEl = document.getElementById('auth-section');
                    if (authEl) {
                      authEl.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="w-full py-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer"
                >
                  {language === 'en' ? 'Go to Sign In / Register' : 'Перейти к авторизации'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="booking-form-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 rounded-none"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border border-[var(--border)] rounded-none overflow-hidden bg-black/15 shrink-0 filter grayscale">
                    <img src={targetInstructor.avatarUrl} alt={targetInstructor.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                      {language === 'en' ? `Book with ${targetInstructor.name}` : `Запись к ${targetInstructor.name}`}
                    </h3>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                      ${targetInstructor.pricePerHour}/{t('hr')} • {language === 'en' ? 'private instruction' : 'индивидуальное занятие'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Booking options */}
          <div className="grid grid-cols-2 gap-4">
            {/* Date Picker */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> {language === 'en' ? 'Date' : 'Дата'}
              </label>
              <input
                type="date"
                required
                min={tomorrowStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
              />
            </div>

            {/* Time Slot Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {language === 'en' ? 'Time Slot' : 'Время'}
              </label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={availableSlots.length === 0}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer disabled:opacity-60 disabled:bg-black/10 rounded-none"
              >
                {availableSlots.length === 0 ? (
                  <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                    {language === 'en' ? 'No slots available' : 'Нет свободного времени'}
                  </option>
                ) : (
                  availableSlots.map((slot) => (
                    <option key={slot} value={slot} className="bg-[var(--bg)] text-[var(--ink)]">{slot}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Duration Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {language === 'en' ? 'Duration (Hours)' : 'Длительность (часов)'}
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
              >
                {[1, 2, 3, 4, 6].map((hrs) => (
                  <option key={hrs} value={hrs} className="bg-[var(--bg)] text-[var(--ink)]">
                    {hrs} {hrs === 1 ? (language === 'en' ? 'Hour' : 'Час') : (language === 'en' ? 'Hours' : 'Часа')}
                  </option>
                ))}
              </select>
            </div>

            {/* Lesson Difficulty */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                <HelpCircle className="w-3 h-3" /> {language === 'en' ? 'Lesson Stage' : 'Уровень обучения'}
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as LessonDifficulty)}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
              >
                <option value="beginner" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('beginner')}</option>
                <option value="intermediate" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('intermediate')}</option>
                <option value="advanced" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('advanced')}</option>
                <option value="freeride" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('freeride')}</option>
                <option value="freestyle" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('freestyle')}</option>
              </select>
            </div>
          </div>

          {isTimeSlotOccupied && overlappingBooking && (
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-rose-300 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
                  {language === 'en' ? 'Time Slot Occupied' : 'Время занято'}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {language === 'en'
                    ? `${targetInstructor.name} is already booked on this date from ${overlappingBooking.time} for ${overlappingBooking.durationHours} ${overlappingBooking.durationHours === 1 ? 'hour' : 'hours'}. Please choose another time slot or date.`
                    : `${targetInstructor.name} уже забронирован(а) на эту дату с ${overlappingBooking.time} на ${overlappingBooking.durationHours} ${overlappingBooking.durationHours === 1 ? 'час' : 'часа/часов'}. Пожалуйста, выберите другое время или дату.`}
                </p>
              </div>
            </div>
          )}

          {isTimeSlotOccupied && overlappingCourse && (
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-rose-300 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
                  {language === 'en' ? 'Reserved for Group Course' : 'Зарезервирован под групповой курс'}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {language === 'en'
                    ? `${targetInstructor.name} is leading the group course "${overlappingCourse.title}" on this date and time (${overlappingCourse.dates}). Please choose another time slot or date.`
                    : `${targetInstructor.name} ведет групповой курс «${overlappingCourse.title}» в этот день и время (${overlappingCourse.dates}). Пожалуйста, выберите другое время или дату.`}
                </p>
              </div>
            </div>
          )}

          {!targetInstructor.isAvailable && (
            <div className="bg-amber-950/20 border border-amber-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-amber-300 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
                  {language === 'en' ? 'Instructor Unavailable' : 'Инструктор недоступен'}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {language === 'en'
                    ? `${targetInstructor.name} is currently not accepting new bookings. Please select another guide.`
                    : `${targetInstructor.name} временно не принимает записи на занятия. Пожалуйста, выберите другого инструктора.`}
                </p>
              </div>
            </div>
          )}

          {/* Notes field */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {language === 'en' ? 'Personal Goals & Equipment Notes' : 'Цели тренировки и примечания к экипировке'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={language === 'en' ? 'e.g. Bringing own snowboard. First time in deep snow. Want to focus on parallel turns.' : 'Например: своя доска, хочу научиться уверенно резать дуги, первый раз поеду в пухляк...'}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-16 resize-none rounded-none"
            />
          </div>

          {/* Financial Breakdown Panel */}
          <div className="bg-black/10 rounded-none p-4 border border-[var(--border)] space-y-2.5">
            <div className="flex justify-between text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
              <span>{language === 'en' ? 'Hourly Rate:' : 'Почасовая ставка:'}</span>
              <span className="font-bold text-[var(--ink)]">${targetInstructor.pricePerHour} / {t('hr')}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
              <span>{language === 'en' ? 'Hours booked:' : 'Часов забронировано:'}</span>
              <span className="font-bold text-[var(--ink)]">x {duration}</span>
            </div>
            <div className="h-[1px] bg-[var(--border)]" />
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)]">{language === 'en' ? 'Total Lesson Fee:' : 'Итоговая стоимость занятия:'}</span>
              <span className="text-xl font-extrabold text-sky-600 dark:text-sky-400 font-mono">${totalCost}</span>
            </div>
          </div>

          {/* Wallet check alert */}
          <div className="flex items-center justify-between px-4 py-3 rounded-none border border-[var(--border)] text-xs bg-black/5">
            {userProfile?.isClientActive === false ? (
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-wider font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {language === 'en' ? 'Access Suspended. Booking restricted.' : 'Доступ приостановлен. Бронирование невозможно.'}
                </span>
              </div>
            ) : hasSufficientFunds ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] uppercase tracking-wider">
                <Wallet className="w-3.5 h-3.5" />
                <span>
                  {language === 'en' ? 'Wallet balance: ' : 'Баланс кошелька: '}
                  <strong>${userBalance}</strong> {language === 'en' ? 'is sufficient.' : 'достаточен.'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 w-full">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-wider font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {language === 'en' ? 'Insufficient credits (Wallet Balance: ' : 'Недостаточно средств (Баланс кошелька: '}
                    <strong>${userBalance}</strong>)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTopUp();
                  }}
                  className="w-full mt-1.5 py-2 border border-rose-900/40 bg-rose-950/10 hover:bg-rose-950/20 text-rose-500 rounded-none text-center transition cursor-pointer font-mono text-[10px] uppercase tracking-widest"
                >
                  💡 {language === 'en' ? `Instantly Top Up $${totalCost - userBalance}+` : `Пополнить баланс на $${totalCost - userBalance}+`}
                </button>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isSubmitting || !hasSufficientFunds || isTimeSlotOccupied || !targetInstructor.isAvailable || userProfile?.isClientActive === false}
            className="w-full py-3 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('submitting')}
              </>
            ) : userProfile?.isClientActive === false ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                {language === 'en' ? 'Access Suspended' : 'Доступ приостановлен'}
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                {language === 'en' ? 'Pay & Confirm Lesson Booking' : 'Оплатить и подтвердить бронирование'}
              </>
            )}
          </button>
        </form>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
