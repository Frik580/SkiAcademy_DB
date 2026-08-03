import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AvailabilitySlot,
  Booking,
  UserProfile,
  Review,
  Course,
  Instructor,
  ActivityLog,
} from '../types';
import { Lock, Sparkles } from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage, parseCourseDates, useTranslatedBookings } from '../lib/LanguageContext';
import { useTheme } from './useTheme';
import { db, collection, query, getDocs, where } from '../lib/firebase';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  DEFAULT_LESSON_TIME_SLOTS,
  fitsLessonDaySchedule,
  isBookingSlotInPast,
  timeStrToMinutes,
  toLocalDateStr,
} from '../lib/availabilitySlots';
import { SkillConfig } from '../lib/skillData';
import { AchievementsConfig } from '../lib/achievementConfig';
import { StudentCabinetShell } from './personal_cabinet/student/StudentCabinetShell';
import { StudentCabinetResortSnapshot } from './personal_cabinet/student/StudentHomeBottomSections';
import { RescheduleModal } from './personal_cabinet/RescheduleModal';
import { ReviewModal } from './personal_cabinet/ReviewModal';
import { LessonDetailsModal } from './personal_cabinet/LessonDetailsModal';
import { ConfirmActionModal } from './personal_cabinet/ConfirmActionModal';
import { LevelUpModal } from './personal_cabinet/LevelUpModal';
import { logger } from '../lib/logger';
import { LazyLoad } from './LazyLoad';

const InstructorWorkspace = React.lazy(() =>
  import('./InstructorWorkspace').then(({ InstructorWorkspace }) => ({
    default: InstructorWorkspace,
  }))
);
const BookingChatModal = React.lazy(() =>
  import('./BookingChatModal').then(({ BookingChatModal }) => ({ default: BookingChatModal }))
);

