import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Instructor, UserProfile, Booking, AvailabilitySlot, LessonDifficulty, Course } from '../types';
import { X, Calendar, Clock, HelpCircle, Wallet, ShieldAlert, Sparkles, Loader2, User, Phone, Mail, Send } from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage, parseCourseDates, getDifficultyLabel } from '../lib/LanguageContext';
import { db, collection, query, getDocs, where, doc, writeBatch } from '../lib/firebase';
import { Auth } from './Auth';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  toAvailabilitySlot,
} from '../lib/availabilitySlots';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess: (booking: Booking, totalCost: number) => Promise<void>;
  onOpenTopUp: () => void;
  courses?: Course[];
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  instructor,
  userProfile,
  onBookingSuccess,
  onOpenTopUp,
  courses = [],
  onAuthSuccess
}) => {
  const [activeInstructor, setActiveInstructor] = useState<Instructor | null>(instructor);
  const targetInstructor = activeInstructor || instructor;

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

  const [unauthTab, setUnauthTab] = useState<'guest' | 'auth'>('guest');
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');

  const [instructorBookings, setInstructorBookings] = useState<AvailabilitySlot[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(true);

  const normalizeDateStr = (dStr?: string | null): string => {
    if (!dStr) return '';
    const trimmed = dStr.trim();
    const parts = trimmed.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return trimmed;
  };

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
    if (!isOpen || !targetInstructor) return;

    const fetchBookings = async () => {
      setIsLoadingBookings(true);
      try {
        const isSandbox = userProfile?.uid?.startsWith('local_') || false;
        if (!isSandbox) {
          const slotsMap = new Map<string, AvailabilitySlot>();

          // Fetch availability slots (publicly readable collection)
          const qSlots = query(
            collection(db, AVAILABILITY_SLOTS_COLLECTION),
            where('instructorId', '==', targetInstructor.id)
          );
          const snapSlots = await getDocs(qSlots);
          if (snapSlots && !snapSlots.empty) {
            snapSlots.forEach((docSnap) => {
              const slot = docSnap.data() as AvailabilitySlot;
              if (slot && (slot.bookingId || slot.instructorId)) {
                const key = slot.bookingId || `${slot.instructorId}_${slot.date}_${slot.time}`;
                slotsMap.set(key, slot);
              }
            });
          }

          setInstructorBookings(Array.from(slotsMap.values()));
        } else {
          // Sandbox local storage check - inspect all alpine_glide_bookings_* entries
          const localList: Booking[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('alpine_glide_bookings_')) {
              try {
                const val = localStorage.getItem(key);
                if (val) {
                  const parsed = JSON.parse(val);
                  if (Array.isArray(parsed)) {
                    localList.push(...parsed);
                  }
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
          setInstructorBookings(
            localList
              .filter((b) => b.instructorId === targetInstructor.id && blocksInstructorAvailability(b))
              .map(toAvailabilitySlot)
          );
        }
      } catch (err) {
        console.error('Error fetching instructor bookings:', err);
      } finally {
        setIsLoadingBookings(false);
      }
    };

    fetchBookings();
  }, [isOpen, targetInstructor?.id, userProfile?.uid]);

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
    const normDate = normalizeDateStr(date);

    return slots.filter((slot) => {
      const start = timeToMinutes(slot);
      const end = start + duration * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00

      if (!normDate) return true;

      // Check standard bookings overlap
      const hasBookingOverlap = instructorBookings.some((b) => {
        if (normalizeDateStr(b.date) !== normDate) return false;
        const bStart = timeToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;
        return start < bEnd && end > bStart;
      });

      if (hasBookingOverlap) return false;

      // Check group courses overlap
      if (targetInstructor) {
        const hasCourseOverlap = (courses || []).some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(targetInstructor.id)) return false;
          
          const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
          const startStr = normalizeDateStr(toYMD(cStart));
          const endStr = normalizeDateStr(toYMD(cEnd));
          
          if (normDate < startStr || normDate > endStr) return false;
          
          const cStartMin = timeToMinutes(cStartTime);
          const cEndMin = timeToMinutes(cEndTime);
          return start < cEndMin && end > cStartMin;
        });
        
        if (hasCourseOverlap) return false;
      }

      return true;
    });
  }, [date, duration, instructorBookings, courses, targetInstructor]);

  // Auto-select first available slot if current selected slot is not available
  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(time)) {
      setTime(availableSlots[0]);
    } else if (availableSlots.length === 0) {
      setTime('');
    }
  }, [availableSlots, time]);

  const getOverlappingBooking = (): AvailabilitySlot | null => {
    if (!date || !time) return null;
    const normDate = normalizeDateStr(date);
    const newStart = timeToMinutes(time);
    const newEnd = newStart + duration * 60;

    for (const b of instructorBookings) {
      if (normalizeDateStr(b.date) !== normDate) continue;
      const existStart = timeToMinutes(b.time);
      const existEnd = existStart + b.durationHours * 60;

      if (newStart < existEnd && newEnd > existStart) {
        return b;
      }
    }
    return null;
  };

  const getOverlappingCourse = (): Course | null => {
    if (!date || !time || !courses || !targetInstructor) return null;
    const normDate = normalizeDateStr(date);
    const newStart = timeToMinutes(time);
    const newEnd = newStart + duration * 60;

    for (const course of courses) {
      if (!course.instructorIds || !course.instructorIds.includes(targetInstructor.id)) continue;
      
      const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
      const startStr = normalizeDateStr(toYMD(cStart));
      const endStr = normalizeDateStr(toYMD(cEnd));
      
      if (normDate >= startStr && normDate <= endStr) {
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
  const isTimeSlotOccupied =
    isLoadingBookings ||
    !date ||
    !time ||
    !availableSlots.includes(time) ||
    !!overlappingBooking ||
    !!overlappingCourse;

  if (!targetInstructor) return null;

  const totalCost = targetInstructor.pricePerHour * duration;
  const userBalance = userProfile?.balanceUSD || 0;
  const hasSufficientFunds = userBalance >= totalCost;

  const handleSubmitGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInstructor) return;
    if (!guestName.trim()) {
      addNotification('warning', t('missingDetails'), t('guestNameLabel'));
      return;
    }
    if (!guestPhone.trim()) {
      addNotification('warning', t('missingDetails'), t('guestPhoneLabel'));
      return;
    }
    if (!date) {
      addNotification('warning', t('missingDetails'), t('bookingSelectValidDate'));
      return;
    }
    if (!targetInstructor.isAvailable) {
      addNotification(
        'error',
        t('instructorUnavailable'),
        `${targetInstructor.name} ${t('instructorNotAccepting')}`
      );
      return;
    }
    if (isTimeSlotOccupied) {
      addNotification(
        'error',
        t('slotUnavailable'),
        `${targetInstructor.name} ${t('instructorAlreadyBooked')}`
      );
      return;
    }

    setIsSubmitting(true);
    const guestBooking: Booking = {
      id: `guest_book_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: `guest_${Date.now()}`,
      instructorId: targetInstructor.id,
      instructorName: targetInstructor.name,
      instructorAvatar: targetInstructor.avatarUrl || '',
      date,
      time,
      durationHours: duration,
      totalPrice: totalCost,
      status: 'pending',
      difficulty,
      notes: notes.trim(),
      isGuest: true,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'bookings', guestBooking.id), guestBooking);
      if (blocksInstructorAvailability(guestBooking)) {
        batch.set(
          doc(db, AVAILABILITY_SLOTS_COLLECTION, guestBooking.id),
          toAvailabilitySlot(guestBooking)
        );
      }
      await batch.commit();
      addNotification(
        'success',
        t('guestApplicationSuccess'),
        t('guestApplicationSuccessDesc')
      );
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      console.error('Error submitting guest booking to Firestore:', err);
      try {
        const existingStr = localStorage.getItem('alpine_glide_bookings_admin');
        const existing: Booking[] = existingStr ? JSON.parse(existingStr) : [];
        existing.push(guestBooking);
        localStorage.setItem('alpine_glide_bookings_admin', JSON.stringify(existing));
        addNotification(
          'success',
          t('guestApplicationSuccess'),
          t('guestApplicationSuccessDesc')
        );
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        onClose();
      } catch {
        addNotification('error', t('bookingError'), t('bookingRecordFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) {
      addNotification(
        'error',
        t('signInRequired'),
        t('bookingSignInDesc')
      );
      return;
    }
    if (userProfile.isClientActive === false) {
      addNotification(
        'error',
        t('accessSuspended'),
        t('bookingSuspendedDesc')
      );
      return;
    }
    if (!date) {
      addNotification(
        'warning',
        t('missingDetails'),
        t('bookingSelectValidDate')
      );
      return;
    }
    if (!hasSufficientFunds) {
      addNotification(
        'error',
        t('insufficientFunds'),
        t('bookingBalanceTooLow')
      );
      return;
    }

    if (!targetInstructor.isAvailable) {
      addNotification(
        'error',
        t('instructorUnavailable'),
        `${targetInstructor.name} ${t('instructorNotAccepting')}`
      );
      return;
    }

    if (isTimeSlotOccupied) {
      addNotification(
        'error',
        t('slotUnavailable'),
        `${targetInstructor.name} ${t('instructorAlreadyBooked')}`
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
          t('lessonBooked'),
          `${t('lessonBookedPrefix')} ${targetInstructor.name} ${t('lessonScheduledFor')} ${date} ${t('lessonRescheduledAdminAt')} ${time}. $${totalCost} ${t('debitedSuffix')}`
        );
        onClose();
      } catch (err) {
        addNotification(
          'error',
          t('bookingError'),
          t('bookingRecordFailed')
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
              className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 rounded-none flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border border-[var(--border)] rounded-none overflow-hidden bg-black/15 shrink-0 filter grayscale">
                    <img src={targetInstructor.avatarUrl} alt={targetInstructor.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-light text-[var(--ink)]">
                      {t('bookLessonWith')} {targetInstructor.name}
                    </h3>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                      ${targetInstructor.pricePerHour}/{t('hr')} • {t('privateInstruction')}
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

              {/* Navigation Tabs */}
              <div className="grid grid-cols-2 border-b border-[var(--border)] bg-black/5 font-mono text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setUnauthTab('guest')}
                  className={`py-2.5 px-3 text-center font-bold uppercase tracking-wider transition cursor-pointer ${
                    unauthTab === 'guest'
                      ? 'bg-[var(--bg)] text-[var(--ink)] border-b-2 border-sky-600 dark:border-sky-400'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  📝 {t('guestBookingTab')}
                </button>
                <button
                  type="button"
                  onClick={() => setUnauthTab('auth')}
                  className={`py-2.5 px-3 text-center font-bold uppercase tracking-wider transition cursor-pointer ${
                    unauthTab === 'auth'
                      ? 'bg-[var(--bg)] text-[var(--ink)] border-b-2 border-sky-600 dark:border-sky-400'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  🔐 {t('authTab')}
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                {unauthTab === 'auth' ? (
                  <div className="space-y-4">
                    <p className="text-[11px] font-mono text-[var(--ink-dim)] uppercase tracking-wider text-center leading-relaxed">
                      {t('bookingSignInPrompt')}
                    </p>
                    <div className="border border-[var(--border)] p-4 bg-black/10">
                      <Auth onSuccess={(profile) => {
                        if (onAuthSuccess) {
                          onAuthSuccess(profile);
                        }
                      }} />
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitGuest} className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] font-mono text-amber-700 dark:text-amber-300 leading-relaxed">
                      💡 {t('guestBookingNotice')}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
                          <User className="w-3 h-3" /> {t('guestNameLabel')} *
                        </label>
                        <input
                          type="text"
                          required
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder={t('guestNamePlaceholder')}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {t('guestPhoneLabel')} *
                        </label>
                        <input
                          type="tel"
                          required
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder={t('guestPhonePlaceholder')}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {t('guestEmailLabel')}
                      </label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder={t('guestEmailPlaceholder')}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
                      />
                    </div>

                    {/* Booking date / time options */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" /> {t('dateLabel')}
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
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> {t('timeSlot')}
                        </label>
                        <select
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          disabled={isLoadingBookings || availableSlots.length === 0}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer disabled:opacity-60 disabled:bg-black/10 rounded-none"
                        >
                          {isLoadingBookings ? (
                            <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                              {t('loading')}...
                            </option>
                          ) : availableSlots.length === 0 ? (
                            <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                              {t('noSlotsAvailable')}
                            </option>
                          ) : (
                            availableSlots.map((slot) => (
                              <option key={slot} value={slot} className="bg-[var(--bg)] text-[var(--ink)]">{slot}</option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> {t('durationHours')}
                        </label>
                        <select
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
                        >
                          {[1, 2, 3, 4, 6].map((hrs) => (
                            <option key={hrs} value={hrs} className="bg-[var(--bg)] text-[var(--ink)]">
                              {hrs} {hrs === 1 ? t('hourSingular') : t('hoursPlural')}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                          <HelpCircle className="w-3 h-3" /> {t('lessonStage')}
                        </label>
                        <select
                          value={difficulty}
                          onChange={(e) => setDifficulty(e.target.value as LessonDifficulty)}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
                        >
                          <option value="beginner" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('beginner', language, 'booking')}</option>
                          <option value="intermediate" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('intermediate', language, 'booking')}</option>
                          <option value="advanced" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('advanced', language, 'booking')}</option>
                          <option value="freeride" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('freeride', language, 'booking')}</option>
                          <option value="freestyle" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('freestyle', language, 'booking')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                        {t('personalGoalsNotes')}
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('personalGoalsPlaceholder')}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-14 resize-none rounded-none"
                      />
                    </div>

                    <div className="bg-black/10 rounded-none p-3 border border-[var(--border)] space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)]">{t('totalLessonFee')}</span>
                        <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400 font-mono">${totalCost}</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || isTimeSlotOccupied || !targetInstructor.isAvailable}
                      className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {t('submitting')}
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          {t('submitGuestApplication')}
                        </>
                      )}
                    </button>
                  </form>
                )}
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
                      {t('bookLessonWith')} {targetInstructor.name}
                    </h3>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                      ${targetInstructor.pricePerHour}/{t('hr')} • {t('privateInstruction')}
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
                <Calendar className="w-3 h-3" /> {t('dateLabel')}
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
                <Clock className="w-3 h-3" /> {t('timeSlot')}
              </label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={isLoadingBookings || availableSlots.length === 0}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer disabled:opacity-60 disabled:bg-black/10 rounded-none"
              >
                {isLoadingBookings ? (
                  <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                    {t('loading')}...
                  </option>
                ) : availableSlots.length === 0 ? (
                  <option value="" className="bg-[var(--bg)] text-[var(--ink)]">
                    {t('noSlotsAvailable')}
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
                <Clock className="w-3 h-3" /> {t('durationHours')}
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
              >
                {[1, 2, 3, 4, 6].map((hrs) => (
                  <option key={hrs} value={hrs} className="bg-[var(--bg)] text-[var(--ink)]">
                    {hrs} {hrs === 1 ? t('hourSingular') : t('hoursPlural')}
                  </option>
                ))}
              </select>
            </div>

            {/* Lesson Difficulty */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center gap-1.5">
                <HelpCircle className="w-3 h-3" /> {t('lessonStage')}
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as LessonDifficulty)}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer rounded-none"
              >
                <option value="beginner" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('beginner', language, 'booking')}</option>
                <option value="intermediate" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('intermediate', language, 'booking')}</option>
                <option value="advanced" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('advanced', language, 'booking')}</option>
                <option value="freeride" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('freeride', language, 'booking')}</option>
                <option value="freestyle" className="bg-[var(--bg)] text-[var(--ink)]">{getDifficultyLabel('freestyle', language, 'booking')}</option>
              </select>
            </div>
          </div>

          {isTimeSlotOccupied && overlappingBooking && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-300 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
                  {t('timeSlotOccupied')}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {`${targetInstructor.name} ${t('bookingConflictFrom')} ${overlappingBooking.time} ${t('bookingConflictFor')} ${overlappingBooking.durationHours} ${overlappingBooking.durationHours === 1 ? t('hourSingular') : t('hoursPlural')}. ${t('chooseAnotherSlot')}`}
                </p>
              </div>
            </div>
          )}

          {isTimeSlotOccupied && overlappingCourse && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-300 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
                  {t('reservedGroupCourse')}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {`${targetInstructor.name} ${t('leadsGroupCourse')} "${overlappingCourse.title}" ${t('groupCourseOnDate')} (${overlappingCourse.dates}). ${t('chooseAnotherSlot')}`}
                </p>
              </div>
            </div>
          )}

          {!targetInstructor.isAvailable && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-none p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold uppercase tracking-wide font-mono text-[10px]">
                  {t('instructorUnavailable')}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {`${targetInstructor.name} ${t('instructorUnavailableChoice')}`}
                </p>
              </div>
            </div>
          )}

          {/* Notes field */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {t('personalGoalsNotes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('personalGoalsPlaceholder')}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-16 resize-none rounded-none"
            />
          </div>

          {/* Financial Breakdown Panel */}
          <div className="bg-black/10 rounded-none p-4 border border-[var(--border)] space-y-2.5">
            <div className="flex justify-between text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
              <span>{t('hourlyRate')}:</span>
              <span className="font-bold text-[var(--ink)]">${targetInstructor.pricePerHour} / {t('hr')}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
              <span>{t('hoursBooked')}</span>
              <span className="font-bold text-[var(--ink)]">x {duration}</span>
            </div>
            <div className="h-[1px] bg-[var(--border)]" />
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-xs font-mono uppercase tracking-widest text-[var(--ink)]">{t('totalLessonFee')}</span>
              <span className="text-xl font-extrabold text-sky-600 dark:text-sky-400 font-mono">${totalCost}</span>
            </div>
          </div>

          {/* Wallet check alert */}
          <div className="flex items-center justify-between px-4 py-3 rounded-none border border-[var(--border)] text-xs bg-black/5">
            {userProfile?.isClientActive === false ? (
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-wider font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t('bookingAccessRestricted')}
                </span>
              </div>
            ) : hasSufficientFunds ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] uppercase tracking-wider">
                <Wallet className="w-3.5 h-3.5" />
                <span>
                  {t('walletBalancePrefix')} <strong>${userBalance}</strong> {t('walletSufficient')}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 w-full">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-wider font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t('insufficientCreditsPrefix')}{' '}
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
                  💡 {t('instantTopUp')} ${totalCost - userBalance}+
                </button>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isSubmitting || !hasSufficientFunds || isTimeSlotOccupied || !targetInstructor.isAvailable || userProfile?.isClientActive === false}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('submitting')}
              </>
            ) : userProfile?.isClientActive === false ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                {t('accessSuspended')}
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                {t('payConfirmLesson')}
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
