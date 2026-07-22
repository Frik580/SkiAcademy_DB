import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Booking, UserProfile, Review, Course, Instructor } from '../types';
import {
  Sliders,
  UserCheck,
  Lock,
} from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import {
  useLanguage,
  parseCourseDates,
  useTranslatedBookings,
} from '../lib/LanguageContext';
import { useTheme } from './useTheme';
import { db, collection, query, getDocs, where } from '../lib/firebase';
import { BookingChatModal } from './BookingChatModal';
import { InstructorWorkspace } from './InstructorWorkspace';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../lib/skillData';
import { ClientSkillProgressView } from './ClientSkillProgressView';
import { ProfileSettings } from './personal_cabinet/ProfileSettings';
import { UpcomingSessionsStrip } from './personal_cabinet/UpcomingSessionsStrip';
import { RescheduleModal } from './personal_cabinet/RescheduleModal';
import { ReviewModal } from './personal_cabinet/ReviewModal';
import { ConfirmActionModal } from './personal_cabinet/ConfirmActionModal';
import { ClientBookingsList } from './personal_cabinet/ClientBookingsList';
import { LevelUpModal } from './personal_cabinet/LevelUpModal';

interface PersonalCabinetProps {
  userProfile: UserProfile;
  bookings: Booking[];
  reviews: Review[];
  dismissedReviewIds?: string[];
  onDismissReview?: (bookingId: string) => void;
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
  onCancel: (id: string, reason?: string) => Promise<void>;
  onAddReview: (newReview: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>) => Promise<void>;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  skillConfig?: SkillConfig;
}

