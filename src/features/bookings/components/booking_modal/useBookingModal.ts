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
import {
  InstructorIdSchema,
  type AdminPlannerOccupancyItem,
  type LessonBookingReadModel,
  type ParticipantId,
} from '@ski-academy/shared-domain';
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

import {
  queryInstructorOccupancyReadModels,
  queryLessonPricingSettingsReadModel,
  queryParticipantOccupancyReadModels,
} from '../../../../lib/canonical/canonicalReadModelClient';
import {
  getAvailableLessonStartTimes,
  mapInstructorOccupancyReadModelForBookingModal,
  addBookingLocalDays,
  normalizeBookingLocalDate,
  resolveLessonStartTimeSelection,
  flattenParticipantOccupancyReadModels,
} from '../../instructorOccupancyForBookingModal';
import {
  createLogicalBookingAttemptId,
  deriveAuthenticatedCreateIdempotencyKey,
  deriveGuestCreateIdempotencyKey,
  deriveCancellationIdempotencyKey,
  deriveGuestParticipantIdForBooking,
  deriveExercisedCapabilityFromParticipants,
  presentCanonicalCommandErrorWithContext,
  resolveLessonBookingTimezone,
  loadGuestSingleLessonBooking,
  useLessonBookingCommands,
  useManagedParticipants,
  readGuestBookingCredential,
} from '../../../lesson-bookings';
import { resolveEffectiveParticipantIds } from './authBookingState';
import { presentCancellationError } from '../../../student-cabinet/presentCancellationError';
import { toggleParticipantSelection } from '../../../participants/participantSelectionState';
import {
  forgetGuestReservation,
  isUnusableGuestReservationError,
  rememberGuestReservation,
  rememberedGuestReservation,
} from '../../../guest-reservations/guestReservationLookup';

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
  const { createAuthenticatedBooking, createGuestBooking, requestCancellation } = useLessonBookingCommands(
    userProfile?.uid
  );
  const {
    participants: managedParticipants,
    loading: managedParticipantsLoading,
    error: managedParticipantsError,
    reload: reloadManagedParticipants,
  } = useManagedParticipants(userProfile?.uid);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [additionalParticipantSurchargePerHourKzt, setAdditionalParticipantSurchargePerHourKzt] =
    useState<number | undefined>();
  const [maxParticipantsPerLesson, setMaxParticipantsPerLesson] = useState<number | undefined>();
  const [pricingSettingsLoading, setPricingSettingsLoading] = useState(false);

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
  const [guestQuotaError, setGuestQuotaError] = useState(false);
  const [guestCreatedBookingId, setGuestCreatedBookingId] = useState<string | null>(null);
  const [guestReservation, setGuestReservation] = useState<LessonBookingReadModel>();
  const [guestRefreshError, setGuestRefreshError] = useState(false);
  const [guestRefreshing, setGuestRefreshing] = useState(false);
  const [guestLookupError, setGuestLookupError] = useState<'stale' | 'recoverable' | null>(null);
  const guestLookupInFlightRef = useRef(false);
  const isSubmittingRef = useRef<boolean>(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookingAttemptIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen && !isSubmitting) {
      bookingAttemptIdRef.current = null;
      setGuestQuotaError(false);
      setGuestCreatedBookingId(null);
      setGuestReservation(undefined);
      setGuestRefreshError(false);
      setGuestLookupError(null);
      setSelectedParticipantIds([]);
      setUnauthTab('guest');
      setGuestName('');
      setGuestPhone('');
      setGuestEmail('');
      setDate('');
      setTime('08:00');
      setDuration(2);
      setDifficulty('beginner');
      setNotes('');
    }
  }, [isOpen, isSubmitting]);

  useEffect(() => {
    if (!isOpen || !userProfile?.uid || userProfile.uid.startsWith('local_')) {
      setAdditionalParticipantSurchargePerHourKzt(undefined);
      setMaxParticipantsPerLesson(undefined);
      return;
    }
    let active = true;
    setPricingSettingsLoading(true);
    void queryLessonPricingSettingsReadModel({ scope: 'lesson_pricing_settings' })
      .then((result) => {
        if (!active) return;
        setAdditionalParticipantSurchargePerHourKzt(
          result.item.configured ? result.item.additionalParticipantSurchargePerHourKzt : undefined
        );
        setMaxParticipantsPerLesson(
          result.item.configured ? result.item.maxParticipantsPerLesson : undefined
        );
      })
      .catch(() => {
        if (active) {
          setAdditionalParticipantSurchargePerHourKzt(undefined);
          setMaxParticipantsPerLesson(undefined);
        }
      })
      .finally(() => {
        if (active) setPricingSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, userProfile?.uid]);

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
  const [participantOccupancyItems, setParticipantOccupancyItems] = useState<
    AdminPlannerOccupancyItem[]
  >([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(true);
  const [occupancyLoadFailed, setOccupancyLoadFailed] = useState(false);
  const [occupancyRefreshNonce, setOccupancyRefreshNonce] = useState(0);
  const occupancyFetchVersionRef = useRef(0);
  const participantOccupancyFetchVersionRef = useRef(0);

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

  const effectiveParticipantIds = resolveEffectiveParticipantIds(
    managedParticipants,
    selectedParticipantIds
  );
  const participantOccupancyKey = effectiveParticipantIds.slice().sort().join(',');

  useEffect(() => {
    if (
      !isOpen ||
      !date ||
      !userProfile?.uid ||
      userProfile.uid.startsWith('local_') ||
      effectiveParticipantIds.length === 0
    ) {
      setParticipantOccupancyItems([]);
      return;
    }

    const fetchVersion = ++participantOccupancyFetchVersionRef.current;
    const selectedDate = normalizeDateStr(date);
    const participantIds = [
      ...resolveEffectiveParticipantIds(managedParticipants, selectedParticipantIds),
    ] as ParticipantId[];

    const fetchParticipantOccupancy = async () => {
      try {
        const [selectedDay, nextDay] = await Promise.all([
          queryParticipantOccupancyReadModels({
            scope: 'account_participant_day',
            participantIds,
            localDate: selectedDate,
            timeZone: timezone,
          }),
          queryParticipantOccupancyReadModels({
            scope: 'account_participant_day',
            participantIds,
            localDate: addBookingLocalDays(selectedDate, 1),
            timeZone: timezone,
          }),
        ]);
        if (fetchVersion !== participantOccupancyFetchVersionRef.current) return;
        setParticipantOccupancyItems(
          flattenParticipantOccupancyReadModels([selectedDay, nextDay])
        );
      } catch (err) {
        logger.error('Error fetching participant occupancy:', err);
        if (fetchVersion === participantOccupancyFetchVersionRef.current) {
          setParticipantOccupancyItems([]);
        }
      }
    };

    void fetchParticipantOccupancy();
  }, [
    isOpen,
    date,
    userProfile?.uid,
    participantOccupancyKey,
    occupancyRefreshNonce,
    timezone,
    managedParticipants,
    selectedParticipantIds,
  ]);

  const combinedOccupancyItems = useMemo(
    () => [...occupancyItems, ...participantOccupancyItems],
    [occupancyItems, participantOccupancyItems]
  );

  const availableSlots = useMemo((): string[] => {
    return getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: duration,
      localDate: date,
      instructorId: targetInstructor?.id,
      occupancySlots: instructorBookings,
      occupancyCourses,
      occupancyItems: combinedOccupancyItems,
      timeZone: timezone,
    });
  }, [
    date,
    duration,
    instructorBookings,
    occupancyCourses,
    combinedOccupancyItems,
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

  const resolveParticipantDisplayName = (participantId: string): string | undefined =>
    managedParticipants.find((participant) => participant.participantId === participantId)
      ?.displayName;

  const presentBookingCommandError = (err: unknown) =>
    presentCanonicalCommandErrorWithContext(err, {
      t: t as (key: string, ...args: unknown[]) => string,
      resolveParticipantDisplayName,
    });

  const baseLessonCost =
    targetInstructor?.pricePerHourKZT != null && Number.isFinite(targetInstructor.pricePerHourKZT)
      ? targetInstructor.pricePerHourKZT * duration
      : 0;
  const totalCost =
    baseLessonCost +
    Math.round(
      (additionalParticipantSurchargePerHourKzt ?? 0) *
        Math.max(0, effectiveParticipantIds.length - 1) *
        duration
    );
  const lessonSettingsUnavailable =
    additionalParticipantSurchargePerHourKzt === undefined ||
    maxParticipantsPerLesson === undefined;
  const participantSelectionExceedsMax =
    maxParticipantsPerLesson !== undefined &&
    effectiveParticipantIds.length > maxParticipantsPerLesson;

  const toggleParticipant = (participantId: string) => {
    setSelectedParticipantIds((current) => {
      if (maxParticipantsPerLesson === undefined) return current;
      return toggleParticipantSelection(
        current,
        participantId,
        managedParticipants.map((participant) => participant.participantId),
        maxParticipantsPerLesson
      );
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
    setGuestQuotaError(false);

    const bookingId = bookingAttemptIdRef.current ?? createLogicalBookingAttemptId();
    bookingAttemptIdRef.current = bookingId;
    const participantId = deriveGuestParticipantIdForBooking(bookingId);

    try {
      const credential = await createGuestBooking({
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
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim() || undefined,
        guestSkillLevel: difficulty,
        guestDiscipline: 'ski',
        guestAgeYears: 25,
        notificationLocale: language,
        difficulty,
        notes: notes.trim() || undefined,
      });
      if (!credential) throw new Error('Guest booking credential was not returned.');
      rememberGuestReservation('lesson', targetInstructor.id, credential.bookingId);
      setGuestCreatedBookingId(credential.bookingId);
      try {
        setGuestReservation(await loadGuestSingleLessonBooking(credential.bookingId));
      } catch {
        setGuestRefreshError(true);
      }
    } catch (err) {
      const presented = presentBookingCommandError(err);
      if (presented.code === 'guest_reservation_limit') {
        bookingAttemptIdRef.current = null;
        setGuestQuotaError(true);
      } else {
        addNotification('error', t('bookingError'), presented.message);
      }
      if (presented.shouldRefresh) {
        setOccupancyRefreshNonce((current) => current + 1);
        setTime('');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const refreshGuestStatus = async () => {
    if (!guestCreatedBookingId || guestRefreshing) return;
    setGuestRefreshing(true);
    try {
      const refreshed = await loadGuestSingleLessonBooking(guestCreatedBookingId);
      setGuestReservation((current) =>
        current?.lifecycle.status === 'cancelled' &&
        (refreshed.revision < current.revision || refreshed.lifecycle.status !== 'cancelled')
          ? current
          : refreshed
      );
      setGuestRefreshError(false);
    } catch {
      setGuestRefreshError(true);
    } finally {
      setGuestRefreshing(false);
    }
  };

  const cancelPendingGuestBooking = async () => {
    if (!guestCreatedBookingId || guestReservation?.lifecycle.status !== 'pending') return false;
    const credential = readGuestBookingCredential(guestCreatedBookingId).credential;
    if (!credential) {
      addNotification('error', t('requestFailed'), t('guestCancelFailed'));
      return false;
    }
    try {
      await requestCancellation({
        bookingId: guestCreatedBookingId,
        expectedRevision: guestReservation.revision,
        idempotencyKey: deriveCancellationIdempotencyKey(guestCreatedBookingId, guestReservation.revision),
        exercisedCapability: 'account_owner',
        guestCredential: credential,
      });
      setGuestReservation({
        ...guestReservation,
        revision: guestReservation.revision + 1,
        lifecycle: { status: 'cancelled', reasonCode: 'guest_cancelled' },
      } as LessonBookingReadModel);
      addNotification('success', t('guestCancelledTitle'), t('guestCancelledBody'));
      try {
        const refreshed = await loadGuestSingleLessonBooking(guestCreatedBookingId);
        if (refreshed.revision <= guestReservation.revision || refreshed.lifecycle.status !== 'cancelled') {
          throw new Error('Cancellation read model has not caught up.');
        }
        setGuestReservation(refreshed);
        setGuestRefreshError(false);
      } catch {
        setGuestRefreshError(true);
        addNotification('warning', t('cabinetCancellationRefreshWarning'), t('cabinetCancellationRefreshWarningDesc'));
      }
      return true;
    } catch (error) {
      const presented = presentCancellationError(error, t as (key: string) => string, true);
      addNotification('error', t('requestFailed'), presented.message);
      try {
        setGuestReservation(await loadGuestSingleLessonBooking(guestCreatedBookingId));
      } catch {
        setGuestRefreshError(true);
      }
      return false;
    }
  };

  const checkPreviousGuestStatus = async () => {
    if (!targetInstructor || guestLookupInFlightRef.current) return;
    const bookingId = rememberedGuestReservation('lesson', targetInstructor.id);
    if (!bookingId) return;
    guestLookupInFlightRef.current = true;
    setGuestRefreshing(true);
    setGuestLookupError(null);
    try {
      const reservation = await loadGuestSingleLessonBooking(bookingId);
      setGuestReservation(reservation);
      setGuestCreatedBookingId(bookingId);
      setGuestRefreshError(false);
    } catch (error) {
      if (isUnusableGuestReservationError(error)) {
        forgetGuestReservation('lesson', targetInstructor.id, bookingId);
        setGuestLookupError('stale');
      } else {
        setGuestLookupError('recoverable');
      }
    } finally {
      guestLookupInFlightRef.current = false;
      setGuestRefreshing(false);
    }
  };

  const closeGuestStatus = () => {
    if (guestReservation?.lifecycle.status === 'cancelled' && targetInstructor) {
      forgetGuestReservation('lesson', targetInstructor.id, guestCreatedBookingId ?? undefined);
    }
    onClose();
  };

  const startNewGuestBooking = () => {
    if (targetInstructor) {
      forgetGuestReservation('lesson', targetInstructor.id, guestCreatedBookingId ?? undefined);
    }
    bookingAttemptIdRef.current = null;
    setGuestCreatedBookingId(null);
    setGuestReservation(undefined);
    setGuestRefreshError(false);
    setGuestLookupError(null);
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
    if (effectiveParticipantIds.length === 0) {
      addNotification('warning', t('missingDetails'), 'Select a participant');
      return;
    }
    if (lessonSettingsUnavailable) {
      addNotification(
        'warning',
        t('bookingError'),
        language === 'ru'
          ? 'Канонические настройки урока ещё не заданы.'
          : 'Canonical lesson settings are not configured.'
      );
      return;
    }
    if (participantSelectionExceedsMax) {
      addNotification(
        'warning',
        t('bookingError'),
        language === 'ru'
          ? `Можно выбрать не более ${maxParticipantsPerLesson} участников.`
          : `Select no more than ${maxParticipantsPerLesson} participants.`
      );
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
        .filter((participant) => effectiveParticipantIds.includes(participant.participantId))
        .map((participant) => participant.authority);

      try {
        const createResult = await createAuthenticatedBooking({
          instructorId: targetInstructor.id,
          participantIds: effectiveParticipantIds,
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
        if (createResult?.refreshFailed) {
          addNotification(
            'warning',
            t('postCreateRefreshFailedTitle'),
            t('postCreateRefreshFailedBody')
          );
        }
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        onClose();
      } catch (err) {
        const presented = presentBookingCommandError(err);
        if (presented.code === 'participant_conflict' && presented.correlationId) {
          logger.warn('Booking participant_conflict', {
            correlationId: presented.correlationId,
            code: presented.code,
          });
        }
        addNotification('error', t('bookingError'), presented.message);
        if (presented.shouldRefresh) {
          setOccupancyRefreshNonce((current) => current + 1);
          if (presented.code !== 'participant_conflict') {
            setTime('');
          }
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
    onClose: closeGuestStatus,
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
    guestQuotaError,
    guestCreatedBookingId,
    guestReservation,
    guestRefreshError,
    guestRefreshing,
    guestLookupError,
    refreshGuestStatus,
    cancelPendingGuestBooking,
    checkPreviousGuestStatus,
    closeGuestStatus,
    startNewGuestBooking,
    previousGuestReservationId: targetInstructor
      ? rememberedGuestReservation('lesson', targetInstructor.id)
      : null,
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
    additionalParticipantSurchargePerHourKzt,
    maxParticipantsPerLesson,
    pricingSettingsLoading,
    lessonSettingsUnavailable,
    participantSelectionExceedsMax,
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
