import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Shield, X } from 'lucide-react';
import type { Booking, Course, Instructor, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { BodyScrollLock } from '../../../../ui/BodyScrollLock';
import { useNotifications } from '../../../../features/notifications';
import { BookingChatModal } from '../../../../features/bookings';
import { LinkGuestBookingModal } from '../bookings/LinkGuestBookingModal';
import { ActiveSlotDetails } from './../schedule/slot-modal/ActiveSlotDetails';
import { ActiveSlotMoveForm } from './../schedule/slot-modal/ActiveSlotMoveForm';
import { ActiveSlotCreateForm } from './../schedule/slot-modal/ActiveSlotCreateForm';
import {
  getAvailableMoveTimeSlots,
  getAvailableScheduleDurations,
  hasScheduleOverlap,
} from './scheduleOverlap';

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
  onAddBooking?: (booking: Booking) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onReassignInstructor?: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
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
  onAddBooking?: (booking: Booking) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onReassignInstructor?: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
}

const isReassignableBooking = (booking: Booking): boolean =>
  !booking.instructorId.startsWith('course_') &&
  booking.userId !== 'system_block_break' &&
  booking.userId !== 'system_block_day_off' &&
  booking.status !== 'cancelled' &&
  booking.status !== 'completed' &&
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
  onCompleteBooking,
  onLinkGuestBooking,
}) => {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const [modalTab, setModalTab] = useState<'break' | 'day_off' | 'booking'>('break');
  const [blockDuration, setBlockDuration] = useState(1);
  const [blockNotes, setBlockNotes] = useState('');
  const [selectedClientUid, setSelectedClientUid] = useState(usersList[0]?.uid || '');
  const [bookingDuration, setBookingDuration] = useState(1);
  const [bookingDifficulty, setBookingDifficulty] = useState<
    'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle'
  >('beginner');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isSlotActionSubmitting, setIsSlotActionSubmitting] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [newMoveDate, setNewMoveDate] = useState(activeSlot.booking?.date || selectedDate);
  const [newMoveTime, setNewMoveTime] = useState(activeSlot.booking?.time || activeSlot.time);
  const [newInstructorId, setNewInstructorId] = useState(
    activeSlot.booking?.instructorId || activeSlot.instructor.id
  );

  const canReassignInstructor = Boolean(
    activeSlot.booking && isReassignableBooking(activeSlot.booking) && onReassignInstructor
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
      durationHours: activeSlot.booking.durationHours,
      excludeBookingId: activeSlot.booking.id,
    });
  }, [activeSlot, newMoveDate, newInstructorId, bookings, courses]);

  useEffect(() => {
    if (activeSlot.booking && availableMoveTimeSlots.length > 0) {
      if (!availableMoveTimeSlots.includes(newMoveTime)) {
        setNewMoveTime(availableMoveTimeSlots[0]);
      }
    }
  }, [availableMoveTimeSlots, newMoveTime, activeSlot]);

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

        if (!selectedClientUid) {
          addNotification('warning', t('missingClientTitle'), t('selectClientPlease'));
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

        const matchedClient = usersList.find((user) => user.uid === selectedClientUid);
        const bookingPrice = activeSlot.instructor.pricePerHour * bookingDuration;

        if (matchedClient && matchedClient.balanceUSD < bookingPrice) {
          addNotification(
            'error',
            t('insufficientFunds'),
            `${t('clientBalanceDescPrefix')} ${matchedClient.displayName} ${t('clientBalanceDescMiddle')} ${matchedClient.balanceUSD}, ${t('clientBalanceDescSuffix')} ${bookingPrice}.`
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBooking: Booking = {
          id: `booking_${Math.random().toString(36).substring(2, 9)}`,
          userId: selectedClientUid,
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
          `${t('manualBookingDescPrefix')} ${matchedClient?.displayName || t('clientFallback')} ${t('manualBookingDescWith')} ${activeSlot.instructor.name}.`
        );
      }
      onClose();
    } catch (err) {
      addNotification('error', t('actionFailedTitle'), t('scheduleUpdateFailed'));
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

    if (!instructorChanged && !scheduleChanged) {
      onClose();
      return;
    }

    if (instructorChanged && !onReassignInstructor) return;
    if (!instructorChanged && !onRescheduleBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (
        hasScheduleOverlap({
          bookings,
          courses,
          instructorId: newInstructorId,
          date: newMoveDate,
          time: newMoveTime,
          durationHours: activeSlot.booking.durationHours,
          excludeBookingId: activeSlot.booking.id,
        })
      ) {
        addNotification('error', t('conflictDetected'), t('conflictRescheduleDesc'));
        setIsSlotActionSubmitting(false);
        return;
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

        await onReassignInstructor!(
          activeSlot.booking.id,
          targetInstructor,
          newMoveDate,
          newMoveTime
        );
        addNotification('success', t('lessonReassigned'), t('lessonReassignedDesc'));
      } else {
        await onRescheduleBooking!(activeSlot.booking.id, newMoveDate, newMoveTime);
        addNotification('success', t('scheduleUpdated'), t('scheduleUpdatedDesc'));
      }
      onClose();
    } catch (err) {
      addNotification('error', t('updateFailed'), t('moveSessionFailed'));
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <BodyScrollLock />
      <div className="ui-modal bg-[var(--card-bg)] border border-[var(--border)] text-[var(--ink)] rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6 shadow-2xl relative space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
            {activeSlot.booking ? t('manageScheduleBlock') : t('scheduleAction')}
          </h4>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-1.5">
            {activeSlot.instructor.name} • {selectedDate} @ {activeSlot.time}
          </p>
        </div>

        {activeSlot.booking ? (
          <>
            <ActiveSlotDetails
              booking={activeSlot.booking}
              usersList={usersList}
              onOpenChat={onOpenChat}
              onOpenLinkModal={() => setIsLinkModalOpen(true)}
            />
            <ActiveSlotMoveForm
              booking={activeSlot.booking}
              canReassignInstructor={canReassignInstructor}
              newInstructorId={newInstructorId}
              setNewInstructorId={setNewInstructorId}
              availableInstructors={availableInstructors}
              newMoveDate={newMoveDate}
              setNewMoveDate={setNewMoveDate}
              newMoveTime={newMoveTime}
              setNewMoveTime={setNewMoveTime}
              availableMoveTimeSlots={availableMoveTimeSlots}
              isSlotActionSubmitting={isSlotActionSubmitting}
              onCompleteBooking={onCompleteBooking}
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
            selectedClientUid={selectedClientUid}
            setSelectedClientUid={setSelectedClientUid}
            usersList={usersList}
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
      </div>

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
    </div>,
    document.body
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
      onDeleteBooking,
      onCancelBooking,
      onCompleteBooking,
      onLinkGuestBooking,
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
            addNotification('error', t('configSaveError'), t('removeBlockFailed'));
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
            onCompleteBooking={onCompleteBooking}
            onLinkGuestBooking={onLinkGuestBooking}
          />
        )}

        {confirmModal &&
          createPortal(
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-fade-in">
              <BodyScrollLock />
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-sm p-6 shadow-2xl relative space-y-4 animate-scale-up">
                <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
                  <Shield className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
                  {t('confirmAction')}
                </h4>
                <p className="text-xs text-[var(--ink-dim)] leading-relaxed">
                  {confirmModal.message}
                </p>
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmModal(null)}
                    className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
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
                    className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
                  >
                    {t('confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {selectedChatBooking && (
          <BookingChatModal
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