interface PersonalCabinetProps {
  userProfile: UserProfile;
  bookings: Booking[];
  reviews: Review[];
  dismissedReviewIds?: string[];
  onDismissReview?: (bookingId: string) => void;
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
  onCancel: (id: string, reason?: string) => Promise<void>;
  onAddReview: (
    newReview: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => Promise<void>;
  onToggleRecommendation?: (
    bookingId: string,
    recommendationId: string,
    checked: boolean
  ) => Promise<void>;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => Promise<void>;
  onPinSkillsToday?: (skillItemIds: string[]) => Promise<void>;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => Promise<void>;
  onAddCustomTodayTask?: (text: string) => Promise<void>;
  onRemoveTodayTask?: (task: import('../lib/todayChecklist').TodayTaskRef) => Promise<void>;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  activityLogs?: ActivityLog[];
  onOpenOnboarding?: () => void;
  onViewCourseDetails?: (course: Course) => void;
  onRequireCourseAuth?: (course: Course) => void;
  onBookCourse?: (courseId: string) => Promise<void>;
  onBookInstructor?: (instructor: Instructor) => void;
  onViewInstructorReviews?: (instructor: Instructor) => void;
  forcedMode?: 'client' | 'instructor';
  resortSnapshot?: StudentCabinetResortSnapshot;
  onToggleTemperatureUnit?: () => void;
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
  onToggleRecommendation,
  onToggleSkillToday,
  onPinSkillsToday,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  onSignOut,
  onUpdateProfile,
  courses = [],
  instructors = [],
  usersList = [],
  skillConfig,
  achievementsConfig,
  activityLogs = [],
  onOpenOnboarding,
  onViewCourseDetails,
  onRequireCourseAuth,
  onBookCourse,
  onBookInstructor,
  onViewInstructorReviews,
  forcedMode,
  resortSnapshot,
  onToggleTemperatureUnit,
}) => {
  const { addNotification } = useNotifications();
  const { language, t } = useLanguage();
  const { theme } = useTheme();

  const bookings = useTranslatedBookings(rawBookings, courses, language);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string>('');
  const [newTime, setNewTime] = useState<string>('09:00');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [selectedChatBookingId, setSelectedChatBookingId] = useState<string | null>(null);
  const selectedChatBooking = useMemo(
    () => rawBookings.find((b) => b.id === selectedChatBookingId) ?? null,
    [rawBookings, selectedChatBookingId]
  );
  const [rescheduleInstructorBookings, setRescheduleInstructorBookings] = useState<
    AvailabilitySlot[]
  >([]);
  const [isLoadingInstructorBookings, setIsLoadingInstructorBookings] = useState<boolean>(false);
  const [levelUpModal, setLevelUpModal] = useState<{ show: boolean; level: number } | null>(null);
  const prevLevelRef = useRef<number | undefined>(undefined);

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
        const slotsMap = new Map<string, AvailabilitySlot>();

        const q = query(
          collection(db, AVAILABILITY_SLOTS_COLLECTION),
          where('instructorId', '==', currentBooking.instructorId)
        );
        const snap = await getDocs(q);
        if (snap && !snap.empty) {
          snap.forEach((doc) => {
            const b = doc.data() as AvailabilitySlot;
            if (b.bookingId !== rescheduleId) {
              const key = b.bookingId || `${b.instructorId}_${b.date}_${b.time}`;
              slotsMap.set(key, b);
            }
          });
        }

        setRescheduleInstructorBookings(Array.from(slotsMap.values()));
      } catch (err) {
        logger.error('Error fetching instructor bookings for reschedule:', err);
      } finally {
        setIsLoadingInstructorBookings(false);
      }
    };

    fetchInstructorBookings();
  }, [rescheduleId, bookings, userProfile?.uid]);

  const availableSlots = useMemo((): string[] => {
    const currentBooking = rescheduleId ? bookings.find((b) => b.id === rescheduleId) : null;
    if (!currentBooking || !newDate) return [];

    const duration = currentBooking.durationHours;

    return DEFAULT_LESSON_TIME_SLOTS.filter((slot) => {
      if (!fitsLessonDaySchedule(slot, duration)) return false;
      if (isBookingSlotInPast(newDate, slot)) return false;

      const start = timeStrToMinutes(slot);
      const end = start + duration * 60;

      // Check standard bookings overlap
      for (const b of rescheduleInstructorBookings) {
        if (b.date !== newDate) continue;
        const bStart = timeStrToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;

        if (start < bEnd && end > bStart) {
          return false;
        }
      }

      // Check group courses overlap
      if (currentBooking.instructorId) {
        const hasCourseOverlap = (courses || []).some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId))
            return false;

          const {
            start: cStart,
            end: cEnd,
            startTime: cStartTime,
            endTime: cEndTime,
          } = parseCourseDates(course.dates);
          const startStr = toLocalDateStr(cStart);
          const endStr = toLocalDateStr(cEnd);

          if (newDate < startStr || newDate > endStr) return false;

          const cStartMin = timeStrToMinutes(cStartTime);
          const cEndMin = timeStrToMinutes(cEndTime);
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
  const [lessonDetailsId, setLessonDetailsId] = useState<string | null>(null);
  const lessonDetailsBooking = useMemo(
    () => rawBookings.find((b) => b.id === lessonDetailsId) ?? null,
    [rawBookings, lessonDetailsId]
  );
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
        (r) =>
          r.bookingId === b.id ||
          (r.userId === userProfile.uid && r.instructorId === b.instructorId && r.date === b.date)
      );
      return !alreadyReviewed;
    });
  }, [userBookings, reviews, userProfile.uid, dismissedReviewIds]);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleId || !newDate) return;

    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    setIsRescheduling(true);
    try {
      let conflictBooking: AvailabilitySlot | null = null;

      const timeToMinutes = (tStr: string): number => {
        const [h, m] = tStr.split(':').map(Number);
        return h * 60 + m;
      };

      const checkOverlap = (
        targetDate: string,
        targetTime: string,
        duration: number,
        existing: AvailabilitySlot[]
      ): AvailabilitySlot | null => {
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
        collection(db, AVAILABILITY_SLOTS_COLLECTION),
        where('instructorId', '==', currentBooking.instructorId),
        where('date', '==', newDate)
      );
      const snap = await getDocs(q);
      const activeBookings: AvailabilitySlot[] = [];
      if (snap && !snap.empty) {
        snap.forEach((doc) => {
          const b = doc.data() as AvailabilitySlot;
          if (b.bookingId !== rescheduleId) {
            activeBookings.push(b);
          }
        });
      }
      conflictBooking = checkOverlap(
        newDate,
        newTime,
        currentBooking.durationHours,
        activeBookings
      );

      if (conflictBooking) {
        addNotification(
          'error',
          t('instructorBusy'),
          t('instructorBookingConflictDesc')
            .replace('{instructorName}', currentBooking.instructorName)
            .replace('{date}', newDate)
            .replace('{time}', newTime)
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
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId))
            continue;

          const {
            start: cStart,
            end: cEnd,
            startTime: cStartTime,
            endTime: cEndTime,
          } = parseCourseDates(course.dates);
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
          t('instructorCourseConflictDesc')
            .replace('{instructorName}', currentBooking.instructorName)
            .replace('{courseTitle}', conflictCourse.title)
            .replace('{date}', newDate)
            .replace('{courseDates}', conflictCourse.dates)
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
      },
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
        bookingId: reviewBooking.id,
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

  const minBookingDateStr = toLocalDateStr();

  const showInstructorTab = userProfile.role === 'admin' || !!userProfile.isInstructor;
  const activeMode = forcedMode ?? 'client';

  return (
    <div className="w-full max-w-full min-w-0">
      {activeMode === 'instructor' ? (
        <LazyLoad
          fallback={
            <div className="ui-empty-state flex min-h-40 items-center justify-center">
              <span className="ui-section-eyebrow">{t('loading')}</span>
            </div>
          }
        >
          <InstructorWorkspace
            userProfile={userProfile}
            instructors={instructors}
            allBookings={rawBookings}
            reviews={reviews}
            courses={courses}
            usersList={usersList}
            skillConfig={skillConfig}
          />
        </LazyLoad>
      ) : userProfile.isClientActive === false ? (
        <div className="ui-card p-8 lg:p-10 space-y-6 animate-fade-in text-center max-w-xl mx-auto my-12 theme-air:shadow-soft">
          <div className="w-16 h-16 ui-avatar rounded-full flex items-center justify-center mx-auto text-rose-400 bg-rose-500/10 theme-air:border-none">
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
              <p className="text-xs text-accent font-mono uppercase tracking-wider leading-relaxed pt-2">
                {t('instructorWorkspaceAvailable')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in w-full max-w-full min-w-0">
          {onOpenOnboarding && !userProfile.hasCompletedOnboarding && (
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3 text-left max-w-2xl mx-auto">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-[var(--accent)] shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-[var(--ink)]">
                    {t('onboardingS1Title')}
                  </h4>
                  <p className="text-xs text-[var(--ink-dim)]">{t('onboardingS1Desc')}</p>
                </div>
              </div>
              <button
                onClick={onOpenOnboarding}
                className="btn-primary px-4 py-2 text-sm whitespace-nowrap shrink-0"
              >
                {t('onboardingTitle')} →
              </button>
            </div>
          )}

          <StudentCabinetShell
            userProfile={userProfile}
            bookings={userBookings}
            courses={courses}
            instructors={instructors}
            reviews={reviews}
            activityLogs={activityLogs}
            dismissedReviewIds={dismissedReviewIds}
            skillConfig={skillConfig}
            achievementsConfig={achievementsConfig}
            unreviewedCompletedBookings={unreviewedCompletedBookings}
            onDismissReview={onDismissReview}
            onReschedule={(booking) => {
              setRescheduleId(booking.id);
              setNewDate(booking.date);
              setNewTime(booking.time);
            }}
            onCancel={handleCancelClick}
            onChat={(booking) => setSelectedChatBookingId(booking.id)}
            onOpenLesson={(booking) => setLessonDetailsId(booking.id)}
            onWriteReview={(booking) => {
              setReviewBooking(booking);
              setReviewComment('');
              setReviewRating(5);
            }}
            onToggleRecommendation={onToggleRecommendation}
            onToggleSkillToday={onToggleSkillToday}
            onPinSkillsToday={onPinSkillsToday}
            onToggleTodayTaskComplete={onToggleTodayTaskComplete}
            onAddCustomTodayTask={onAddCustomTodayTask}
            onRemoveTodayTask={onRemoveTodayTask}
            onSignOut={onSignOut}
            onUpdateProfile={onUpdateProfile}
            onLevelBadgeClick={() => setLevelUpModal({ show: true, level: userProfile.level || 1 })}
            onInvalidFile={() => addNotification('error', t('invalidFile'), t('invalidFileDesc'))}
            onUploadSuccess={() =>
              addNotification('success', t('profilePhotoChanged'), t('profilePhotoChangedDesc'))
            }
            onUploadError={() => addNotification('error', t('uploadFailed'), t('uploadFailedDesc'))}
            onViewCourseDetails={onViewCourseDetails ?? (() => {})}
            onRequireCourseAuth={onRequireCourseAuth ?? (() => {})}
            onBookCourse={(courseId) => {
              void onBookCourse?.(courseId);
            }}
            onBookInstructor={onBookInstructor ?? (() => {})}
            onViewInstructorReviews={onViewInstructorReviews ?? (() => {})}
            syncTabWithRoute={forcedMode === 'client'}
            resortSnapshot={resortSnapshot}
            onToggleTemperatureUnit={onToggleTemperatureUnit}
            usersList={usersList}
          />

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
            minDate={minBookingDateStr}
            onSubmit={handleRescheduleSubmit}
          />

          <LessonDetailsModal
            booking={lessonDetailsBooking}
            courses={courses}
            onClose={() => setLessonDetailsId(null)}
            onWriteReview={(booking) => {
              setLessonDetailsId(null);
              setReviewBooking(booking);
              setReviewComment('');
              setReviewRating(5);
            }}
            onToggleRecommendation={onToggleRecommendation}
            hasReview={
              lessonDetailsBooking
                ? reviews.some(
                    (r) =>
                      r.bookingId === lessonDetailsBooking.id ||
                      (r.userId === userProfile.uid &&
                        r.instructorId === lessonDetailsBooking.instructorId &&
                        r.date === lessonDetailsBooking.date)
                  )
                : false
            }
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
            <LazyLoad
              fallback={
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 font-mono text-[10px] uppercase tracking-wider text-white">
                  {t('loading')}
                </div>
              }
            >
              <BookingChatModal
                booking={selectedChatBooking}
                currentUserProfile={userProfile}
                onClose={() => setSelectedChatBookingId(null)}
                instructors={instructors}
                usersList={usersList}
                onToggleRecommendation={onToggleRecommendation}
              />
            </LazyLoad>
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
