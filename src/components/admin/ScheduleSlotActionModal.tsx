import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Check,
  Clock,
  Link2,
  Loader2,
  MessageSquare,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import type { Booking, Course, Instructor, UserProfile } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { BookingChatModal } from '../BookingChatModal';
import { LinkGuestBookingModal } from './LinkGuestBookingModal';
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
  onDeleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
}

interface ActiveSlotDialogProps {
  activeSlot: ActiveScheduleSlot;
  selectedDate: string;
  bookings: Booking[];
  courses: Course[];
  usersList: UserProfile[];
  onClose: () => void;
  onDeleteRequest: (id: string) => void;
  onOpenChat: (booking: Booking) => void;
  onAddBooking?: (booking: Booking) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
}

const ActiveSlotDialog: React.FC<ActiveSlotDialogProps> = ({
  activeSlot,
  selectedDate,
  bookings,
  courses,
  usersList,
  onClose,
  onDeleteRequest,
  onOpenChat,
  onAddBooking,
  onRescheduleBooking,
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
  const [bookingDifficulty, setBookingDifficulty] = useState<'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle'>('beginner');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isSlotActionSubmitting, setIsSlotActionSubmitting] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [newMoveDate, setNewMoveDate] = useState(activeSlot.booking?.date || selectedDate);
  const [newMoveTime, setNewMoveTime] = useState(activeSlot.booking?.time || activeSlot.time);

  const availableMoveTimeSlots = useMemo(() => {
    if (!activeSlot.booking) return [];
    return getAvailableMoveTimeSlots({
      bookings,
      courses,
      instructorId: activeSlot.instructor.id,
      date: newMoveDate,
      durationHours: activeSlot.booking.durationHours,
      excludeBookingId: activeSlot.booking.id,
    });
  }, [activeSlot, newMoveDate, bookings, courses]);

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
      if (modalTab === 'break' && availableBreakDurations.length > 0 && !availableBreakDurations.includes(blockDuration)) {
        setBlockDuration(availableBreakDurations[0]);
      } else if (modalTab === 'booking' && availableBookingDurations.length > 0 && !availableBookingDurations.includes(bookingDuration)) {
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
        if (hasScheduleOverlap({
          bookings,
          courses,
          instructorId: activeSlot.instructor.id,
          date: selectedDate,
          time: activeSlot.time,
          durationHours: blockDuration,
        })) {
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
          notes: blockNotes.trim() || (t('breakLabel'))
        };
        await onAddBooking(newBlock);
        addNotification(
          'success',
          t('breakAdded'),
          `${t('breakAddedDescPrefix')} ${activeSlot.instructor.name} ${t('breakAddedDescAt')} ${activeSlot.time}.`
        );
      } else if (modalTab === 'day_off') {
        if (hasScheduleOverlap({
          bookings,
          courses,
          instructorId: activeSlot.instructor.id,
          date: selectedDate,
          time: '08:00',
          durationHours: 11,
        })) {
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
          notes: t('dayOffLabel')
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
        if (hasScheduleOverlap({
          bookings,
          courses,
          instructorId: activeSlot.instructor.id,
          date: selectedDate,
          time: activeSlot.time,
          durationHours: bookingDuration,
        })) {
          addNotification('error', t('conflictDetected'), t('conflictBookingDesc'));
          setIsSlotActionSubmitting(false);
          return;
        }

        const matchedClient = usersList.find(user => user.uid === selectedClientUid);
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
          notes: bookingNotes.trim() || ""
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
    if (!activeSlot.booking || !onRescheduleBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (hasScheduleOverlap({
        bookings,
        courses,
        instructorId: activeSlot.instructor.id,
        date: newMoveDate,
        time: newMoveTime,
        durationHours: activeSlot.booking.durationHours,
        excludeBookingId: activeSlot.booking.id,
      })) {
        addNotification('error', t('conflictDetected'), t('conflictRescheduleDesc'));
        setIsSlotActionSubmitting(false);
        return;
      }

      await onRescheduleBooking(activeSlot.booking.id, newMoveDate, newMoveTime);
      addNotification('success', t('scheduleUpdated'), t('scheduleUpdatedDesc'));
      onClose();
    } catch (err) {
      addNotification('error', t('updateFailed'), t('moveSessionFailed'));
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-md p-6 shadow-2xl relative space-y-4 transition-colors duration-300 animate-scale-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--ink-dim)] hover:text-[var(--ink)] border border-[var(--border)] bg-black/5 hover:bg-black/10 transition p-1 rounded-none cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div>
          <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
            {activeSlot.booking ? (t('manageScheduleBlock')) : (t('scheduleAction'))}
          </h4>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-1.5">
            {activeSlot.instructor.name} • {selectedDate} @ {activeSlot.time}
          </p>
        </div>

        {activeSlot.booking ? (
          <form onSubmit={handleSlotMoveSubmit} className="space-y-4">
            <div className="bg-black/10 p-3 rounded-none border border-[var(--border)] space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
                {t('currentDetails')}
              </div>
              <div className="text-xs text-[var(--ink-dim)]">
                <strong>{t('typeLabel')}:</strong>{' '}
                {activeSlot.booking.userId === 'system_block_break'
                  ? (t('breakLabel'))
                  : activeSlot.booking.userId === 'system_block_day_off'
                    ? (t('dayOffLabel'))
                    : (`${t('lessonWithClientPrefix')} (${usersList.find(user => user.uid === activeSlot.booking?.userId)?.displayName || activeSlot.booking?.guestName || (activeSlot.booking?.isGuest || activeSlot.booking?.userId?.startsWith('guest_') ? (activeSlot.booking?.guestName ? `${activeSlot.booking.guestName} (${t('guestBadge') || 'Гость'})` : (t('guestBadge') || 'Гость')) : t('clientFallback'))})`)}
              </div>
              {(activeSlot.booking.guestPhone || activeSlot.booking.guestEmail) && (
                <div className="text-xs text-[var(--ink-dim)] space-y-0.5 font-mono">
                  {activeSlot.booking.guestPhone && (
                    <div><strong>Тел:</strong> <a href={`tel:${activeSlot.booking.guestPhone}`} className="text-sky-600 dark:text-sky-400 hover:underline">{activeSlot.booking.guestPhone}</a></div>
                  )}
                  {activeSlot.booking.guestEmail && (
                    <div><strong>Email:</strong> <a href={`mailto:${activeSlot.booking.guestEmail}`} className="text-sky-600 dark:text-sky-400 hover:underline">{activeSlot.booking.guestEmail}</a></div>
                  )}
                </div>
              )}
              {activeSlot.booking.notes && (
                <div className="text-xs text-[var(--ink-dim)] italic">
                  "{activeSlot.booking.notes}"
                </div>
              )}
              {activeSlot.booking.status === 'pending_cancellation' && activeSlot.booking.cancellationReason && (
                <div className="text-xs text-rose-400 font-mono bg-rose-955/20 px-2.5 py-1.5 border border-rose-900/40 mt-1 rounded-none">
                  <strong>{t('cancelReasonRequired')}:</strong>{' '}
                  {activeSlot.booking.cancellationReason}
                </div>
              )}

              {activeSlot.booking.userId !== 'system_block_break' && activeSlot.booking.userId !== 'system_block_day_off' && (
                <>
                  {(activeSlot.booking.isGuest || activeSlot.booking.userId?.startsWith('guest_')) && (
                    <button
                      type="button"
                      onClick={() => setIsLinkModalOpen(true)}
                      className="w-full mt-2.5 py-2 px-3 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-none text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Link2 className="w-4 h-4" />
                      {t('linkToClientBtn')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenChat(activeSlot.booking!)}
                    className="w-full mt-2.5 py-2.5 px-3 border border-accent-soft bg-accent-muted hover:bg-accent-muted hover:border-accent text-accent rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {t('openChatDiscussion')}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-3">
              <h5 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                {t('rescheduleMove')}
              </h5>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('selectDate')}
                  </label>
                  <input
                    type="date"
                    required
                    value={newMoveDate}
                    onChange={(event) => setNewMoveDate(event.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('newStartTime')}
                  </label>
                  <select
                    required
                    value={newMoveTime}
                    onChange={(event) => setNewMoveTime(event.target.value)}
                    disabled={availableMoveTimeSlots.length === 0}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                  >
                    {availableMoveTimeSlots.length === 0 ? (
                      <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{t('noSlotsAvailable')}</option>
                    ) : (
                      availableMoveTimeSlots.map((time: string) => (
                        <option key={time} value={time} className="bg-[var(--bg)] text-[var(--ink)]">{time}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

            {activeSlot.booking.status === 'confirmed' && (
              <button
                type="button"
                onClick={async () => {
                  if (onCompleteBooking) {
                    setIsSlotActionSubmitting(true);
                    await onCompleteBooking(activeSlot.booking!.id);
                    setIsSlotActionSubmitting(false);
                    onClose();
                  }
                }}
                disabled={isSlotActionSubmitting}
                className="w-full py-2.5 border border-emerald-900/40 bg-emerald-950/20 hover:bg-emerald-955/40 hover:border-emerald-500 text-emerald-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer mb-2"
              >
                <Check className="w-4 h-4" />
                {t('markLessonCompleted')}
              </button>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => onDeleteRequest(activeSlot.booking!.id)}
                className="flex-1 py-2.5 border border-rose-900/40 bg-rose-955/20 hover:bg-rose-955/40 hover:border-rose-500 text-rose-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {t('deleteCancelBlock')}
              </button>

              <button
                type="submit"
                disabled={isSlotActionSubmitting}
                className="flex-1 py-2 px-3 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isSlotActionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('applyMove')}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSlotActionSubmit} className="space-y-4">
            <div className="flex bg-black/10 p-1 border border-[var(--border)] rounded-none">
              {(['break', 'day_off', 'booking'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setModalTab(tab)}
                  className={`flex-1 py-1.5 text-center text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer rounded-none ${
                    modalTab === tab
                      ? 'bg-[var(--ink)] text-[var(--bg)] font-bold'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {tab === 'break' && (t('breakLabel'))}
                  {tab === 'day_off' && (t('dayOffLabel'))}
                  {tab === 'booking' && (t('lessonTab'))}
                </button>
              ))}
            </div>

            {modalTab === 'break' && (
              <div className="space-y-3 animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('breakDuration')}
                  </label>
                  <select
                    value={blockDuration}
                    onChange={(event) => setBlockDuration(Number(event.target.value))}
                    disabled={availableBreakDurations.length === 0}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                  >
                    {availableBreakDurations.length === 0 ? (
                      <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{t('noHoursAvailable')}</option>
                    ) : (
                      availableBreakDurations.map((duration: number) => (
                        <option key={duration} value={duration} className="bg-[var(--bg)] text-[var(--ink)]">
                          {duration} {duration === 1 ? (t('hourSingular')) : (t('hoursPlural'))}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('notesTitle')}
                  </label>
                  <input
                    type="text"
                    value={blockNotes}
                    onChange={(event) => setBlockNotes(event.target.value)}
                    placeholder={t('lunchBreakPlaceholder')}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                  />
                </div>
              </div>
            )}

            {modalTab === 'day_off' && (
              <div className="p-3 bg-black/10 border border-[var(--border)] text-xs text-[var(--ink-dim)] leading-relaxed animate-fade-in space-y-2 rounded-none">
                <div className="font-serif text-xs font-light text-[var(--ink)] flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-[var(--ink-dim)]" />
                  {t('fullDayOff')}
                </div>
                <p>{t('fullDayOffDesc')}</p>
              </div>
            )}

            {modalTab === 'booking' && (
              <div className="space-y-3 animate-fade-in">
                {!activeSlot.instructor.isAvailable && (
                  <div className="bg-rose-955/20 border border-rose-900/40 p-3 text-xs text-rose-400 rounded-none font-mono">
                    <p className="font-bold">⚠️ {t('instructorUnavailableTitle')}</p>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {`${activeSlot.instructor.name} ${t('instructorUnavailableSlotDesc')}`}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('selectClient')}
                  </label>
                  <select
                    required
                    value={selectedClientUid}
                    onChange={(event) => setSelectedClientUid(event.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer"
                  >
                    <option value="" disabled className="bg-[var(--bg)] text-[var(--ink)]">
                      {t('chooseRegisteredClient')}
                    </option>
                    {usersList.map((client) => (
                      <option key={client.uid} value={client.uid} className="bg-[var(--bg)] text-[var(--ink)] font-mono">
                        {client.displayName} ({client.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                      {t('hoursLabel')}
                    </label>
                    <select
                      value={bookingDuration}
                      onChange={(event) => setBookingDuration(Number(event.target.value))}
                      disabled={availableBookingDurations.length === 0}
                      className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                    >
                      {availableBookingDurations.length === 0 ? (
                        <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{t('noHoursAvailable')}</option>
                      ) : (
                        availableBookingDurations.map((duration: number) => (
                          <option key={duration} value={duration} className="bg-[var(--bg)] text-[var(--ink)]">
                            {duration} {duration === 1 ? (t('hourSingular')) : (t('hoursPlural'))}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                      {t('skillLevel')}
                    </label>
                    <select
                      value={bookingDifficulty}
                      onChange={(event) => setBookingDifficulty(event.target.value as typeof bookingDifficulty)}
                      className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer"
                    >
                      <option value="beginner" className="bg-[var(--bg)] text-[var(--ink)]">{t('difficultyBeginner')}</option>
                      <option value="intermediate" className="bg-[var(--bg)] text-[var(--ink)]">{t('difficultyIntermediate')}</option>
                      <option value="advanced" className="bg-[var(--bg)] text-[var(--ink)]">{t('difficultyAdvanced')}</option>
                      <option value="freeride" className="bg-[var(--bg)] text-[var(--ink)]">{t('difficultyFreeride')}</option>
                      <option value="freestyle" className="bg-[var(--bg)] text-[var(--ink)]">{t('difficultyFreestyle')}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('bookingNotesAdmin')}
                  </label>
                  <input
                    type="text"
                    value={bookingNotes}
                    onChange={(event) => setBookingNotes(event.target.value)}
                    placeholder={t('bookingNotesPlaceholder')}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2.5 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
              >
                {t('cancel')}
              </button>

              <button
                type="submit"
                disabled={isSlotActionSubmitting || (modalTab === 'booking' && !activeSlot.instructor.isAvailable)}
                className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer text-center"
              >
                {isSlotActionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('saveSchedule')}
              </button>
            </div>
          </form>
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
>(({
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
  onDeleteBooking,
  onCancelBooking,
  onCompleteBooking,
  onLinkGuestBooking,
}, ref) => {
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
      }
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
          bookings={bookings}
          courses={courses}
          usersList={usersList}
          onClose={onClose}
          onDeleteRequest={handleSlotDeleteClick}
          onOpenChat={setSelectedChatBooking}
          onAddBooking={onAddBooking}
          onRescheduleBooking={onRescheduleBooking}
          onCompleteBooking={onCompleteBooking}
          onLinkGuestBooking={onLinkGuestBooking}
        />
      )}

      {confirmModal && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-sm p-6 shadow-2xl relative space-y-4 animate-scale-up">
            <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
              <Shield className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {t('confirmAction')}
            </h4>
            <p className="text-xs text-[var(--ink-dim)] leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-2.5 pt-2">
              <button type="button" onClick={() => setConfirmModal(null)} className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center">
                {t('cancel')}
              </button>
              <button type="button" onClick={async () => { const action = confirmModal.onConfirm; setConfirmModal(null); await action(); }} className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center">
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
});

ScheduleSlotActionModal.displayName = 'ScheduleSlotActionModal';
