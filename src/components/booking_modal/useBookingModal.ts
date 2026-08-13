import { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  Instructor,
  UserProfile,
  Booking,
  AvailabilitySlot,
  LessonDifficulty,
  Course,
} from '../../types';
import { useNotifications } from '../PushNotificationHub';
import { useLanguage, parseCourseDates, getDifficultyLabel } from '../../lib/LanguageContext';
import { logger } from '../../lib/logger';
import { db, collection, query, getDocs, where } from '../../lib/firebase';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  DEFAULT_LESSON_TIME_SLOTS,
  isBookingSlotInPast,
  fitsLessonDaySchedule,
  timeStrToMinutes,
  toAvailabilitySlot,
  toLocalDateStr,
} from '../../lib/availabilitySlots';
import { BookingSlotOverlapError, createGuestBooking } from '../../lib/bookingTransactions';
import { useAuthStore, selectEffectiveBalance } from '../../store/authStore';

export interface BookingModalInput {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess: (booking: Booking) => Promise<number>;
  onOpenTopUp: () => void;
  courses?: Course[];
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const useBookingModal = ({
  isOpen,
  onClose,
  instructor,
  userProfile,
  onBookingSuccess,
  onOpenTopUp,
  courses = [],
  onAuthSuccess,
}: BookingModalInput) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  const effectiveBalance = useAuthStore(selectEffectiveBalance);

  const [activeInstructor, setActiveInstructor] = useState<Instructor | null>(instructor);
  const targetInstructor = activeInstructor || instructor;

  useEffect(() => {
    if (instructor) {
      setActiveInstructor(instructor);
    }
  }, [instructor]);

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

  const minBookingDateStr = useMemo(() => toLocalDateStr(), []);

  useEffect(() => {
    if (isOpen) {
      setDate(toLocalDateStr());
      setTime('08:00');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !targetInstructor) return;

    const fetchBookings = async () => {
      setIsLoadingBookings(true);
      try {
        const isSandbox = userProfile?.uid?.startsWith('local_') || false;
        if (!isSandbox) {
          const slotsMap = new Map<string, AvailabilitySlot>();
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
              .filter(
                (b) => b.instructorId === targetInstructor.id && blocksInstructorAvailability(b)
              )
              .map(toAvailabilitySlot)
          );
        }
      } catch (err) {
        logger.error('Error fetching instructor bookings:', err);
      } finally {
        setIsLoadingBookings(false);
      }
    };

    fetchBookings();
  }, [isOpen, targetInstructor?.id, userProfile?.uid]);

  const availableSlots = useMemo((): string[] => {
    const slots = [...DEFAULT_LESSON_TIME_SLOTS];
    const normDate = normalizeDateStr(date);

    return slots.filter((slot) => {
      if (!fitsLessonDaySchedule(slot, duration)) return false;
      if (normDate && isBookingSlotInPast(normDate, slot)) return false;

      const start = timeStrToMinutes(slot);
      const end = start + duration * 60;

      if (!normDate) return true;

      const hasBookingOverlap = instructorBookings.some((b) => {
        if (normalizeDateStr(b.date) !== normDate) return false;
        const bStart = timeToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;
        return start < bEnd && end > bStart;
      });

      if (hasBookingOverlap) return false;

      if (targetInstructor) {
        const hasCourseOverlap = (courses || []).some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(targetInstructor.id))
            return false;

          const {
            start: cStart,
            end: cEnd,
            startTime: cStartTime,
            endTime: cEndTime,
          } = parseCourseDates(course.dates);
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

      const {
        start: cStart,
        end: cEnd,
        startTime: cStartTime,
        endTime: cEndTime,
      } = parseCourseDates(course.dates);
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

  const totalCost = targetInstructor ? targetInstructor.pricePerHour * duration : 0;
  const userBalance = effectiveBalance;
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
      await createGuestBooking(db, guestBooking);
      addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      if (err instanceof BookingSlotOverlapError) {
        addNotification(
          'error',
          t('slotUnavailable'),
          `${targetInstructor.name} ${t('instructorAlreadyBooked')}`
        );
        return;
      }
      logger.error('Error submitting guest booking to Firestore:', err);
      try {
        const existingStr = localStorage.getItem('alpine_glide_bookings_admin');
        const existing: Booking[] = existingStr ? JSON.parse(existingStr) : [];
        existing.push(guestBooking);
        localStorage.setItem('alpine_glide_bookings_admin', JSON.stringify(existing));
        addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
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
      addNotification('error', t('signInRequired'), t('bookingSignInDesc'));
      return;
    }
    if (userProfile.isClientActive === false) {
      addNotification('error', t('accessSuspended'), t('bookingSuspendedDesc'));
      return;
    }
    if (!date) {
      addNotification('warning', t('missingDetails'), t('bookingSelectValidDate'));
      return;
    }
    if (!hasSufficientFunds) {
      addNotification('error', t('insufficientFunds'), t('bookingBalanceTooLow'));
      return;
    }

    if (!targetInstructor) {
      addNotification('error', t('instructorUnavailable'), t('instructorNotAccepting'));
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

    setTimeout(async () => {
      const newBooking: Booking = {
        id: `book_${Math.random().toString(36).substring(2, 9)}`,
        userId: userProfile.uid,
        instructorId: targetInstructor.id,
        instructorName: targetInstructor.name,
        instructorAvatar: targetInstructor.avatarUrl || '',
        date,
        time,
        durationHours: duration,
        totalPrice: totalCost,
        status: 'confirmed',
        difficulty,
        notes: notes.trim() || '',
      };

      try {
        const chargedAmount = await onBookingSuccess(newBooking);
        addNotification(
          'success',
          t('lessonBooked'),
          `${t('lessonBookedPrefix')} ${targetInstructor.name} ${t('lessonScheduledFor')} ${date} ${t('lessonRescheduledAdminAt')} ${time}. $${chargedAmount} ${t('debitedSuffix')}`
        );
        onClose();
      } catch (err) {
        addNotification('error', t('bookingError'), t('bookingRecordFailed'));
      } finally {
        setIsSubmitting(false);
      }
    }, 1500);
  };

  return {
    t,
    language,
    isOpen,
    onClose,
    targetInstructor,
    userProfile,
    onAuthSuccess,
    date,
    setDate,
    time,
    setTime,
    duration,
    setDuration,
    difficulty,
    setDifficulty,
    notes,
    setNotes,
    isSubmitting,
    unauthTab,
    setUnauthTab,
    guestName,
    setGuestName,
    guestPhone,
    setGuestPhone,
    guestEmail,
    setGuestEmail,
    isLoadingBookings,
    availableSlots,
    overlappingBooking,
    overlappingCourse,
    isTimeSlotOccupied,
    totalCost,
    userBalance,
    hasSufficientFunds,
    minBookingDateStr,
    handleSubmitGuest,
    handleSubmit,
    onOpenTopUp,
    getDifficultyLabel,
  };
};
