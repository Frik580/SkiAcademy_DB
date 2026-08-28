import React from 'react';
import {
  Course,
  Instructor,
  Review,
  UserProfile,
  ActivityLog,
  WalletLedgerEntry,
} from '../../../types';
import type { LessonBookingCabinetItem } from '../../../features/lesson-bookings/lessonBookingContracts';
import type { BookingProposalCabinetItem } from '../../../features/booking-collaboration';
import type {
  CabinetSessionItem,
  CourseEnrollmentCabinetItem,
} from '../../../features/course-enrollments';
import { SkillConfig } from '../../../domain/achievements';
import { AchievementsConfig } from '../../../domain/achievements';
import {
  StudentCabinetShell,
  type StudentCabinetResortSnapshot,
  type TodayTaskRef,
} from '../../../features/student-cabinet';

export interface StudentCabinetProps {
  userProfile: UserProfile;
  bookings: readonly LessonBookingCabinetItem[];
  courseEnrollments?: readonly CourseEnrollmentCabinetItem[];
  sessionItems?: readonly CabinetSessionItem[];
  courses?: Course[];
  instructors?: Instructor[];
  reviews?: Review[];
  activityLogs?: ActivityLog[];
  walletLedgerEntries?: WalletLedgerEntry[];
  dismissedReviewIds?: string[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  unreviewedCompletedBookings?: LessonBookingCabinetItem[];
  onDismissReview?: (id: string) => void;
  onCancel: (booking: LessonBookingCabinetItem) => void;
  onChat: (booking: LessonBookingCabinetItem) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  onOpenLesson: (booking: LessonBookingCabinetItem) => void;
  onWriteReview: (booking: LessonBookingCabinetItem) => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: TodayTaskRef) => void;
  onSignOut: () => void;
  onUpdateProfile?: (data: Partial<UserProfile>) => Promise<void>;
  onLevelBadgeClick: () => void;
  onInvalidFile: () => void;
  onUploadSuccess: () => void;
  onUploadError: () => void;
  onViewCourseDetails?: (course: Course) => void;
  onRequireCourseAuth?: (course: Course) => void;
  onBookCourse?: (courseId: string) => void;
  onBookInstructor?: (instructor: Instructor) => void;
  onViewInstructorReviews?: (instructor: Instructor) => void;
  syncTabWithRoute?: boolean;
  resortSnapshot?: StudentCabinetResortSnapshot;
  onToggleTemperatureUnit?: () => void;
  usersList?: UserProfile[];
  collaborationProposals?: readonly BookingProposalCabinetItem[];
  onAcceptProposal?: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  onDeclineProposal?: (proposal: BookingProposalCabinetItem) => void | Promise<void>;
  proposalSubmittingId?: string;
  onWithdrawCancellation?: (booking: LessonBookingCabinetItem) => void | Promise<void>;
  onRescheduleBooking?: (booking: LessonBookingCabinetItem) => void;
  collaborationSubmittingId?: string;
  onCourseWithdraw?: (enrollmentId: string) => Promise<void>;
  onCourseRequestCancellation?: (enrollmentId: string) => Promise<void>;
}

export const StudentCabinet: React.FC<StudentCabinetProps> = ({
  userProfile,
  bookings,
  courseEnrollments = [],
  sessionItems = [],
  courses = [],
  instructors = [],
  reviews = [],
  activityLogs = [],
  walletLedgerEntries = [],
  dismissedReviewIds = [],
  skillConfig,
  achievementsConfig,
  unreviewedCompletedBookings = [],
  onDismissReview,
  onCancel,
  onChat,
  hasUnreadChat,
  onOpenLesson,
  onWriteReview,
  onToggleRecommendation,
  onToggleSkillToday,
  onPinSkillsToday,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  onSignOut,
  onUpdateProfile,
  onLevelBadgeClick,
  onInvalidFile,
  onUploadSuccess,
  onUploadError,
  onViewCourseDetails,
  onRequireCourseAuth,
  onBookCourse,
  onBookInstructor,
  onViewInstructorReviews,
  syncTabWithRoute = true,
  resortSnapshot,
  onToggleTemperatureUnit,
  usersList = [],
  collaborationProposals = [],
  onAcceptProposal,
  onDeclineProposal,
  proposalSubmittingId,
  onWithdrawCancellation,
  onRescheduleBooking,
  collaborationSubmittingId,
  onCourseWithdraw,
  onCourseRequestCancellation,
}) => {
  return (
    <StudentCabinetShell
      userProfile={userProfile}
      bookings={bookings}
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
      onCancel={onCancel}
      onChat={onChat}
      hasUnreadChat={hasUnreadChat}
      onOpenLesson={onOpenLesson}
      onWriteReview={onWriteReview}
      onToggleRecommendation={onToggleRecommendation}
      onToggleSkillToday={onToggleSkillToday}
      onPinSkillsToday={onPinSkillsToday}
      onToggleTodayTaskComplete={onToggleTodayTaskComplete}
      onAddCustomTodayTask={onAddCustomTodayTask}
      onRemoveTodayTask={onRemoveTodayTask}
      onSignOut={onSignOut}
      onUpdateProfile={onUpdateProfile}
      onLevelBadgeClick={onLevelBadgeClick}
      onInvalidFile={onInvalidFile}
      onUploadSuccess={onUploadSuccess}
      onUploadError={onUploadError}
      onViewCourseDetails={onViewCourseDetails ?? (() => {})}
      onRequireCourseAuth={onRequireCourseAuth ?? (() => {})}
      onBookCourse={(courseId) => {
        void onBookCourse?.(courseId);
      }}
      onBookInstructor={onBookInstructor ?? (() => {})}
      onViewInstructorReviews={onViewInstructorReviews ?? (() => {})}
      syncTabWithRoute={syncTabWithRoute}
      resortSnapshot={resortSnapshot}
      onToggleTemperatureUnit={onToggleTemperatureUnit}
      usersList={usersList}
      collaborationProposals={collaborationProposals}
      onAcceptProposal={onAcceptProposal}
      onDeclineProposal={onDeclineProposal}
      proposalSubmittingId={proposalSubmittingId}
      onWithdrawCancellation={onWithdrawCancellation}
      onRescheduleBooking={onRescheduleBooking}
      collaborationSubmittingId={collaborationSubmittingId}
      onCourseWithdraw={onCourseWithdraw}
      onCourseRequestCancellation={onCourseRequestCancellation}
    />
  );
};
