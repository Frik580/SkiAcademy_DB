import React from 'react';
import {
  Booking,
  Course,
  Instructor,
  Review,
  UserProfile,
  ActivityLog,
  WalletLedgerEntry,
} from '../../../types';
import { SkillConfig } from '../../../domain/achievements';
import { AchievementsConfig } from '../../../domain/achievements';
import {
  StudentCabinetShell,
  type StudentCabinetResortSnapshot,
  type TodayTaskRef,
} from '../../../features/student-cabinet';

export interface StudentCabinetProps {
  userProfile: UserProfile;
  bookings: Booking[];
  courses?: Course[];
  instructors?: Instructor[];
  reviews?: Review[];
  activityLogs?: ActivityLog[];
  walletLedgerEntries?: WalletLedgerEntry[];
  dismissedReviewIds?: string[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  unreviewedCompletedBookings?: Booking[];
  onDismissReview?: (id: string) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
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
}

export const StudentCabinet: React.FC<StudentCabinetProps> = ({
  userProfile,
  bookings,
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
  onReschedule,
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
}) => {
  return (
    <StudentCabinetShell
      userProfile={userProfile}
      bookings={bookings}
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
      onReschedule={onReschedule}
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
    />
  );
};
