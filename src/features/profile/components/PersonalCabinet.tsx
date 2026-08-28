import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  UserProfile,
  Review,
  Course,
  Instructor,
  ActivityLog,
  WalletLedgerEntry,
} from '../../../types';
import type { LessonBookingCabinetItem } from '../../../features/lesson-bookings/lessonBookingContracts';
import { cabinetItemToLegacyPresentation } from '../../../features/lesson-bookings/mergeCabinetBookings';
import type {
  CabinetSessionItem,
  CourseEnrollmentCabinetItem,
} from '../../../features/course-enrollments';
import { Lock } from 'lucide-react';
import { useNotifications } from '../../../features/notifications';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { SkillConfig } from '../../../domain/achievements';
import { AchievementsConfig } from '../../../domain/achievements';
import { StudentCabinet } from './StudentCabinet';
import { useReviewFlow } from './ReviewFlow';
import type { StudentCabinetResortSnapshot } from '../../student-cabinet/components/student/StudentHomeBottomSections';
import type { TodayTaskRef } from '../../student-cabinet/todayChecklist';
import { PersonalCabinetModals } from '../../student-cabinet/components/PersonalCabinetModals';
import { useBookingChatUnread } from '../../../features/student-cabinet/useBookingChatUnread';
import {
  RescheduleBookingModal,
  useCustomerBookingCollaboration,
} from '../../../features/booking-collaboration';

export interface PersonalCabinetProps {
  userProfile: UserProfile;
  bookings: readonly LessonBookingCabinetItem[];
  courseEnrollments?: readonly CourseEnrollmentCabinetItem[];
  sessionItems?: readonly CabinetSessionItem[];
  reviews: Review[];
  dismissedReviewIds?: string[];
  onDismissReview?: (bookingId: string) => void;
  onCancel: (id: string, reason?: string) => Promise<void>;
  onCourseWithdraw?: (enrollmentId: string) => Promise<void>;
  onCourseRequestCancellation?: (enrollmentId: string) => Promise<void>;
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
  onRemoveTodayTask?: (task: TodayTaskRef) => Promise<void>;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  activityLogs?: ActivityLog[];
  walletLedgerEntries?: WalletLedgerEntry[];
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
  courseEnrollments = [],
  sessionItems = [],
  reviews,
  dismissedReviewIds = [],
  onDismissReview,
  onCancel,
  onCourseWithdraw,
  onCourseRequestCancellation,
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
  onViewCourseDetails,
  onRequireCourseAuth,
  onBookCourse,
  onBookInstructor,
  onViewInstructorReviews,
  resortSnapshot,
  onToggleTemperatureUnit,
}) => {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();

  const bookings = rawBookings;
  const legacyModalBookings = useMemo(
    () => rawBookings.map((item) => cabinetItemToLegacyPresentation(item, userProfile.uid)),
    [rawBookings, userProfile.uid]
  );
  const reviewFlow = useReviewFlow({ onAddReview });

  const [selectedChatBookingId, setSelectedChatBookingId] = useState<string | null>(null);
  const selectedChatBooking = useMemo(
    () => legacyModalBookings.find((b) => b.id === selectedChatBookingId) ?? null,
    [legacyModalBookings, selectedChatBookingId]
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

  const userBookings = bookings;
  const { hasUnreadChat, markBookingChatRead } = useBookingChatUnread(
    userProfile.uid,
    [...userBookings]
  );
  const collaboration = useCustomerBookingCollaboration({
    accountId: userProfile.uid,
    onNotify: (type, title, message) => addNotification(type, title, message),
    t: t as (key: string) => string,
  });

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

  const handleCancelClick = (booking: LessonBookingCabinetItem) => {
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
        <div className="ui-card p-8 lg:p-10 space-y-6 animate-fade-in text-center max-w-xl mx-auto my-12 shadow-soft">
          <div className="w-16 h-16 ui-avatar rounded-full flex items-center justify-center mx-auto text-rose-400 bg-rose-500/10 border-none">
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
          <StudentCabinet
            userProfile={userProfile}
            bookings={userBookings}
            courseEnrollments={courseEnrollments}
            sessionItems={sessionItems}
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
            onCancel={handleCancelClick}
            onChat={(booking) => {
              markBookingChatRead(booking);
              setSelectedChatBookingId(booking.id);
            }}
            hasUnreadChat={hasUnreadChat}
            onOpenLesson={(booking) => setLessonDetailsId(booking.id)}
            onWriteReview={(booking) =>
              reviewFlow.openReview(cabinetItemToLegacyPresentation(booking, userProfile.uid))
            }
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
            collaborationProposals={collaboration.proposals}
            onAcceptProposal={collaboration.handleAcceptProposal}
            onDeclineProposal={collaboration.handleDeclineProposal}
            proposalSubmittingId={collaboration.submittingId}
            onWithdrawCancellation={collaboration.handleWithdrawCancellation}
            onRescheduleBooking={collaboration.setRescheduleTarget}
            collaborationSubmittingId={collaboration.submittingId}
            onCourseWithdraw={onCourseWithdraw}
            onCourseRequestCancellation={onCourseRequestCancellation}
          />

          <RescheduleBookingModal
            booking={collaboration.rescheduleTarget}
            onClose={() => collaboration.setRescheduleTarget(null)}
            onSubmit={collaboration.handleRescheduleSubmit}
          />

          <PersonalCabinetModals
            userProfile={userProfile}
            rawBookings={legacyModalBookings}
            courses={courses}
            instructors={instructors}
            usersList={usersList}
            reviews={reviews}
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
