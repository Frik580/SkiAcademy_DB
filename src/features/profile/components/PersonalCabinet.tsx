import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Booking,
  UserProfile,
  Review,
  Course,
  Instructor,
  ActivityLog,
  WalletLedgerEntry,
} from '../../../types';
import { Lock, Sparkles } from 'lucide-react';
import { useNotifications } from '../../../features/notifications';
import { useLanguage, useTranslatedBookings } from '../../../lib/LanguageContext';
import { SkillConfig } from '../../../lib/skillData';
import { AchievementsConfig } from '../../../lib/achievementConfig';
import { StudentCabinet } from '../../../features/profile/components/StudentCabinet';
import { useReviewFlow } from '../../../features/profile/components/ReviewFlow';
import { StudentCabinetResortSnapshot } from '../../../features/student-cabinet/components/student/StudentHomeBottomSections';
import { PersonalCabinetModals } from '../../../features/student-cabinet/components/PersonalCabinetModals';
import { useRescheduleBooking } from '../../../features/student-cabinet/components/useRescheduleBooking';
import { useBookingChatUnread } from '../../../lib/useBookingChatUnread';

export interface PersonalCabinetProps {
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
  onRemoveTodayTask?: (task: import('../../../lib/todayChecklist').TodayTaskRef) => Promise<void>;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  activityLogs?: ActivityLog[];
  walletLedgerEntries?: WalletLedgerEntry[];
  onOpenOnboarding?: () => void;
  onViewCourseDetails?: (course: Course) => void;
  onRequireCourseAuth?: (course: Course) => void;
  onBookCourse?: (courseId: string) => Promise<void>;
  onBookInstructor?: (instructor: Instructor) => void;
  onViewInstructorReviews?: (instructor: Instructor) => void;
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
  walletLedgerEntries = [],
  onOpenOnboarding,
  onViewCourseDetails,
  onRequireCourseAuth,
  onBookCourse,
  onBookInstructor,
  onViewInstructorReviews,
  resortSnapshot,
  onToggleTemperatureUnit,
}) => {
  const { addNotification } = useNotifications();
  const { language, t } = useLanguage();

  const bookings = useTranslatedBookings(rawBookings, courses, language);
  const reschedule = useRescheduleBooking({ bookings, courses, onReschedule });
  const reviewFlow = useReviewFlow({ onAddReview });

  const [selectedChatBookingId, setSelectedChatBookingId] = useState<string | null>(null);
  const selectedChatBooking = useMemo(
    () => bookings.find((b) => b.id === selectedChatBookingId) ?? null,
    [bookings, selectedChatBookingId]
  );

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

  const [lessonDetailsId, setLessonDetailsId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    showReasonInput?: boolean;
    onConfirm: (reason?: string) => void | Promise<void>;
  } | null>(null);

  const showInstructorTab = userProfile.role === 'admin' || !!userProfile.isInstructor;

  const userBookings = useMemo(
    () => bookings.filter((b) => b.userId === userProfile.uid && !b.isDeleted),
    [bookings, userProfile.uid]
  );
  const { hasUnreadChat, markBookingChatRead } = useBookingChatUnread(
    userProfile.uid,
    userBookings
  );

  useEffect(() => {
    if (!selectedChatBookingId) return;
    const booking = bookings.find((b) => b.id === selectedChatBookingId);
    if (booking) markBookingChatRead(booking);
  }, [selectedChatBookingId, markBookingChatRead, bookings]);

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
        } catch {
          addNotification('error', t('requestFailed'), t('requestFailedDesc'));
        }
      },
    });
  };

  return (
    <div className="w-full max-w-full min-w-0">
      {userProfile.isClientActive === false ? (
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

          <StudentCabinet
            userProfile={userProfile}
            bookings={userBookings}
            courses={courses}
            instructors={instructors}
            reviews={reviews}
            activityLogs={activityLogs}
            walletLedgerEntries={walletLedgerEntries}
            dismissedReviewIds={dismissedReviewIds}
            skillConfig={skillConfig}
            achievementsConfig={achievementsConfig}
            unreviewedCompletedBookings={unreviewedCompletedBookings}
            onDismissReview={onDismissReview}
            onReschedule={reschedule.openReschedule}
            onCancel={handleCancelClick}
            onChat={(booking) => {
              markBookingChatRead(booking);
              setSelectedChatBookingId(booking.id);
            }}
            hasUnreadChat={hasUnreadChat}
            onOpenLesson={(booking) => setLessonDetailsId(booking.id)}
            onWriteReview={reviewFlow.openReview}
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
            onViewCourseDetails={onViewCourseDetails}
            onRequireCourseAuth={onRequireCourseAuth}
            onBookCourse={onBookCourse}
            onBookInstructor={onBookInstructor}
            onViewInstructorReviews={onViewInstructorReviews}
            syncTabWithRoute={true}
            resortSnapshot={resortSnapshot}
            onToggleTemperatureUnit={onToggleTemperatureUnit}
            usersList={usersList}
          />

          <PersonalCabinetModals
            userProfile={userProfile}
            rawBookings={rawBookings}
            courses={courses}
            instructors={instructors}
            usersList={usersList}
            reviews={reviews}
            reschedule={{
              isOpen: !!reschedule.rescheduleId,
              onClose: reschedule.closeReschedule,
              newDate: reschedule.newDate,
              setNewDate: reschedule.setNewDate,
              newTime: reschedule.newTime,
              setNewTime: reschedule.setNewTime,
              availableSlots: reschedule.availableSlots,
              isLoadingSlots: reschedule.isLoadingInstructorBookings,
              isSubmitting: reschedule.isRescheduling,
              minDate: reschedule.minBookingDateStr,
              onSubmit: reschedule.handleRescheduleSubmit,
            }}
            lessonDetailsId={lessonDetailsId}
            onCloseLessonDetails={() => setLessonDetailsId(null)}
            onWriteReviewFromLesson={(booking) => {
              setLessonDetailsId(null);
              reviewFlow.openReview(booking);
            }}
            onToggleRecommendation={onToggleRecommendation}
            reviewBooking={reviewFlow.reviewBooking}
            reviewRating={reviewFlow.reviewRating}
            setReviewRating={reviewFlow.setReviewRating}
            reviewComment={reviewFlow.reviewComment}
            setReviewComment={reviewFlow.setReviewComment}
            isSubmittingReview={reviewFlow.isSubmittingReview}
            onCloseReview={reviewFlow.closeReview}
            onSubmitReview={reviewFlow.handleSubmitReview}
            confirmModal={confirmModal}
            cancelReason={cancelReason}
            setCancelReason={setCancelReason}
            onCloseConfirm={() => {
              setConfirmModal(null);
              setCancelReason('');
            }}
            onConfirmAction={async (reason) => {
              const action = confirmModal?.onConfirm;
              setConfirmModal(null);
              setCancelReason('');
              if (action) await action(reason);
            }}
            selectedChatBooking={selectedChatBooking}
            onCloseChat={() => setSelectedChatBookingId(null)}
            levelUpModal={levelUpModal}
            onCloseLevelUp={() => setLevelUpModal(null)}
          />
        </div>
      )}
    </div>
  );
};
