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
import { InstructorIdSchema, type AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
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
  toAvailabilitySlot,
  toLocalDateStr,
} from '../../../../domain/availability';

import { queryInstructorOccupancyReadModels } from '../../../../lib/canonical/canonicalReadModelClient';
import {
  getAvailableLessonStartTimes,
  mapInstructorOccupancyReadModelForBookingModal,
  addBookingLocalDays,
  normalizeBookingLocalDate,
  resolveLessonStartTimeSelection,
} from '../../instructorOccupancyForBookingModal';
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
import { resolveAuthenticatedParticipantSelection } from './authBookingState';
import { toggleParticipantSelection } from '../../../participants/participantSelectionState';

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
  const {
    participants: managedParticipants,
    loading: managedParticipantsLoading,
    error: managedParticipantsError,
    reload: reloadManagedParticipants,
  } = useManagedParticipants(userProfile?.uid);
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
      setSelectedParticipantIds(
        resolveAuthenticatedParticipantSelection(
          selectedParticipantIds,
          managedParticipants.map((participant) => participant.participantId)
        )
      );
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
  const [occupancyCourses, setOccupancyCourses] = useState<Course[]>([]);
  const [occupancyItems, setOccupancyItems] = useState<AdminPlannerOccupancyItem[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(true);
  const [occupancyLoadFailed, setOccupancyLoadFailed] = useState(false);
  const [occupancyRefreshNonce, setOccupancyRefreshNonce] = useState(0);
  const occupancyFetchVersionRef = useRef(0);

  const normalizeDateStr = normalizeBookingLocalDate;

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
  const timezone = resolveLessonBookingTimezone();

  useEffect(() => {
    if (isOpen) {
      setDate(toLocalDateStr());
      setTime('08:00');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !targetInstructor || !date) return;

    const fetchVersion = ++occupancyFetchVersionRef.current;

    const fetchOccupancy = async () => {
      setIsLoadingBookings(true);
      setOccupancyLoadFailed(false);
      try {
        const isSandbox = userProfile?.uid?.startsWith('local_') || false;
        if (!isSandbox) {
          const timezone = resolveLessonBookingTimezone();
          const selectedDate = normalizeDateStr(date);
          const [selectedDay, nextDay] = await Promise.all([
            queryInstructorOccupancyReadModels({
              scope: 'public_instructor_day',
              instructorId: InstructorIdSchema.parse(targetInstructor.id),
              localDate: selectedDate,
              timeZone: timezone,
            }),
            queryInstructorOccupancyReadModels({
              scope: 'public_instructor_day',
              instructorId: InstructorIdSchema.parse(targetInstructor.id),
              localDate: addBookingLocalDays(selectedDate, 1),
              timeZone: timezone,
            }),
          ]);
          if (fetchVersion !== occupancyFetchVersionRef.current) return;
          const occupancy = [...selectedDay.item.occupancy, ...nextDay.item.occupancy];
          const mapped = mapInstructorOccupancyReadModelForBookingModal({
            ...selectedDay.item,
            occupancy,
          });
          setOccupancyItems(occupancy);
          setInstructorBookings(mapped.slots);
          setOccupancyCourses(mapped.courses);
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
          setOccupancyItems([]);
          setInstructorBookings(
            localList
              .filter(
                (b) => b.instructorId === targetInstructor.id && blocksInstructorAvailability(b)
              )
              .map(toAvailabilitySlot)
          );
          setOccupancyCourses(courses);
        }
      } catch (err) {
        logger.error('Error fetching instructor occupancy:', err);
        if (fetchVersion === occupancyFetchVersionRef.current) {
          setInstructorBookings([]);
          setOccupancyCourses([]);
          setOccupancyItems([]);
          setOccupancyLoadFailed(true);
        }
      } finally {
        if (fetchVersion === occupancyFetchVersionRef.current) {
          setIsLoadingBookings(false);
        }
      }
    };

    void fetchOccupancy();
  }, [isOpen, targetInstructor?.id, date, userProfile?.uid, courses, occupancyRefreshNonce]);

  const availableSlots = useMemo((): string[] => {
    return getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: duration,
      localDate: date,
      instructorId: targetInstructor?.id,
      occupancySlots: instructorBookings,
      occupancyCourses,
      occupancyItems,
      timeZone: timezone,
    });
  }, [
    date,
    duration,
    instructorBookings,
    occupancyCourses,
    occupancyItems,
    targetInstructor?.id,
    timezone,
  ]);

  useEffect(() => {
    const nextTime = resolveLessonStartTimeSelection(time, availableSlots);
    if (nextTime !== time) {
      setTime(nextTime);
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
    if (!date || !time || !targetInstructor) return null;
    const normDate = normalizeDateStr(date);
    const newStart = timeToMinutes(time);
    const newEnd = newStart + duration * 60;

    for (const course of occupancyCourses) {
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
    occupancyLoadFailed ||
    !date ||
    !time ||
    !availableSlots.includes(time) ||
    !!overlappingBooking ||
    !!overlappingCourse;

  const totalCost =
    targetInstructor?.pricePerHourKZT != null && Number.isFinite(targetInstructor.pricePerHourKZT)
      ? targetInstructor.pricePerHourKZT * duration
      : 0;

  const toggleParticipant = (participantId: string) => {
    setSelectedParticipantIds((current) =>
      toggleParticipantSelection(
        current,
        participantId,
        managedParticipants.map((participant) => participant.participantId)
      )
    );
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
        difficulty,
        notes: notes.trim() || undefined,
      });
      addNotification('success', t('guestApplicationSuccess'), t('guestApplicationSuccessDesc'));
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      const presented = presentCanonicalCommandErrorWithContext(err, {
        t: t as (key: string) => string,
      });
      addNotification('error', t('bookingError'), presented.message);
      if (presented.shouldRefresh) {
        setOccupancyRefreshNonce((current) => current + 1);
        setTime('');
      }
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
          difficulty,
          notes: notes.trim() || undefined,
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
        if (presented.shouldRefresh) {
          setOccupancyRefreshNonce((current) => current + 1);
          setTime('');
        }
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
    occupancyLoadFailed,
    availableSlots,
    overlappingBooking,
    overlappingCourse,
    isTimeSlotOccupied,
    totalCost,
    managedParticipants,
    managedParticipantsLoading,
    managedParticipantsError,
    reloadManagedParticipants,
    selectedParticipantIds,
    toggleParticipant,
    minBookingDateStr,
    handleSubmitGuest,
    handleSubmit,
    getDifficultyLabel,
  };
};