export const PersonalCabinet: React.FC<PersonalCabinetProps> = ({
  userProfile,
  bookings: rawBookings,
  reviews,
  dismissedReviewIds = [],
  onDismissReview,
  onReschedule,
  onCancel,
  onAddReview,
  onSignOut,
  onUpdateProfile,
  courses = [],
  instructors = [],
  usersList = [],
  skillConfig
}) => {
  const { addNotification } = useNotifications();
  const { language, t } = useLanguage();
  const { theme } = useTheme();

  const bookings = useTranslatedBookings(rawBookings, courses, language);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string>('');
  const [newTime, setNewTime] = useState<string>('09:00');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);
  const [rescheduleInstructorBookings, setRescheduleInstructorBookings] = useState<Booking[]>([]);
  const [isLoadingInstructorBookings, setIsLoadingInstructorBookings] = useState<boolean>(false);
  const [levelUpModal, setLevelUpModal] = useState<{ show: boolean; level: number } | null>(null);
  const prevLevelRef = useRef<number | undefined>(undefined);

  const skillProgress = useMemo(() => {
    return calculateSkillProgress(
      userProfile?.skillScores || {},
      skillConfig?.items || DEFAULT_SKILL_CONFIG.items,
      userProfile?.level || 1,
      skillConfig?.passPercentage ?? 80
    );
  }, [userProfile?.skillScores, userProfile?.level, skillConfig]);

  useEffect(() => {
    const currentLevel = userProfile?.level || 1;
    if (prevLevelRef.current !== undefined && prevLevelRef.current !== currentLevel) {
      setLevelUpModal({ show: true, level: currentLevel });
    }
    prevLevelRef.current = currentLevel;
  }, [userProfile?.level]);

  useEffect(() => {
    if (levelUpModal?.show) {
      const timer = setTimeout(() => {
        setLevelUpModal(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [levelUpModal]);

  // Fetch coach's bookings when reschedule is active
  useEffect(() => {
    if (!rescheduleId) {
      setRescheduleInstructorBookings([]);
      return;
    }
    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    const fetchInstructorBookings = async () => {
      setIsLoadingInstructorBookings(true);
      try {
        const q = query(
          collection(db, 'bookings'),
          where('instructorId', '==', currentBooking.instructorId)
        );
        const snap = await getDocs(q);
        const list: Booking[] = [];
        if (snap && !snap.empty) {
          snap.forEach((doc) => {
            const b = { id: doc.id, ...doc.data() } as Booking;
            if (b.status !== 'cancelled' && b.id !== rescheduleId) {
              list.push(b);
            }
          });
        }
        setRescheduleInstructorBookings(list);
      } catch (err) {
        console.error('Error fetching instructor bookings for reschedule:', err);
      } finally {
        setIsLoadingInstructorBookings(false);
      }
    };

    fetchInstructorBookings();
  }, [rescheduleId, bookings, userProfile?.uid]);

  const availableSlots = useMemo(() => {
    const currentBooking = rescheduleId ? bookings.find((b) => b.id === rescheduleId) : null;
    if (!currentBooking || !newDate) return [];

    const duration = currentBooking.durationHours;
    const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

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

    return timeSlots.filter((slot) => {
      const start = timeToMinutes(slot);
      const end = start + duration * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00

      // Check standard bookings overlap
      for (const b of rescheduleInstructorBookings) {
        if (b.date !== newDate) continue;
        const bStart = timeToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;

        if (start < bEnd && end > bStart) {
          return false;
        }
      }

      // Check group courses overlap
      if (currentBooking.instructorId) {
        const hasCourseOverlap = (courses || []).some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId)) return false;
          
          const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
          const startStr = toYMD(cStart);
          const endStr = toYMD(cEnd);
          
          if (newDate < startStr || newDate > endStr) return false;
          
          const cStartMin = timeToMinutes(cStartTime);
          const cEndMin = timeToMinutes(cEndTime);
          return start < cEndMin && end > cStartMin;
        });
        
        if (hasCourseOverlap) return false;
      }

      return true;
    });
  }, [rescheduleId, bookings, newDate, rescheduleInstructorBookings, courses]);

  // Auto-select first available slot if current selected slot is not available
  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(newTime)) {
      setNewTime(availableSlots[0]);
    }
  }, [availableSlots, newTime]);

  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    showReasonInput?: boolean;
    onConfirm: (reason?: string) => void | Promise<void>;
  } | null>(null);

  const userBookings = bookings.filter((b) => b.userId === userProfile.uid && !b.isDeleted);

  const unreviewedCompletedBookings = useMemo(() => {
    return userBookings.filter((b) => {
      if (b.status !== 'completed') return false;
      if (dismissedReviewIds.includes(b.id)) return false;
      const alreadyReviewed = reviews.some(
        (r) => r.bookingId === b.id || (r.userId === userProfile.uid && r.instructorId === b.instructorId && r.date === b.date)
      );
      return !alreadyReviewed;
    });
  }, [userBookings, reviews, userProfile.uid, dismissedReviewIds]);

  const [cabinetMode, setCabinetMode] = useState<'client' | 'instructor'>('client');

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleId || !newDate) return;

    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    setIsRescheduling(true);
    try {
      let conflictBooking: Booking | null = null;

      const timeToMinutes = (tStr: string): number => {
        const [h, m] = tStr.split(':').map(Number);
        return h * 60 + m;
      };

      const checkOverlap = (
        targetDate: string,
        targetTime: string,
        duration: number,
        existing: Booking[]
      ): Booking | null => {
        const start = timeToMinutes(targetTime);
        const end = start + duration * 60;

        for (const b of existing) {
          if (b.date !== targetDate) continue;
          const bStart = timeToMinutes(b.time);
          const bEnd = bStart + b.durationHours * 60;

          if (start < bEnd && end > bStart) {
            return b;
          }
        }
        return null;
      };

      // Fetch confirmed/active bookings for this instructor
      const q = query(
        collection(db, 'bookings'),
        where('instructorId', '==', currentBooking.instructorId),
        where('date', '==', newDate)
      );
      const snap = await getDocs(q);
      const activeBookings: Booking[] = [];
      if (snap && !snap.empty) {
        snap.forEach((doc) => {
          const b = { id: doc.id, ...doc.data() } as Booking;
          if (b.status !== 'cancelled' && b.id !== rescheduleId) {
            activeBookings.push(b);
          }
        });
      }
      conflictBooking = checkOverlap(newDate, newTime, currentBooking.durationHours, activeBookings);

      if (conflictBooking) {
        addNotification(
          'error',
          t('instructorBusy'),
          language === 'en'
            ? `${currentBooking.instructorName} is already booked on ${newDate} around ${newTime}. Please choose another date or time.`
            : `${currentBooking.instructorName} уже забронирован(а) на ${newDate} около ${newTime}. Пожалуйста, выберите другую дату или время.`
        );
        setIsRescheduling(false);
        return;
      }

      // Check group courses overlap
      let conflictCourse: Course | null = null;
      if (currentBooking.instructorId) {
        const toYMD = (d: Date): string => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const start = timeToMinutes(newTime);
        const end = start + currentBooking.durationHours * 60;

        for (const course of courses || []) {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId)) continue;
          
          const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
          const startStr = toYMD(cStart);
          const endStr = toYMD(cEnd);
          
          if (newDate >= startStr && newDate <= endStr) {
            const cStartMin = timeToMinutes(cStartTime);
            const cEndMin = timeToMinutes(cEndTime);
            
            if (start < cEndMin && end > cStartMin) {
              conflictCourse = course;
              break;
            }
          }
        }
      }

      if (conflictCourse) {
        addNotification(
          'error',
          t('instructorReserved'),
          language === 'en'
            ? `${currentBooking.instructorName} is leading the group course "${conflictCourse.title}" on ${newDate} at this time (${conflictCourse.dates}). Please choose another date or time.`
            : `${currentBooking.instructorName} ведет групповой курс «${conflictCourse.title}» ${newDate} в это время (${conflictCourse.dates}). Пожалуйста, выберите другую дату или время.`
        );
        setIsRescheduling(false);
        return;
      }

      await onReschedule(rescheduleId, newDate, newTime);
      addNotification('success', t('lessonRescheduled'), t('lessonRescheduledDesc'));
      setRescheduleId(null);
    } catch (err) {
      addNotification('error', t('updateFailed'), t('updateFailedDesc'));
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCancelClick = (booking: Booking) => {
    const confirmationText = `${t('cancelConfirmMessage')} ${booking.instructorName}? ${t('cancelConfirmSuffix')}`;

    setCancelReason('');
    setConfirmModal({
      message: confirmationText,
      showReasonInput: true,
      onConfirm: async (reason?: string) => {
        try {
          await onCancel(booking.id, reason);
          addNotification('success', t('cancellationRequested'), t('cancellationRequestedDesc'));
        } catch (err) {
          addNotification('error', t('requestFailed'), t('requestFailedDesc'));
        }
      }
    });
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewBooking) return;

    if (!reviewComment.trim()) {
      addNotification('warning', t('reviewEmpty'), t('reviewEmptyDesc'));
      return;
    }

    setIsSubmittingReview(true);
    try {
      await onAddReview({
        instructorId: reviewBooking.instructorId,
        rating: reviewRating,
        comment: reviewComment.trim(),
        bookingId: reviewBooking.id
      });
      addNotification('success', t('reviewShared'), t('reviewSharedDesc'));
      setReviewBooking(null);
      setReviewComment('');
      setReviewRating(5);
    } catch (err) {
      addNotification('error', t('reviewFailed'), t('reviewFailedDesc'));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const showInstructorTab = userProfile.role === 'admin' || !!userProfile.isInstructor;
  const activeMode = showInstructorTab ? cabinetMode : 'client';

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* Workspace Tab Switcher */}
      {showInstructorTab && (
        <div className="flex border border-[var(--border)] bg-black/5 p-1 w-full max-w-md mx-auto">
          <button
            onClick={() => setCabinetMode('client')}
            className={`flex-1 py-2 text-[10px] font-mono uppercase tracking-widest font-bold transition-all duration-200 cursor-pointer text-center rounded-none flex items-center justify-center gap-2 ${
              activeMode === 'client'
                ? 'bg-[var(--ink)] text-[var(--bg)]'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            {t('clientCabinet')}
          </button>
          <button
            onClick={() => setCabinetMode('instructor')}
            className={`flex-1 py-2 text-[10px] font-mono uppercase tracking-widest font-bold transition-all duration-200 cursor-pointer text-center rounded-none flex items-center justify-center gap-2 ${
              activeMode === 'instructor'
                ? 'bg-[var(--ink)] text-[var(--bg)]'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            {t('instructorWorkspaceTab')}
          </button>
        </div>
      )}

      {activeMode === 'instructor' ? (
        <InstructorWorkspace
          userProfile={userProfile}
          instructors={instructors}
          allBookings={rawBookings}
          reviews={reviews}
          courses={courses}
          usersList={usersList}
          skillConfig={skillConfig}
        />
      ) : userProfile.isClientActive === false ? (
        <div className="border border-[var(--border)] p-8 space-y-6 animate-fade-in bg-black/10 dark:bg-black/30 text-center max-w-xl mx-auto my-12">
          <div className="w-16 h-16 border border-[var(--border)] rounded-none flex items-center justify-center mx-auto text-rose-400 bg-black/10">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-light text-[var(--ink)] tracking-tight">
              {t('accessSuspended')}
            </h3>
            <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider leading-relaxed pt-2">
              {t('accessSuspendedDesc')}
            </p>
            {showInstructorTab && (
              <p className="text-xs text-indigo-400 font-mono uppercase tracking-wider leading-relaxed pt-2">
                {t('instructorWorkspaceAvailable')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6 animate-fade-in w-full max-w-full min-w-0">
          <ProfileSettings
            userProfile={userProfile}
            skillProgress={skillProgress}
            onSignOut={onSignOut}
            onUpdateProfile={onUpdateProfile}
            onLevelBadgeClick={() => setLevelUpModal({ show: true, level: userProfile.level || 1 })}
            onInvalidFile={() => addNotification('error', t('invalidFile'), t('invalidFileDesc'))}
            onUploadSuccess={() => addNotification('success', t('profilePhotoChanged'), t('profilePhotoChangedDesc'))}
            onUploadError={() => addNotification('error', t('uploadFailed'), t('uploadFailedDesc'))}
          />

      {/* Bookings Right Panel */}
      <div id="personal-cabinet-bookings-panel" className="lg:col-span-8 space-y-5 transition-colors duration-300 bg-transparent w-full min-w-0 max-w-full overflow-hidden">

        <ClientSkillProgressView userProfile={userProfile} skillConfig={skillConfig} onUpdateProfile={onUpdateProfile} />

        {userBookings.length > 0 && (
          <div className="border border-[var(--border)] p-4 bg-black/10 space-y-4">
            <UpcomingSessionsStrip userBookings={userBookings} courses={courses} />
          </div>
        )}

        <ClientBookingsList
          userBookings={userBookings}
          unreviewedCompletedBookings={unreviewedCompletedBookings}
          onDismissReview={onDismissReview}
          onWriteReview={(booking) => {
            setReviewBooking(booking);
            setReviewComment('');
            setReviewRating(5);
          }}
          onReschedule={(booking) => {
            setRescheduleId(booking.id);
            setNewDate(booking.date);
            setNewTime(booking.time);
          }}
          onCancel={handleCancelClick}
          onChat={setSelectedChatBooking}
        />
      </div>

      <RescheduleModal
        isOpen={!!rescheduleId}
        onClose={() => setRescheduleId(null)}
        newDate={newDate}
        setNewDate={setNewDate}
        newTime={newTime}
        setNewTime={setNewTime}
        availableSlots={availableSlots}
        isLoadingSlots={isLoadingInstructorBookings}
        isSubmitting={isRescheduling}
        minDate={tomorrowStr}
        onSubmit={handleRescheduleSubmit}
      />

      <ReviewModal
        booking={reviewBooking}
        rating={reviewRating}
        setRating={setReviewRating}
        comment={reviewComment}
        setComment={setReviewComment}
        isSubmitting={isSubmittingReview}
        onClose={() => setReviewBooking(null)}
        onSubmit={handleReviewSubmit}
      />

      {confirmModal && (
        <ConfirmActionModal
          message={confirmModal.message}
          showReasonInput={confirmModal.showReasonInput}
          reason={cancelReason}
          setReason={setCancelReason}
          onCancel={() => {
            setConfirmModal(null);
            setCancelReason('');
          }}
          onConfirm={async (reason) => {
            const action = confirmModal.onConfirm;
            setConfirmModal(null);
            setCancelReason('');
            await action(reason);
          }}
        />
      )}

      {selectedChatBooking && (
        <BookingChatModal
          booking={selectedChatBooking}
          currentUserProfile={userProfile}
          onClose={() => setSelectedChatBooking(null)}
          instructors={instructors}
          usersList={usersList}
        />
      )}

      {levelUpModal?.show && (
        <LevelUpModal
          level={levelUpModal.level}
          theme={theme}
          onClose={() => setLevelUpModal(null)}
        />
      )}
        </div>
      )}
    </div>
  );
};

