import { AdminModal } from '../AdminModal';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { Booking, Course, Instructor, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { resolveInstructorHourlyRateKztForDisplay } from '../../../../domain/pricing';
import { useNotifications } from '../../../../features/notifications';
import { BookingChatModal } from '../../../../features/bookings';
import { InsufficientFundsError } from '../../../../features/bookings/bookingTransactions';
import {
  CanonicalCommandClientError,
  mapCanonicalErrorMessage,
} from '../../../../lib/canonical/mapCanonicalCommandError';
import type { AdminManagedParticipantSelection } from '../../identity';
import { accountDirectoryOptionFromClient } from '../../identity/accountDirectorySearch';
import { LinkGuestBookingModal } from '../bookings/LinkGuestBookingModal';
import { ActiveSlotDetails } from './../schedule/slot-modal/ActiveSlotDetails';
import { ActiveSlotMoveForm } from './../schedule/slot-modal/ActiveSlotMoveForm';
import { ActiveSlotCreateForm } from './../schedule/slot-modal/ActiveSlotCreateForm';
import type { PlannerCreateOccupancyInput } from './scheduleContracts';
import {
  getAvailableMoveTimeSlots,
  getAvailableScheduleDurations,
  hasScheduleOverlap,
} from './scheduleOverlap';
import { isPlannerLessonBooking } from './scheduleUtils';

const mutationErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof CanonicalCommandClientError ? mapCanonicalErrorMessage(error.code) : fallback;

type ReassignInstructorFn = (
  id: string,
  newInstructor: Instructor,
  newDate?: string,
  newTime?: string,
  options?: { allowNegativeBalance?: boolean }
) => Promise<void>;

interface InsufficientFundsPrompt {
  currentBalance: number;
  required: number;
  targetInstructor: Instructor;
  date: string;
  time: string;
}

export interface ActiveScheduleSlot {
  instructor: Instructor;
  time: string;
  booking?: Booking;
}

export interface ScheduleSlotActionModalHandle {
  requestDelete: (id: string) => void;
}

interface ScheduleSlotActionModalProps {
  activeSlot: ActiveScheduleSlot | null;
  selectedDate: string;
  instructors: Instructor[];
  bookings: Booking[];
  courses: Course[];
  usersList: UserProfile[];
  adminProfile: UserProfile;
  onClose: () => void;
  onAddBooking?: (booking: PlannerCreateOccupancyInput) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onReassignInstructor?: ReassignInstructorFn;
  onChangeBookingDuration?: (id: string, durationHours: number) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
  onOpenLessonDetail?: (bookingId: string) => void;
  skipLegacyBalanceGate?: boolean;
}

interface ActiveSlotDialogProps {
  activeSlot: ActiveScheduleSlot;
  selectedDate: string;
  instructors: Instructor[];
  bookings: Booking[];
  courses: Course[];
  usersList: UserProfile[];
  onClose: () => void;
  onDeleteRequest: (id: string) => void;
  onOpenChat: (booking: Booking) => void;
  onAddBooking?: (booking: PlannerCreateOccupancyInput) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onReassignInstructor?: ReassignInstructorFn;
  onChangeBookingDuration?: (id: string, durationHours: number) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
  onOpenLessonDetail?: (bookingId: string) => void;
}

const isReassignableBooking = (booking: Booking): boolean =>
  !booking.instructorId.startsWith('course_') &&
  booking.userId !== 'system_block_break' &&
  booking.userId !== 'system_block_day_off' &&
  booking.status !== 'cancelled' &&
  booking.status !== 'completed' &&
  booking.status !== 'no_show' &&
  !booking.isDeleted;

const ActiveSlotDialog: React.FC<ActiveSlotDialogProps> = ({
  activeSlot,
  selectedDate,
  instructors,
  bookings,
  courses,
  usersList,
  onClose,
  onDeleteRequest,
  onOpenChat,
  onAddBooking,
  onRescheduleBooking,
  onReassignInstructor,
  onChangeBookingDuration,
  onCompleteBooking,
  onLinkGuestBooking,
  onOpenLessonDetail,
}) => {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const [modalTab, setModalTab] = useState<'break' | 'day_off' | 'booking'>('break');
  const [blockDuration, setBlockDuration] = useState(1);
  const [blockNotes, setBlockNotes] = useState('');
  const [createSelection, setCreateSelection] = useState<
    AdminManagedParticipantSelection | undefined
  >();
  const [createAccountId, setCreateAccountId] = useState<string | undefined>();
  const [bookingDuration, setBookingDuration] = useState(1);
  const [bookingDifficulty, setBookingDifficulty] = useState<string>('beginner');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isSlotActionSubmitting, setIsSlotActionSubmitting] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [insufficientFundsPrompt, setInsufficientFundsPrompt] =
    useState<InsufficientFundsPrompt | null>(null);
  const clientAccounts = useMemo(
    () =>
      usersList.flatMap((user) => {
        const option = accountDirectoryOptionFromClient(user);
        return option ? [option] : [];
      }),
    [usersList]
  );
  const [newMoveDate, setNewMoveDate] = useState(activeSlot.booking?.date || selectedDate);
  const [newMoveTime, setNewMoveTime] = useState(activeSlot.booking?.time || activeSlot.time);
  const [newMoveDuration, setNewMoveDuration] = useState(activeSlot.booking?.durationHours || 1);
  const [newInstructorId, setNewInstructorId] = useState(
    activeSlot.booking?.instructorId || activeSlot.instructor.id
  );

  const setNewInstructorIdAndClearPrompt = (id: string) => {
    setInsufficientFundsPrompt(null);
    setNewInstructorId(id);
  };
  const setNewMoveDateAndClearPrompt = (date: string) => {
    setInsufficientFundsPrompt(null);
    setNewMoveDate(date);
  };
  const setNewMoveTimeAndClearPrompt = (time: string) => {
    setInsufficientFundsPrompt(null);
    setNewMoveTime(time);
  };
  const setNewMoveDurationAndClearPrompt = (duration: number) => {
    setInsufficientFundsPrompt(null);
    setNewMoveDuration(duration);
  };

  const canReassignInstructor = Boolean(
    activeSlot.booking && isReassignableBooking(activeSlot.booking) && onReassignInstructor
  );
  const canChangeDuration = Boolean(
    activeSlot.booking && isReassignableBooking(activeSlot.booking) && onChangeBookingDuration
  );
  const canCompleteLesson = Boolean(
    activeSlot.booking &&
    isPlannerLessonBooking(activeSlot.booking) &&
    activeSlot.booking.status === 'confirmed' &&
    onCompleteBooking
  );
  const canOpenLessonDetail = Boolean(
    activeSlot.booking && isPlannerLessonBooking(activeSlot.booking) && onOpenLessonDetail
  );

  const availableInstructors = useMemo(() => {
    const list = instructors.filter((instructor) => instructor.isAvailable);
    const current = instructors.find((instructor) => instructor.id === newInstructorId);
    if (current && !list.some((instructor) => instructor.id === current.id)) {
      return [current, ...list];
    }
    return list;
  }, [instructors, newInstructorId]);

  const availableMoveTimeSlots = useMemo(() => {
    if (!activeSlot.booking) return [];
    return getAvailableMoveTimeSlots({
      bookings,
      courses,
      instructorId: newInstructorId,
      date: newMoveDate,
      durationHours: newMoveDuration,
      excludeBookingId: activeSlot.booking.id,
    });
  }, [activeSlot, newMoveDate, newInstructorId, newMoveDuration, bookings, courses]);

  const availableMoveDurations = useMemo(() => {
    if (!activeSlot.booking || !canChangeDuration) return [];
    const available = getAvailableScheduleDurations({
      bookings,
      courses,
      instructorId: newInstructorId,
      date: newMoveDate,
      time: newMoveTime,
      excludeBookingId: activeSlot.booking.id,
    });
    const current = activeSlot.booking.durationHours;
    return available.includes(current)
      ? available
      : [...available, current].sort((left, right) => left - right);
  }, [activeSlot, canChangeDuration, newInstructorId, newMoveDate, newMoveTime, bookings, courses]);

  useEffect(() => {
    if (activeSlot.booking && availableMoveTimeSlots.length > 0) {
      if (!availableMoveTimeSlots.includes(newMoveTime)) {
        setNewMoveTime(availableMoveTimeSlots[0]);
      }
    }
  }, [availableMoveTimeSlots, newMoveTime, activeSlot]);

  useEffect(() => {
    if (activeSlot.booking && availableMoveDurations.length > 0) {
      if (!availableMoveDurations.includes(newMoveDuration)) {
        setNewMoveDuration(availableMoveDurations[0]);
      }
    }
  }, [availableMoveDurations, newMoveDuration, activeSlot]);

  const availableBreakDurations = useMemo(() => {
    if (activeSlot.booking) return [];
    return getAvailableScheduleDurations({
      bookings,
      courses,
      instructorId: activeSlot.instructor.id,
      date: selectedDate,
      time: activeSlot.time,
    });
  }, [activeSlot, selectedDate, bookings, courses]);

  const availableBookingDurations = useMemo(() => {
    if (activeSlot.booking) return [];
    return getAvailableScheduleDurations({
      bookings,
      courses,
      instructorId: activeSlot.instructor.id,
      date: selectedDate,
      time: activeSlot.time,
    });
  }, [activeSlot, selectedDate, bookings, courses]);

  useEffect(() => {
    if (!activeSlot.booking) {
      if (
        modalTab === 'break' &&
        availableBreakDurations.length > 0 &&
        !availableBreakDurations.includes(blockDuration)
      ) {
        setBlockDuration(availableBreakDurations[0]);
      } else if (
        modalTab === 'booking' &&
        availableBookingDurations.length > 0 &&
        !availableBookingDurations.includes(bookingDuration)
      ) {
        setBookingDuration(availableBookingDurations[0]);
      }
    }
  }, [
    availableBreakDurations,
    availableBookingDurations,
    modalTab,
    activeSlot,
    blockDuration,
    bookingDuration,
  ]);

  const handleSlotActionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onAddBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (modalTab === 'break') {
        if (
          hasScheduleOverlap({
            bookings,
            courses,
            instructorId: activeSlot.instructor.id,
            date: selectedDate,
            time: activeSlot.time,
            durationHours: blockDuration,
          })
        ) {
          addNotification('error', t('conflictDetected'), t('conflictBreakDesc'));
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBlock: Booking = {
          id: `block_${Math.random().toString(36).substring(2, 9)}`,
          userId: 'system_block_break',
          instructorId: activeSlot.instructor.id,
          instructorName: activeSlot.instructor.name,
          instructorAvatar: activeSlot.instructor.avatarUrl,
          date: selectedDate,
          time: activeSlot.time,
          durationHours: blockDuration,
          totalPrice: 0,
          status: 'confirmed',
          difficulty: 'beginner',
          notes: blockNotes.trim() || t('breakLabel'),
        };
        await onAddBooking(newBlock);
        addNotification(
          'success',
          t('breakAdded'),
          `${t('breakAddedDescPrefix')} ${activeSlot.instructor.name} ${t('breakAddedDescAt')} ${activeSlot.time}.`
        );
      } else if (modalTab === 'day_off') {
        if (
          hasScheduleOverlap({
            bookings,
            courses,
            instructorId: activeSlot.instructor.id,
            date: selectedDate,
            time: '08:00',
            durationHours: 11,
          })
        ) {
          addNotification('error', t('conflictDetected'), t('conflictDayOffDesc'));
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBlock: Booking = {
          id: `block_${Math.random().toString(36).substring(2, 9)}`,
          userId: 'system_block_day_off',
          instructorId: activeSlot.instructor.id,
          instructorName: activeSlot.instructor.name,
          instructorAvatar: activeSlot.instructor.avatarUrl,
          date: selectedDate,
          time: '08:00',
          durationHours: 11,
          totalPrice: 0,
          status: 'confirmed',
          difficulty: 'beginner',
          notes: t('dayOffLabel'),
        };
        await onAddBooking(newBlock);
        addNotification(
          'success',
          t('dayOffSet'),
          `${t('dayOffSetDescPrefix')}${t('dayOffSetDescPrefix') ? ' ' : ''}${activeSlot.instructor.name} ${t('dayOffSetDescMiddle')} ${selectedDate}.`
        );
      } else if (modalTab === 'booking') {
        if (!activeSlot.instructor.isAvailable) {
          addNotification(
            'error',
            t('instructorUnavailableTitle'),
            `${activeSlot.instructor.name} ${t('instructorUnavailableDesc')}`
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        if (!createSelection && !createAccountId) {
          addNotification(
            'warning',
            t('missingParticipantTitle'),
            t('plannerSelectParticipantPlease')
          );
          setIsSlotActionSubmitting(false);
          return;
        }
        if (
          hasScheduleOverlap({
            bookings,
            courses,
            instructorId: activeSlot.instructor.id,
            date: selectedDate,
            time: activeSlot.time,
            durationHours: bookingDuration,
          })
        ) {
          addNotification('error', t('conflictDetected'), t('conflictBookingDesc'));
          setIsSlotActionSubmitting(false);
          return;
        }

        const payerAccountId = createSelection?.accountId ?? createAccountId;
        if (!payerAccountId) {
          addNotification(
            'warning',
            t('missingParticipantTitle'),
            t('plannerSelectParticipantPlease')
          );
          setIsSlotActionSubmitting(false);
          return;
        }
        const hourlyRateKzt = resolveInstructorHourlyRateKztForDisplay(activeSlot.instructor);
        if (hourlyRateKzt === undefined) {
          addNotification('error', t('actionFailedTitle'), t('instructorPriceUnavailable'));
          setIsSlotActionSubmitting(false);
          return;
        }
        const bookingPrice = hourlyRateKzt * bookingDuration;

        const newBooking: PlannerCreateOccupancyInput = {
          id: `booking_${Math.random().toString(36).substring(2, 9)}`,
          userId: payerAccountId,
          ...(createSelection ? { participantId: createSelection.participantId } : {}),
          instructorId: activeSlot.instructor.id,
          instructorName: activeSlot.instructor.name,
          instructorAvatar: activeSlot.instructor.avatarUrl,
          date: selectedDate,
          time: activeSlot.time,
          durationHours: bookingDuration,
          totalPrice: bookingPrice,
          status: 'confirmed',
          difficulty: bookingDifficulty,
          notes: bookingNotes.trim() || '',
        };
        await onAddBooking(newBooking);
        addNotification(
          'success',
          t('manualBookingAdded'),
          `${t('manualBookingDescPrefix')} ${createSelection?.displayName || t('clientFallback')} ${t('manualBookingDescWith')} ${activeSlot.instructor.name}.`
        );
      }
      onClose();
    } catch (err) {
      addNotification(
        'error',
        t('actionFailedTitle'),
        mutationErrorMessage(err, t('scheduleUpdateFailed'))
      );
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  const handleSlotMoveSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeSlot.booking) return;

    const instructorChanged =
      canReassignInstructor && newInstructorId !== activeSlot.booking.instructorId;
    const scheduleChanged =
      newMoveDate !== activeSlot.booking.date || newMoveTime !== activeSlot.booking.time;
    const durationChanged =
      canChangeDuration && newMoveDuration !== activeSlot.booking.durationHours;
    const shrinking = durationChanged && newMoveDuration < activeSlot.booking.durationHours;

    if (!instructorChanged && !scheduleChanged && !durationChanged) {
      onClose();
      return;
    }

    if (instructorChanged && !onReassignInstructor) return;
    if (!instructorChanged && scheduleChanged && !onRescheduleBooking) return;
    if (durationChanged && !onChangeBookingDuration) return;

    setIsSlotActionSubmitting(true);
    setInsufficientFundsPrompt(null);
    try {
      if (
        hasScheduleOverlap({
          bookings,
          courses,
          instructorId: newInstructorId,
          date: newMoveDate,
          time: newMoveTime,
          durationHours: newMoveDuration,
          excludeBookingId: activeSlot.booking.id,
        })
      ) {
        addNotification('error', t('conflictDetected'), t('conflictRescheduleDesc'));
        setIsSlotActionSubmitting(false);
        return;
      }

      if (durationChanged && shrinking) {
        await onChangeBookingDuration!(activeSlot.booking.id, newMoveDuration);
      }

      if (instructorChanged) {
        const targetInstructor = instructors.find(
          (instructor) => instructor.id === newInstructorId
        );
        if (!targetInstructor) {
          addNotification('error', t('updateFailed'), t('moveSessionFailed'));
          setIsSlotActionSubmitting(false);
          return;
        }
        if (
          !targetInstructor.isAvailable &&
          targetInstructor.id !== activeSlot.booking.instructorId
        ) {
          addNotification(
            'error',
            t('instructorUnavailableTitle'),
            `${targetInstructor.name} ${t('instructorUnavailableDesc')}`
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const targetHourlyRateKzt = resolveInstructorHourlyRateKztForDisplay(targetInstructor);
        if (targetHourlyRateKzt === undefined) {
          addNotification('error', t('actionFailedTitle'), t('instructorPriceUnavailable'));
          setIsSlotActionSubmitting(false);
          return;
        }

        try {
          await onReassignInstructor!(
            activeSlot.booking.id,
            targetInstructor,
            newMoveDate,
            newMoveTime
          );
        } catch (error) {
          if (error instanceof InsufficientFundsError) {
            const fallbackRequired =
              Math.max(
                0,
                targetHourlyRateKzt * activeSlot.booking.durationHours -
                  (activeSlot.booking.totalPrice ?? 0)
              ) || 0;
            setInsufficientFundsPrompt({
              currentBalance: typeof error.currentBalance === 'number' ? error.currentBalance : 0,
              required: typeof error.required === 'number' ? error.required : fallbackRequired,
              targetInstructor,
              date: newMoveDate,
              time: newMoveTime,
            });
            setIsSlotActionSubmitting(false);
            return;
          }
          throw error;
        }
        addNotification('success', t('lessonReassigned'), t('lessonReassignedDesc'));
      } else if (scheduleChanged) {
        await onRescheduleBooking!(activeSlot.booking.id, newMoveDate, newMoveTime);
        addNotification('success', t('scheduleUpdated'), t('scheduleUpdatedDesc'));
      }
      if (durationChanged && !shrinking) {
        await onChangeBookingDuration!(activeSlot.booking.id, newMoveDuration);
      }
      if (durationChanged && !instructorChanged && !scheduleChanged) {
        addNotification('success', t('scheduleUpdated'), t('scheduleUpdatedDesc'));
      }
      onClose();
    } catch (err) {
      addNotification(
        'error',
        t('updateFailed'),
        mutationErrorMessage(err, t('moveSessionFailed'))
      );
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  const handleApproveNegativeBalance = async () => {
    if (!activeSlot.booking || !onReassignInstructor || !insufficientFundsPrompt) return;

    setIsSlotActionSubmitting(true);
    try {
      await onReassignInstructor(
        activeSlot.booking.id,
        insufficientFundsPrompt.targetInstructor,
        insufficientFundsPrompt.date,
        insufficientFundsPrompt.time,
        { allowNegativeBalance: true }
      );
      setInsufficientFundsPrompt(null);
      addNotification('success', t('lessonReassigned'), t('lessonReassignedDesc'));
      onClose();
    } catch (err) {
      addNotification(
        'error',
        t('updateFailed'),
        mutationErrorMessage(err, t('moveSessionFailed'))
      );
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  return (
    <AdminModal
      title={activeSlot.booking ? t('manageScheduleBlock') : t('scheduleAction')}
      closeLabel={t('cancel')}
      onClose={onClose}
      closeDisabled={isSlotActionSubmitting}
      width="md"
    >
      <p className="type-caption text-[var(--ink-dim)]">
        {activeSlot.instructor.name} • {selectedDate} @ {activeSlot.time}
      </p>
      {activeSlot.booking ? (
        <>
          <ActiveSlotDetails
            booking={activeSlot.booking}
            usersList={usersList}
            onOpenChat={onOpenChat}
            onOpenLinkModal={() => setIsLinkModalOpen(true)}
          />
          {insufficientFundsPrompt && (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2 type-caption text-amber-800 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1 font-sans">
                  <p className="font-bold">{t('reassignInsufficientFundsTitle')}</p>
                  <p>
                    {t('reassignInsufficientFundsDescPrefix')}{' '}
                    {insufficientFundsPrompt.currentBalance.toLocaleString('ru-RU')} ₸
                    {t('reassignInsufficientFundsDescMiddle')}
                    {insufficientFundsPrompt.required.toLocaleString('ru-RU')} ₸
                    {t('reassignInsufficientFundsDescSuffix')}
                  </p>
                  <p>
                    {t('reassignNegativeBalanceResultPrefix')}
                    {(
                      insufficientFundsPrompt.currentBalance - insufficientFundsPrompt.required
                    ).toLocaleString('ru-RU')}{' '}
                    ₸{t('reassignNegativeBalanceResultSuffix')}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={isSlotActionSubmitting}
                  onClick={() => void handleApproveNegativeBalance()}
                  className="flex-1 rounded-md bg-amber-600 px-3 py-2 type-button text-white transition hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                >
                  {t('reassignAllowNegativeBalance')}
                </button>
                <button
                  type="button"
                  disabled={isSlotActionSubmitting}
                  onClick={() => setInsufficientFundsPrompt(null)}
                  className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 type-button text-[var(--ink)] transition hover:bg-[var(--profile-bg)] disabled:opacity-50 cursor-pointer"
                >
                  {t('reassignCancelMove')}
                </button>
              </div>
            </div>
          )}
          <ActiveSlotMoveForm
            booking={activeSlot.booking}
            canReassignInstructor={canReassignInstructor}
            canChangeDuration={canChangeDuration}
            canCompleteLesson={canCompleteLesson}
            newInstructorId={newInstructorId}
            setNewInstructorId={setNewInstructorIdAndClearPrompt}
            availableInstructors={availableInstructors}
            newMoveDate={newMoveDate}
            setNewMoveDate={setNewMoveDateAndClearPrompt}
            newMoveTime={newMoveTime}
            setNewMoveTime={setNewMoveTimeAndClearPrompt}
            newMoveDuration={newMoveDuration}
            setNewMoveDuration={setNewMoveDurationAndClearPrompt}
            availableMoveTimeSlots={availableMoveTimeSlots}
            availableMoveDurations={availableMoveDurations}
            isSlotActionSubmitting={isSlotActionSubmitting}
            onCompleteBooking={canCompleteLesson ? onCompleteBooking : undefined}
            onOpenLessonDetail={canOpenLessonDetail ? onOpenLessonDetail : undefined}
            onDeleteRequest={onDeleteRequest}
            onSubmit={handleSlotMoveSubmit}
            onClose={onClose}
          />
        </>
      ) : (
        <ActiveSlotCreateForm
          instructor={activeSlot.instructor}
          modalTab={modalTab}
          setModalTab={setModalTab}
          blockDuration={blockDuration}
          setBlockDuration={setBlockDuration}
          availableBreakDurations={availableBreakDurations}
          blockNotes={blockNotes}
          setBlockNotes={setBlockNotes}
          createSelection={createSelection}
          setCreateSelection={setCreateSelection}
          onCreateAccountIdChange={setCreateAccountId}
          clientAccounts={clientAccounts}
          bookingDuration={bookingDuration}
          setBookingDuration={setBookingDuration}
          availableBookingDurations={availableBookingDurations}
          bookingDifficulty={bookingDifficulty}
          setBookingDifficulty={setBookingDifficulty}
          bookingNotes={bookingNotes}
          setBookingNotes={setBookingNotes}
          isSlotActionSubmitting={isSlotActionSubmitting}
          onSubmit={handleSlotActionSubmit}
          onClose={onClose}
        />
      )}

      {activeSlot.booking && (
        <LinkGuestBookingModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          booking={activeSlot.booking}
          usersList={usersList}
          onLinkBooking={async (bId, uId) => {
            if (onLinkGuestBooking) {
              await onLinkGuestBooking(bId, uId);
            }
            setIsLinkModalOpen(false);
            onClose();
          }}
        />
      )}
    </AdminModal>
  );
};

export const ScheduleSlotActionModal = forwardRef<
  ScheduleSlotActionModalHandle,
  ScheduleSlotActionModalProps
>(
  (
    {
      activeSlot,
      selectedDate,
      instructors,
      bookings,
      courses,
      usersList,
      adminProfile,
      onClose,
      onAddBooking,
      onRescheduleBooking,
      onReassignInstructor,
      onChangeBookingDuration,
      onDeleteBooking,
      onCancelBooking,
      onCompleteBooking,
      onLinkGuestBooking,
      onOpenLessonDetail,
      skipLegacyBalanceGate: _skipLegacyBalanceGate = false,
    },
    ref
  ) => {
    const { addNotification } = useNotifications();
    const { t } = useLanguage();
    const [confirmModal, setConfirmModal] = useState<{
      message: string;
      onConfirm: () => void | Promise<void>;
    } | null>(null);
    const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);

    const handleSlotDeleteClick = (id: string) => {
      const confirmMsg = t('deleteBlockConfirm');

      setConfirmModal({
        message: confirmMsg,
        onConfirm: async () => {
          try {
            if (onDeleteBooking) {
              await onDeleteBooking(id);
            } else {
              await onCancelBooking(id);
            }
            addNotification('success', t('blockRemoved'), t('blockRemovedDesc'));
            onClose();
          } catch (err) {
            addNotification(
              'error',
              t('configSaveError'),
              mutationErrorMessage(err, t('removeBlockFailed'))
            );
          }
        },
      });
    };

    useImperativeHandle(ref, () => ({
      requestDelete: handleSlotDeleteClick,
    }));

    return (
      <>
        {activeSlot && (
          <ActiveSlotDialog
            key={`${activeSlot.instructor.id}-${activeSlot.time}-${activeSlot.booking?.id || 'empty'}`}
            activeSlot={activeSlot}
            selectedDate={selectedDate}
            instructors={instructors}
            bookings={bookings}
            courses={courses}
            usersList={usersList}
            onClose={onClose}
            onDeleteRequest={handleSlotDeleteClick}
            onOpenChat={setSelectedChatBooking}
            onAddBooking={onAddBooking}
            onRescheduleBooking={onRescheduleBooking}
            onReassignInstructor={onReassignInstructor}
            onChangeBookingDuration={onChangeBookingDuration}
            onCompleteBooking={onCompleteBooking}
            onLinkGuestBooking={onLinkGuestBooking}
            onOpenLessonDetail={onOpenLessonDetail}
          />
        )}

        {confirmModal && (
          <AdminModal
            title={t('confirmAction')}
            closeLabel={t('cancel')}
            onClose={() => setConfirmModal(null)}
            width="sm"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="btn-secondary flex-1 px-4 py-3 type-button"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const action = confirmModal.onConfirm;
                    setConfirmModal(null);
                    await action();
                  }}
                  className="btn-primary flex-1 px-4 py-3"
                >
                  {t('confirm')}
                </button>
              </>
            }
          >
            <p className="type-caption text-[var(--ink-dim)]">{confirmModal.message}</p>
          </AdminModal>
        )}

        {selectedChatBooking && (
          <BookingChatModal
            fromAdminPanel
            booking={selectedChatBooking}
            currentUserProfile={adminProfile}
            onClose={() => setSelectedChatBooking(null)}
            instructors={instructors}
            usersList={usersList}
          />
        )}
      </>
    );
  }
);

ScheduleSlotActionModal.displayName = 'ScheduleSlotActionModal';
