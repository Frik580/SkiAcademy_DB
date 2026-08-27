import { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Instructor,
  UserProfile,
  Booking,
  AvailabilitySlot,
  LessonDifficulty,
  Course,
} from '../../../../types';
import { useNotifications } from '../../../../features/notifications';
import {
  useLanguage,
  parseCourseDates,
  getDifficultyLabel,
} from '../../../../app/providers/LanguageContext';
import { logger } from '../../../../shared';
import {
  blocksInstructorAvailability,
  DEFAULT_LESSON_TIME_SLOTS,
  isBookingSlotInPast,
  fitsLessonDaySchedule,
  timeStrToMinutes,
  toAvailabilitySlot,
  toLocalDateStr,
} from '../../../../domain/availability';
import { getInstructorAvailabilitySlots } from '../../bookingService';
import {
  createLogicalBookingAttemptId,
  deriveAuthenticatedCreateIdempotencyKey,
  deriveGuestCreateIdempotencyKey,
  deriveGuestParticipantIdForBooking,
  deriveExercisedCapabilityFromParticipants,
  presentCanonicalCommandErrorWithContext,
  resolveLessonBookingTimezone,
  useLessonBookingCommands,
  useManagedParticipants,
} from '../../../lesson-bookings';

export interface BookingModalInput {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess?: (booking: Booking) => Promise<number>;
  courses?: Course[];
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const useBookingModal = ({
  isOpen,
  onClose,
  instructor,
  userProfile,
  courses = [],
  onAuthSuccess,
}: BookingModalInput) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  const { createAuthenticatedBooking, createGuestBooking } = useLessonBookingCommands(
    userProfile?.uid
  );
  const { participants: managedParticipants, loading: managedParticipantsLoading } =
    useManagedParticipants(Boolean(userProfile?.uid));
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

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
  const isSubmittingRef = useRef<boolean>(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookingAttemptIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      bookingAttemptIdRef.current = null;
      setSelectedParticipantIds([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || managedParticipants.length === 0) return;
    if (selectedParticipantIds.length === 0) {
      setSelectedParticipantIds([managedParticipants[0].participantId]);
    }
  }, [isOpen, managedParticipants, selectedParticipantIds.length]);

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }
    };
  }, []);

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
          const remoteSlots = await getInstructorAvailabilitySlots(targetInstructor.id);
          if (remoteSlots.length > 0) {
            remoteSlots.forEach((slot) => {
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
  const timezone = resolveLessonBookingTimezone();

  const toggleParticipant = (participantId: string) => {
    setSelectedParticipantIds((current) => {
      if (current.includes(participantId)) {
        return current.filter((id) => id !== participantId);
      }
      if (current.length >= 8) return current;
      return [...current, participantId];
    });
  };

  const handleSubmitGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;
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

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const bookingId = bookingAttemptIdRef.current ?? createLogicalBookingAttemptId();
    bookingAttemptIdRef.current = bookingId;
    const participantId = deriveGuestParticipantIdForBooking(bookingId);

    try {
      await createGuestBooking({
        instructorId: targetInstructor.id,
        participantId,
        localDate: date,
        localTime: time,
        durationMinutes: duration * 60,
        timezone,
        identity: {
          bookingId,
          idempotencyKey: deriveGuestCreateIdempotencyKey(bookingId),
        },
        guestDisplayName: guestName.trim(),
        guestSkillLevel: difficulty,
        guestDiscipline: 'ski',
        guestAgeYears: 25,
      });
      addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      const presented = presentCanonicalCommandErrorWithContext(err, {
        t: t as (key: string) => string,
      });
      addNotification('error', t('bookingError'), presented.message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;
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
    if (selectedParticipantIds.length === 0) {
      addNotification('warning', t('missingDetails'), 'Select a participant');
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

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current);
    }

    submitTimerRef.current = setTimeout(async () => {
      const bookingId = bookingAttemptIdRef.current ?? createLogicalBookingAttemptId();
      bookingAttemptIdRef.current = bookingId;

      const selectedAuthorities = managedParticipants
        .filter((participant) => selectedParticipantIds.includes(participant.participantId))
        .map((participant) => participant.authority);

      try {
        await createAuthenticatedBooking({
          instructorId: targetInstructor.id,
          participantIds: selectedParticipantIds,
          exercisedCapability: deriveExercisedCapabilityFromParticipants(selectedAuthorities),
          localDate: date,
          localTime: time,
          durationMinutes: duration * 60,
          timezone,
          identity: {
            bookingId,
            idempotencyKey: deriveAuthenticatedCreateIdempotencyKey(bookingId),
          },
        });
        addNotification(
          'success',
          t('lessonBooked'),
          `${t('lessonBookedPrefix')} ${targetInstructor.name} ${t('lessonScheduledFor')} ${date} ${t('lessonRescheduledAdminAt')} ${time}.`
        );
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        onClose();
      } catch (err) {
        const presented = presentCanonicalCommandErrorWithContext(err, {
          t: t as (key: string) => string,
        });
        addNotification('error', t('bookingError'), presented.message);
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }, 300);
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
    managedParticipants,
    managedParticipantsLoading,
    selectedParticipantIds,
    toggleParticipant,
    minBookingDateStr,
    handleSubmitGuest,
    handleSubmit,
    getDifficultyLabel,
  };
};
