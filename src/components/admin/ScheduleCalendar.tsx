import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { Instructor, Booking, UserProfile, Course } from '../../types';
import { useLanguage, translateCourse, parseCourseDates } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { BookingChatModal } from '../BookingChatModal';
import { formatDateLocalYMD, hourToMinutes, getWeekRange, getSpecialtyLabel } from './scheduleUtils';

interface ScheduleCalendarProps {
  instructors: Instructor[];
  bookings: Booking[];
  courses: Course[];
  usersList: UserProfile[];
  adminProfile: UserProfile;
  onAddBooking?: (booking: Booking) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
}

export const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  instructors,
  bookings,
  courses,
  usersList,
  adminProfile,
  onAddBooking,
  onRescheduleBooking,
  onDeleteBooking,
  onCancelBooking,
  onCompleteBooking,
}) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();

  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeSlotModal, setActiveSlotModal] = useState<{
    instructor: Instructor;
    time: string;
    booking?: Booking;
  } | null>(null);

  const selectedDate = useMemo(() => formatDateLocalYMD(currentDate), [currentDate]);

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Modal form states
  const [modalTab, setModalTab] = useState<'break' | 'day_off' | 'booking'>('break');
  const [blockDuration, setBlockDuration] = useState(1);
  const [blockNotes, setBlockNotes] = useState('');
  const [selectedClientUid, setSelectedClientUid] = useState('');
  const [bookingDuration, setBookingDuration] = useState(1);
  const [bookingDifficulty, setBookingDifficulty] = useState<'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle'>('beginner');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isSlotActionSubmitting, setIsSlotActionSubmitting] = useState(false);
  const [newMoveDate, setNewMoveDate] = useState('');
  const [newMoveTime, setNewMoveTime] = useState('');
  const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);

  // Schedule Helper methods
  const hasOverlap = (
    instructorId: string,
    date: string,
    time: string,
    durationHours: number,
    excludeBookingId?: string
  ): boolean => {
    const startMin = hourToMinutes(time);
    const endMin = startMin + durationHours * 60;

    const hasBookingOverlap = bookings.some((b) => {
      if (b.instructorId !== instructorId) return false;
      if (b.date !== date) return false;
      if (b.status === 'cancelled') return false;
      if (excludeBookingId && b.id === excludeBookingId) return false;

      const bStart = hourToMinutes(b.time);
      const bEnd = bStart + b.durationHours * 60;

      return startMin < bEnd && endMin > bStart;
    });

    if (hasBookingOverlap) return true;

    // Check group courses overlap
    const hasCourseOverlap = (courses || []).some((course) => {
      if (!course.instructorIds || !course.instructorIds.includes(instructorId)) return false;

      const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
      const startStr = formatDateLocalYMD(cStart);
      const endStr = formatDateLocalYMD(cEnd);

      if (date < startStr || date > endStr) return false;

      const cStartMin = hourToMinutes(cStartTime);
      const cEndMin = hourToMinutes(cEndTime);

      return startMin < cEndMin && endMin > cStartMin;
    });

    return hasCourseOverlap;
  };

  const availableMoveTimeSlots = useMemo(() => {
    if (!activeSlotModal?.booking) return [];
    const duration = activeSlotModal.booking.durationHours;
    const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

    return timeSlots.filter((slot) => {
      const start = hourToMinutes(slot);
      const end = start + duration * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00 (19 * 60 = 1140)

      return !hasOverlap(
        activeSlotModal.instructor.id,
        newMoveDate,
        slot,
        duration,
        activeSlotModal.booking?.id
      );
    });
  }, [activeSlotModal, newMoveDate, bookings]);

  useEffect(() => {
    if (activeSlotModal?.booking && availableMoveTimeSlots.length > 0) {
      if (!availableMoveTimeSlots.includes(newMoveTime)) {
        setNewMoveTime(availableMoveTimeSlots[0]);
      }
    }
  }, [availableMoveTimeSlots, newMoveTime, activeSlotModal]);

  const availableBreakDurations = useMemo(() => {
    if (!activeSlotModal || activeSlotModal.booking) return [];
    const maxDurations = [1, 2, 3, 4];
    const start = hourToMinutes(activeSlotModal.time);
    
    return maxDurations.filter((d) => {
      const end = start + d * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00 (19 * 60 = 1140)

      return !hasOverlap(
        activeSlotModal.instructor.id,
        selectedDate,
        activeSlotModal.time,
        d
      );
    });
  }, [activeSlotModal, selectedDate, bookings]);

  const availableBookingDurations = useMemo(() => {
    if (!activeSlotModal || activeSlotModal.booking) return [];
    const maxDurations = [1, 2, 3, 4];
    const start = hourToMinutes(activeSlotModal.time);
    
    return maxDurations.filter((d) => {
      const end = start + d * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00 (19 * 60 = 1140)

      return !hasOverlap(
        activeSlotModal.instructor.id,
        selectedDate,
        activeSlotModal.time,
        d
      );
    });
  }, [activeSlotModal, selectedDate, bookings]);

  useEffect(() => {
    if (activeSlotModal && !activeSlotModal.booking) {
      if (modalTab === 'break' && availableBreakDurations.length > 0 && !availableBreakDurations.includes(blockDuration)) {
        setBlockDuration(availableBreakDurations[0]);
      } else if (modalTab === 'booking' && availableBookingDurations.length > 0 && !availableBookingDurations.includes(bookingDuration)) {
        setBookingDuration(availableBookingDurations[0]);
      }
    }
  }, [availableBreakDurations, availableBookingDurations, modalTab, activeSlotModal]);

  const adjustDate = (days: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (days * 7));
      } else {
        newDate.setDate(newDate.getDate() + days);
      }
      return newDate;
    });
  };

  const handleOpenSlotAction = (ins: Instructor, slotTime: string, existingB?: Booking) => {
    setActiveSlotModal({
      instructor: ins,
      time: slotTime,
      booking: existingB
    });
    setModalTab('break');
    setBlockDuration(1);
    setBlockNotes('');
    setSelectedClientUid(usersList[0]?.uid || '');
    setBookingDuration(1);
    setBookingDifficulty('beginner');
    setBookingNotes('');
    if (existingB) {
      setNewMoveDate(existingB.date);
      setNewMoveTime(existingB.time);
    } else {
      setNewMoveDate(selectedDate);
      setNewMoveTime(slotTime);
    }
  };

  const handleSlotActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSlotModal || !onAddBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (modalTab === 'break') {
        if (hasOverlap(activeSlotModal.instructor.id, selectedDate, activeSlotModal.time, blockDuration)) {
          addNotification(
            'error',
            t('conflictDetected'),
            t('conflictBreakDesc')
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBlock: Booking = {
          id: `block_${Math.random().toString(36).substring(2, 9)}`,
          userId: 'system_block_break',
          instructorId: activeSlotModal.instructor.id,
          instructorName: activeSlotModal.instructor.name,
          instructorAvatar: activeSlotModal.instructor.avatarUrl,
          date: selectedDate,
          time: activeSlotModal.time,
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
          `${t('breakAddedDescPrefix')} ${activeSlotModal.instructor.name} ${t('breakAddedDescAt')} ${activeSlotModal.time}.`
        );
      } else if (modalTab === 'day_off') {
        if (hasOverlap(activeSlotModal.instructor.id, selectedDate, '08:00', 11)) {
          addNotification(
            'error',
            t('conflictDetected'),
            t('conflictDayOffDesc')
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBlock: Booking = {
          id: `block_${Math.random().toString(36).substring(2, 9)}`,
          userId: 'system_block_day_off',
          instructorId: activeSlotModal.instructor.id,
          instructorName: activeSlotModal.instructor.name,
          instructorAvatar: activeSlotModal.instructor.avatarUrl,
          date: selectedDate,
          time: '08:00',
          durationHours: 11, // covers 08:00 to 19:00
          totalPrice: 0,
          status: 'confirmed',
          difficulty: 'beginner',
          notes: t('dayOffLabel')
        };
        await onAddBooking(newBlock);
        addNotification(
          'success',
          t('dayOffSet'),
          `${t('dayOffSetDescPrefix')}${t('dayOffSetDescPrefix') ? ' ' : ''}${activeSlotModal.instructor.name} ${t('dayOffSetDescMiddle')} ${selectedDate}.`
        );
      } else if (modalTab === 'booking') {
        if (!activeSlotModal.instructor.isAvailable) {
          addNotification(
            'error',
            t('instructorUnavailableTitle'),
            `${activeSlotModal.instructor.name} ${t('instructorUnavailableDesc')}`
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        if (!selectedClientUid) {
          addNotification('warning', t('missingClientTitle'), t('selectClientPlease'));
          setIsSlotActionSubmitting(false);
          return;
        }
        if (hasOverlap(activeSlotModal.instructor.id, selectedDate, activeSlotModal.time, bookingDuration)) {
          addNotification(
            'error',
            t('conflictDetected'),
            t('conflictBookingDesc')
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const matchedClient = usersList.find(u => u.uid === selectedClientUid);
        const bookingPrice = activeSlotModal.instructor.pricePerHour * bookingDuration;

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
          instructorId: activeSlotModal.instructor.id,
          instructorName: activeSlotModal.instructor.name,
          instructorAvatar: activeSlotModal.instructor.avatarUrl,
          date: selectedDate,
          time: activeSlotModal.time,
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
          `${t('manualBookingDescPrefix')} ${matchedClient?.displayName || t('clientFallback')} ${t('manualBookingDescWith')} ${activeSlotModal.instructor.name}.`
        );
      }
      setActiveSlotModal(null);
    } catch (err) {
      addNotification('error', t('actionFailedTitle'), t('scheduleUpdateFailed'));
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  const handleSlotMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSlotModal?.booking || !onRescheduleBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (hasOverlap(
        activeSlotModal.instructor.id,
        newMoveDate,
        newMoveTime,
        activeSlotModal.booking.durationHours,
        activeSlotModal.booking.id
      )) {
        addNotification(
          'error',
          t('conflictDetected'),
          t('conflictRescheduleDesc')
        );
        setIsSlotActionSubmitting(false);
        return;
      }

      await onRescheduleBooking(activeSlotModal.booking.id, newMoveDate, newMoveTime);
      addNotification(
        'success',
        t('scheduleUpdated'),
        t('scheduleUpdatedDesc')
      );
      setActiveSlotModal(null);
    } catch (err) {
      addNotification('error', t('updateFailed'), t('moveSessionFailed'));
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

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
          addNotification(
            'success',
            t('blockRemoved'),
            t('blockRemovedDesc')
          );
          setActiveSlotModal(null);
        } catch (err) {
          addNotification('error', t('configSaveError'), t('removeBlockFailed'));
        }
      }
    });
  };

  // Render booking element
  const renderBookingCell = (b: Booking, ins: Instructor) => {
    const client = usersList.find((u) => u.uid === b.userId);

    if (b.userId === 'system_block_day_off') {
      return (
        <div className="relative group/cell h-11 bg-slate-100/50 dark:bg-slate-800/15 border border-slate-300/40 dark:border-slate-800/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-650" />
            <span className="truncate">{t('dayOffLabel')}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className="text-slate-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
            title={t('cancelDayOff')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (b.userId === 'system_block_break') {
      return (
        <div className="relative group/cell h-11 bg-amber-50/60 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-900/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Coffee className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-600" />
            <span className="truncate">{b.notes || (t('breakLabel'))}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className="text-amber-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
            title={t('cancelBreak')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    const isPendingCancellation = b.status === 'pending_cancellation';
    const isCompleted = b.status === 'completed';

    let cardBgClasses = 'bg-indigo-50/60 dark:bg-indigo-950/15 border border-indigo-250/45 dark:border-indigo-900/40 hover:border-indigo-400 dark:hover:border-indigo-700 text-indigo-950 dark:text-indigo-200';
    let titleColorClasses = 'text-indigo-900 dark:text-indigo-200';
    let buttonColorClasses = 'text-indigo-400 hover:text-red-500';
    let textTimeClasses = 'text-indigo-600 dark:text-indigo-400';

    if (isPendingCancellation) {
      cardBgClasses = 'bg-rose-50/60 dark:bg-rose-950/15 border border-rose-250/45 dark:border-rose-900/40 hover:border-rose-400 dark:hover:border-rose-700 text-rose-950 dark:text-rose-200 animate-pulse';
      titleColorClasses = 'text-rose-900 dark:text-rose-300 font-semibold';
      buttonColorClasses = 'text-rose-400 hover:text-red-500';
      textTimeClasses = 'text-rose-600 dark:text-rose-400';
    } else if (isCompleted) {
      cardBgClasses = 'bg-emerald-50/60 dark:bg-emerald-950/10 border border-emerald-250/45 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-700 text-emerald-950 dark:text-emerald-200';
      titleColorClasses = 'text-emerald-900 dark:text-emerald-300 line-through decoration-emerald-200/50 dark:decoration-emerald-800/40';
      buttonColorClasses = 'text-emerald-400 hover:text-red-500';
      textTimeClasses = 'text-emerald-650 dark:text-emerald-400';
    }

    return (
      <div
        onClick={() => handleOpenSlotAction(ins, b.time, b)}
        className={`relative group/cell h-11 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer ${cardBgClasses}`}
      >
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className={`font-bold truncate flex items-center gap-1.5 ${titleColorClasses}`}>
            {client?.avatarUrl && (
              <img 
                src={client.avatarUrl} 
                alt={client.displayName} 
                className="w-4 h-4 rounded-none border border-black/10 shrink-0"
              />
            )}
            <span className="truncate">{client?.displayName || b.notes || (t('clientLesson'))}</span>
            {isPendingCancellation && (
              <span className="ml-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                ({t('cancelReqShort')})
              </span>
            )}
            {isCompleted && (
              <span className="ml-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                ✓ ({t('doneShort')})
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className={`opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer ${buttonColorClasses}`}
            title={t('cancelBookingAdmin')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={`text-[10px] font-mono flex items-center gap-1 mt-0.5 ${textTimeClasses}`}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{b.time} ({b.durationHours}h)</span>
        </div>
      </div>
    );
  };

  // Timetable slots generator
  const renderTimetableSlots = (ins: Instructor) => {
    const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    const cells = [];
    let skipCount = 0;

    for (let i = 0; i < timeSlots.length; i++) {
      if (skipCount > 0) {
        skipCount--;
        continue;
      }

      const slotTime = timeSlots[i];

      // Find if this instructor has a course on this date covering the current slot
      const courseOverlap = (courses || []).find((c) => {
        if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
        const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(c.dates);
        const startStr = formatDateLocalYMD(cStart);
        const endStr = formatDateLocalYMD(cEnd);
        
        if (selectedDate < startStr || selectedDate > endStr) return false;
        
        const cStartMin = hourToMinutes(cStartTime);
        const cEndMin = hourToMinutes(cEndTime);
        const slotStart = hourToMinutes(slotTime);
        const slotEnd = slotStart + 60;
        
        return slotStart < cEndMin && slotEnd > cStartMin;
      });

      if (courseOverlap) {
        // Calculate consecutive slots that overlap with this course
        let span = 1;
        for (let j = i + 1; j < timeSlots.length; j++) {
          const checkSlotTime = timeSlots[j];
          const { start: cStart, end: cEnd, endTime: cEndTime } = parseCourseDates(courseOverlap.dates);
          const startStr = formatDateLocalYMD(cStart);
          const endStr = formatDateLocalYMD(cEnd);
          
          if (selectedDate >= startStr && selectedDate <= endStr) {
            const cEndMin = hourToMinutes(cEndTime);
            const slotStart = hourToMinutes(checkSlotTime);
            
            if (slotStart < cEndMin) {
              span++;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        
        span = Math.min(span, timeSlots.length - i);
        skipCount = span - 1;

        const courseBookings = bookings.filter(
          (b) => b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
        );
        const bookedCount = courseBookings.length;
        const enrolledNames = courseBookings.map((b) => {
          const u = usersList.find((usr) => usr.uid === b.userId);
          return u?.displayName || u?.email || b.userId;
        }).filter(Boolean);

        cells.push(
          <td key={slotTime} colSpan={span} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
            <div
              onClick={() => {
                const otherGuides = courseOverlap.instructorIds?.filter(id => id !== ins.id) || [];
                const guideNamesStr = otherGuides.map(id => instructors.find(i => i.id === id)?.name || id).join(', ');
                const guidesDetail = guideNamesStr ? ` ${t('withGuidesPrefix')} ${guideNamesStr}${t('withGuidesSuffix')}` : '';
                const enrolledDetailsStr = enrolledNames.length > 0 
                  ? `\n${t('clientsEnrolledPrefix')} ${enrolledNames.join(', ')}` : `\n${t('noClientsEnrolled')}`;
                addNotification(
                  'info',
                  courseOverlap.title,
                  `${t('groupCourseInfoPrefix')} "${courseOverlap.title}"${guidesDetail}. ${t('groupCourseScheduled')}: ${courseOverlap.dates}\n${t('groupCourseSeats')}: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}` + enrolledDetailsStr
                );
              }}
              className="relative group/cell min-h-[44px] h-auto border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1.5 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
            >
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-violet-500 shrink-0" />
                  <span className="truncate">{translateCourse(courseOverlap, language).title}</span>
                  <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0">
                    {t('courseLabelShort')}
                  </span>
                </div>
              </div>
              <div className="text-[10px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
                <Clock className="w-3.5 h-3.5 shrink-0 text-violet-400 dark:text-violet-500" />
                <span>
                  {(() => {
                    const { startTime, endTime } = parseCourseDates(courseOverlap.dates);
                    return `${startTime} - ${endTime}`;
                  })()}
                </span>
              </div>
              {/* Seats Info */}
              <div className="text-[9px] font-mono mt-1 text-violet-700 dark:text-violet-300 border-t border-violet-200/50 dark:border-violet-800/40 pt-1 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span>{t('seatsLabel')}</span>
                  <span className="font-bold">{courseOverlap.availableSeats} / {courseOverlap.totalSeats} ({bookedCount} {t('bookedLabel')})</span>
                </div>
                {enrolledNames.length > 0 && (
                  <div className="text-[8px] leading-tight text-violet-600 dark:text-violet-400 mt-0.5 max-w-full truncate" title={enrolledNames.join(', ')}>
                    <span className="font-bold">{t('clientsLabel')}</span> {enrolledNames.join(', ')}
                  </div>
                )}
              </div>
            </div>
          </td>
        );
      } else {
        // Find if a booking starts exactly at this slotTime
        const b = bookings.find(
          (book) =>
            book.instructorId === ins.id &&
            book.date === selectedDate &&
            book.status !== 'cancelled' &&
            !book.isDeleted &&
            book.time === slotTime
        );

        if (b) {
          // Determine how many slots it covers
          const span = Math.min(b.durationHours, timeSlots.length - i);
          skipCount = span - 1;

          cells.push(
            <td key={slotTime} colSpan={span} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
              {renderBookingCell(b, ins)}
            </td>
          );
        } else {
          // Check if covered by an ongoing booking
        const coveringB = bookings.find((book) => {
          if (book.instructorId !== ins.id || book.date !== selectedDate || book.status === 'cancelled' || book.isDeleted) return false;
          const bStart = hourToMinutes(book.time);
          const slotStart = hourToMinutes(slotTime);
          const bEnd = bStart + book.durationHours * 60;
          return slotStart >= bStart && slotStart < bEnd;
        });

        if (coveringB) {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
              {renderBookingCell(coveringB, ins)}
            </td>
          );
        } else if (!ins.isAvailable) {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center bg-slate-50/20 dark:bg-slate-950/5 select-none">
              <div 
                className="w-full h-11 border border-slate-100/40 dark:border-slate-800/20 bg-slate-100/30 dark:bg-slate-900/10 rounded-xl flex items-center justify-center text-slate-350 dark:text-slate-650"
                title={t('instructorUnavailableTitle')}
              >
                <Lock className="w-3 h-3 text-slate-300 dark:text-slate-700 opacity-60" />
              </div>
            </td>
          );
        } else {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center">
              <button
                onClick={() => handleOpenSlotAction(ins, slotTime)}
                className="w-full h-11 border border-dashed border-slate-200/60 dark:border-slate-800/40 hover:border-indigo-400 dark:hover:border-indigo-800 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 rounded-xl transition flex items-center justify-center cursor-pointer group animate-fade-in"
                title={t('manageSlot')}
              >
                <Plus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 group-hover:text-indigo-500 transition duration-200" />
              </button>
            </td>
          );
        }
      }
    }
    }
    return cells;
  };
  const { start: weekStart, end: weekEnd } = getWeekRange(currentDate);
  const weekDays: Date[] = Array.from({ length: 7 }).map((_, i) => new Date(new Date(weekStart).setDate(weekStart.getDate() + i)));

  return (
    <>
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2.5">
              <Calendar className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {t('scheduleBoardTitle')}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {t('scheduleBoardSub')}
            </p>
          </div>

          {/* Date Selector Controls */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1 border border-[var(--border)] p-1 rounded-none">
              <button
                onClick={() => setViewMode('day')}
                className={`px-2.5 py-1 text-xs font-mono rounded-none transition ${viewMode === 'day' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-transparent text-[var(--ink)]'}`}
              >
                {t('scheduleDay')}
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-2.5 py-1 text-xs font-mono rounded-none transition ${viewMode === 'week' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-transparent text-[var(--ink)]'}`}
              >
                {t('scheduleWeek')}
              </button>
            </div>

            <div className="flex items-center gap-1">
            <button
              onClick={() => adjustDate(-1)}
              className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer bg-transparent rounded-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            {viewMode === 'day' ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setCurrentDate(new Date(e.target.value))}
                className="px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-none text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
              />
            ) : (
              <div className="px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-none text-xs text-center text-[var(--ink)] w-48">
                {weekStart.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            
            <button
              onClick={() => adjustDate(1)}
              className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer bg-transparent rounded-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer bg-transparent rounded-none"
            >
              {t('today')}
            </button>
            </div>
          </div>
        </div>

        {/* Timetable Grid with horizontal scroll */}
        {viewMode === 'day' ? (
          <div className="overflow-x-auto rounded-none border border-[var(--border)]">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="w-[180px] p-3 text-left font-bold">
                    {t('coachLabel')}
                  </th>
                  {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map((time) => (
                    <th key={time} className="p-3 text-center font-bold w-[95px] border-l border-slate-200/50 dark:border-slate-800/40">
                      {time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-sm text-slate-400">
                      {t('noInstructorsAvailable')}
                    </td>
                  </tr>
                ) : (
                  instructors.map((ins) => (
                    <tr key={ins.id} className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}>
                      {/* Instructor Profile Header */}
                      <td className={`p-3 align-middle border-r border-[var(--border)] bg-black/5 dark:bg-white/5 ${!ins.isAvailable ? 'opacity-75' : ''}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative">
                            <img
                              src={ins.avatarUrl}
                              alt={ins.name}
                              className={`w-7 h-7 rounded-none border border-[var(--border)] object-cover shrink-0 ${!ins.isAvailable ? 'grayscale opacity-60' : ''}`}
                              referrerPolicy="no-referrer"
                            />
                            {!ins.isAvailable && (
                              <div className="absolute inset-0 bg-rose-955/20 border border-rose-500/30 flex items-center justify-center">
                                <Lock className="w-2.5 h-2.5 text-rose-500" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-xs font-bold truncate flex items-center gap-1 ${!ins.isAvailable ? 'text-[var(--ink-dim)] line-through' : 'text-[var(--ink)]'}`}>
                              {ins.name}
                            </div>
                            <div className="text-[9px] text-[var(--ink-dim)] font-mono capitalize truncate flex items-center gap-1">
                              {!ins.isAvailable ? (
                                <span className="text-rose-500 font-bold uppercase tracking-wider text-[8px]">
                                  {t('unavailableLabel')}
                                </span>
                              ) : (
                                `${getSpecialtyLabel(ins.specialty, language)} • $${ins.pricePerHour}/h`
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Hourly cells */}
                      {renderTimetableSlots(ins)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-none border border-[var(--border)]">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="w-[180px] p-3 text-left font-bold">{t('coachLabel')}</th>
                  {weekDays.map(day => (
                    <th key={day.toISOString()} className="p-3 text-center font-bold border-l border-slate-200/50 dark:border-slate-800/40">
                      {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.map(ins => (
                  <tr key={ins.id} className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}>
                    <td className={`p-3 align-middle border-r border-[var(--border)] bg-black/5 dark:bg-white/5 ${!ins.isAvailable ? 'opacity-75' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative">
                          <img
                            src={ins.avatarUrl}
                            alt={ins.name}
                            className={`w-7 h-7 rounded-none border border-[var(--border)] object-cover shrink-0 ${!ins.isAvailable ? 'grayscale opacity-60' : ''}`}
                            referrerPolicy="no-referrer"
                          />
                          {!ins.isAvailable && (
                            <div className="absolute inset-0 bg-rose-955/20 border border-rose-500/30 flex items-center justify-center">
                              <Lock className="w-2.5 h-2.5 text-rose-500" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-bold truncate flex items-center gap-1 ${!ins.isAvailable ? 'text-[var(--ink-dim)] line-through' : 'text-[var(--ink)]'}`}>
                            {ins.name}
                          </div>
                          <div className="text-[9px] text-[var(--ink-dim)] font-mono capitalize truncate flex items-center gap-1">
                            {!ins.isAvailable ? (<span className="text-rose-500 font-bold uppercase tracking-wider text-[8px]">{t('unavailableLabel')}</span>) : (`${getSpecialtyLabel(ins.specialty, language)} • $${ins.pricePerHour}/h`)}
                          </div>
                        </div>
                      </div>
                    </td>
                    {weekDays.map(day => {
                      const dayStr = formatDateLocalYMD(day);
                      const dayBookings = bookings.filter(b => b.instructorId === ins.id && b.date === dayStr && b.status !== 'cancelled' && !b.isDeleted);
                      const dayCourses = (courses || []).filter((c) => {
                        if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
                        const { start: cStart, end: cEnd } = parseCourseDates(c.dates);
                        const startStr = formatDateLocalYMD(cStart);
                        const endStr = formatDateLocalYMD(cEnd);
                        return dayStr >= startStr && dayStr <= endStr;
                      });

                      const combinedEvents = [
                        ...dayBookings.map(b => ({
                          type: 'booking' as const,
                          time: b.time,
                          data: b,
                          id: b.id
                        })),
                        ...dayCourses.map(c => {
                          const { startTime } = parseCourseDates(c.dates);
                          return {
                            type: 'course' as const,
                            time: startTime,
                            data: c,
                            id: `course_event_${c.id}`
                          };
                        })
                      ].sort((a, b) => a.time.localeCompare(b.time));

                      return (
                        <td key={dayStr} className="p-1 align-top border-l border-slate-200/50 dark:border-slate-800/40 min-h-24">
                          <div className="space-y-1">
                            {combinedEvents.map(item => {
                              if (item.type === 'booking') {
                                return (
                                  <div key={item.id}>{renderBookingCell(item.data, ins)}</div>
                                );
                              } else {
                                const courseOverlap = item.data;
                                const courseBookings = bookings.filter(
                                  (b) => b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
                                );
                                const bookedCount = courseBookings.length;
                                const enrolledNames = courseBookings.map((b) => {
                                  const u = usersList.find((usr) => usr.uid === b.userId);
                                  return u?.displayName || u?.email || b.userId;
                                }).filter(Boolean);

                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      const otherGuides = courseOverlap.instructorIds?.filter(id => id !== ins.id) || [];
                                      const guideNamesStr = otherGuides.map(id => instructors.find(i => i.id === id)?.name || id).join(', ');
                                      const guidesDetail = guideNamesStr ? ` ${t('withGuidesPrefix')} ${guideNamesStr}${t('withGuidesSuffix')}` : '';
                                      const enrolledDetailsStr = enrolledNames.length > 0 
                                        ? `\n${t('clientsEnrolledPrefix')} ${enrolledNames.join(', ')}` : `\n${t('noClientsEnrolled')}`;
                                      addNotification(
                                        'info',
                                        courseOverlap.title,
                                        `${t('groupCourseInfoPrefix')} "${courseOverlap.title}"${guidesDetail}. ${t('groupCourseScheduled')}: ${courseOverlap.dates}\n${t('groupCourseSeats')}: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}` + enrolledDetailsStr
                                      );
                                    }}
                                    className="relative group/cell h-11 border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
                                  >
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                      <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1.5 w-full">
                                        <BookOpen className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                        <span className="truncate">{translateCourse(courseOverlap, language).title}</span>
                                        <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0 ml-auto">
                                          {t('courseLabelShort')}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
                                      <Clock className="w-3 h-3 shrink-0 text-violet-400 dark:text-violet-500" />
                                      <span>{item.time} ({courseOverlap.availableSeats}/{courseOverlap.totalSeats}) • {bookedCount} {t('enrolledLabel')}</span>
                                    </div>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {activeSlotModal && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-md p-6 shadow-2xl relative space-y-4 transition-colors duration-300 animate-scale-up">
            <button
              onClick={() => setActiveSlotModal(null)}
              className="absolute top-4 right-4 text-[var(--ink-dim)] hover:text-[var(--ink)] border border-[var(--border)] bg-black/5 hover:bg-black/10 transition p-1 rounded-none cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div>
              <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
                <Clock className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
                {activeSlotModal.booking 
                  ? (t('manageScheduleBlock'))
                  : (t('scheduleAction'))}
              </h4>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-1.5">
                {activeSlotModal.instructor.name} • {selectedDate} @ {activeSlotModal.time}
              </p>
            </div>

            {/* 1. Modal for EXISTING booking (Reschedule / Move or Delete) */}
            {activeSlotModal.booking ? (
              <form onSubmit={handleSlotMoveSubmit} className="space-y-4">
                <div className="bg-black/10 p-3 rounded-none border border-[var(--border)] space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
                    {t('currentDetails')}
                  </div>
                  <div className="text-xs text-[var(--ink-dim)]">
                    <strong>{t('typeLabel')}:</strong>{' '}
                    {activeSlotModal.booking.userId === 'system_block_break' 
                      ? (t('breakLabel')) 
                      : activeSlotModal.booking.userId === 'system_block_day_off' 
                        ? (t('dayOffLabel'))
                        : (`${t('lessonWithClientPrefix')} (${usersList.find(u => u.uid === activeSlotModal.booking?.userId)?.displayName || t('clientFallback')})`)}
                  </div>
                  {activeSlotModal.booking.notes && (
                    <div className="text-xs text-[var(--ink-dim)] italic">
                      "{activeSlotModal.booking.notes}"
                    </div>
                  )}
                  {activeSlotModal.booking.status === 'pending_cancellation' && activeSlotModal.booking.cancellationReason && (
                    <div className="text-xs text-rose-400 font-mono bg-rose-955/20 px-2.5 py-1.5 border border-rose-900/40 mt-1 rounded-none">
                      <strong>{t('cancelReasonRequired')}:</strong>{' '}
                      {activeSlotModal.booking.cancellationReason}
                    </div>
                  )}

                  {activeSlotModal.booking.userId !== 'system_block_break' && activeSlotModal.booking.userId !== 'system_block_day_off' && (
                    <button
                      type="button"
                      onClick={() => setSelectedChatBooking(activeSlotModal.booking!)}
                      className="w-full mt-2.5 py-2.5 px-3 border border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/40 hover:border-indigo-400 text-indigo-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {t('openChatDiscussion')}
                    </button>
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
                        onChange={(e) => setNewMoveDate(e.target.value)}
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
                        onChange={(e) => setNewMoveTime(e.target.value)}
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

                {activeSlotModal.booking.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (onCompleteBooking) {
                        setIsSlotActionSubmitting(true);
                        await onCompleteBooking(activeSlotModal.booking!.id);
                        setIsSlotActionSubmitting(false);
                        setActiveSlotModal(null);
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
                    onClick={() => handleSlotDeleteClick(activeSlotModal.booking!.id)}
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
              /* 2. Modal for EMPTY slot (Create Break, Day Off, or Manual Booking) */
              <form onSubmit={handleSlotActionSubmit} className="space-y-4">
                {/* Mode tabs */}
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

                {/* TAB 1: Break details */}
                {modalTab === 'break' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {t('breakDuration')}
                      </label>
                      <select
                        value={blockDuration}
                        onChange={(e) => setBlockDuration(Number(e.target.value))}
                        disabled={availableBreakDurations.length === 0}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                      >
                        {availableBreakDurations.length === 0 ? (
                          <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{t('noHoursAvailable')}</option>
                        ) : (
                          availableBreakDurations.map((d: number) => (
                            <option key={d} value={d} className="bg-[var(--bg)] text-[var(--ink)]">
                              {d} {d === 1 ? (t('hourSingular')) : (t('hoursPlural'))}
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
                        onChange={(e) => setBlockNotes(e.target.value)}
                        placeholder={t('lunchBreakPlaceholder')}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: Day Off details */}
                {modalTab === 'day_off' && (
                  <div className="p-3 bg-black/10 border border-[var(--border)] text-xs text-[var(--ink-dim)] leading-relaxed animate-fade-in space-y-2 rounded-none">
                    <div className="font-serif text-xs font-light text-[var(--ink)] flex items-center gap-1">
                      <Calendar className="w-4 h-4 text-[var(--ink-dim)]" />
                      {t('fullDayOff')}
                    </div>
                    <p>
                      {t('fullDayOffDesc')}
                    </p>
                  </div>
                )}

                {/* TAB 3: Manual Client Booking details */}
                {modalTab === 'booking' && (
                  <div className="space-y-3 animate-fade-in">
                    {!activeSlotModal.instructor.isAvailable && (
                      <div className="bg-rose-955/20 border border-rose-900/40 p-3 text-xs text-rose-400 rounded-none font-mono">
                        <p className="font-bold">⚠️ {t('instructorUnavailableTitle')}</p>
                        <p className="text-[11px] opacity-90 mt-0.5">
                          {`${activeSlotModal.instructor.name} ${t('instructorUnavailableSlotDesc')}`}
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
                        onChange={(e) => setSelectedClientUid(e.target.value)}
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
                          onChange={(e) => setBookingDuration(Number(e.target.value))}
                          disabled={availableBookingDurations.length === 0}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                        >
                          {availableBookingDurations.length === 0 ? (
                            <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{t('noHoursAvailable')}</option>
                          ) : (
                            availableBookingDurations.map((d: number) => (
                              <option key={d} value={d} className="bg-[var(--bg)] text-[var(--ink)]">
                                {d} {d === 1 ? (t('hourSingular')) : (t('hoursPlural'))}
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
                          onChange={(e) => setBookingDifficulty(e.target.value as any)}
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
                        onChange={(e) => setBookingNotes(e.target.value)}
                        placeholder={t('bookingNotesPlaceholder')}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                      />
                    </div>
                  </div>
                )}

                {/* Form submit footer buttons */}
                <div className="flex gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setActiveSlotModal(null)}
                    className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
                  >
                    {t('cancel')}
                  </button>

                  <button
                    type="submit"
                    disabled={isSlotActionSubmitting || (modalTab === 'booking' && !activeSlotModal.instructor.isAvailable)}
                    className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer text-center"
                  >
                    {isSlotActionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {t('saveSchedule')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
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
};
