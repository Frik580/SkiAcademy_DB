import type {
  ActivityLog,
  Booking,
  Course,
  Instructor,
  Review,
  UserProfile,
} from '../../../../types';
import type { AchievementsConfig, SkillConfig } from '../../../../domain/achievements';
import type { TodayTaskRef } from '../..';
import type {
  MiniCalendarDay,
  NextSessionItem,
  StudentCabinetTab,
  TodaySessionCountdown,
  TodayTask,
} from './studentCabinetUtils';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';

export type StudentBooking =
  import('../../../../features/lesson-bookings/lessonBookingContracts').LessonBookingCabinetItem;
export type StudentCourse = Course;
export type StudentInstructor = Instructor;
export type StudentProfile = UserProfile;
export type StudentReview = Review;
export type StudentActivityLog = ActivityLog;
export type StudentSkillConfig = SkillConfig;

export interface SessionCountdownBlockInput {
  countdown: TodaySessionCountdown;
  courses: StudentCourse[];
  instructors: StudentInstructor[];
  usersList: StudentProfile[];
}

export interface CurrentSessionsBlockInput {
  sessions: CabinetSessionItem[];
  courses: StudentCourse[];
  instructors: StudentInstructor[];
  usersList: StudentProfile[];
  onOpenLesson: (booking: Booking) => void;
  onOpenSession: (booking: Booking) => void;
  onViewCourseDetails?: (courseId: string) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}

export interface NextSessionBlockInput {
  nextSessions: NextSessionItem[];
  miniDays: MiniCalendarDay[];
  courses: StudentCourse[];
  instructors: StudentInstructor[];
  usersList: StudentProfile[];
  onGoToTab: (tab: StudentCabinetTab) => void;
  onOpenLesson: (booking: Booking) => void;
  onOpenSession: (booking: Booking) => void;
  onViewCourseDetails?: (courseId: string) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}

export interface TodayProgressBlockInput {
  userProfile?: StudentProfile;
  bookings: Booking[];
  courses: StudentCourse[];
  reviews: StudentReview[];
  activityLogs?: StudentActivityLog[];
  achievementsConfig?: AchievementsConfig;
  skillConfig?: StudentSkillConfig;
  todayTasks: TodayTask[];
}

export interface SkillRadarChartInput {
  userProfile: StudentProfile;
  skillConfig?: StudentSkillConfig;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
  compact?: boolean;
  embed?: boolean;
  className?: string;
}

export type StudentTrainingPanelInput = Pick<StudentCabinetHomeContext, 'onGoToTab'>;

export type StudentDevelopmentPanelInput = Pick<
  StudentCabinetHomeContext,
  'userProfile' | 'skillConfig' | 'activityLogs' | 'onPinSkillsToday' | 'onGoToTab'
> & {
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
};

export type StudentProfileHubInput = Pick<StudentCabinetHomeContext, 'onGoToTab'>;

export type StudentProfilePanelInput = Pick<
  StudentCabinetHomeContext,
  | 'userProfile'
  | 'bookings'
  | 'courses'
  | 'reviews'
  | 'activityLogs'
  | 'dismissedReviewIds'
  | 'skillConfig'
  | 'achievementsConfig'
  | 'onGoToTab'
  | 'onOpenLesson'
  | 'onWriteReview'
  | 'onContinueDevelopment'
  | 'onToggleRecommendation'
  | 'onToggleSkillToday'
  | 'onPinSkillsToday'
> & {
  onUpdateProfile?: (data: Partial<StudentProfile>) => Promise<void>;
};

export type StudentCabinetPanelInput = {
  userProfile: StudentProfile;
  bookings: readonly StudentBooking[];
  courses: StudentCourse[];
  instructors: StudentInstructor[];
  usersList?: StudentProfile[];
  onOpenLesson: (booking: StudentBooking) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onCancel: (booking: StudentBooking) => void;
  onChat: (booking: StudentBooking) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  onWriteReview: (booking: StudentBooking) => void;
  onSignOut: () => void;
  onUpdateProfile?: (data: Partial<StudentProfile>) => Promise<void>;
  onLevelBadgeClick: () => void;
  skillProgress: ReturnType<
    typeof import('../../../../domain/achievements').calculateSkillProgress
  >;
};

export type StudentProfilePanelProps = StudentProfilePanelInput & {
  onSignOut: () => void;
  onInvalidFile: () => void;
  onUploadSuccess: () => void;
  onUploadError: () => void;
  skillProgress: ReturnType<
    typeof import('../../../../domain/achievements').calculateSkillProgress
  >;
  walletLedgerEntries?: import('../../../../types').WalletLedgerEntry[];
};

/** The complete data boundary for the student-cabinet home container. */
export interface StudentCabinetHomeContext {
  userProfile: UserProfile;
  bookings: Booking[];
  sessionItems: readonly CabinetSessionItem[];
  courses: Course[];
  instructors: Instructor[];
  usersList?: UserProfile[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  dismissedReviewIds?: string[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onDismissReview?: (bookingId: string) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onOpenDevelopmentSection: (sectionId: string) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: TodayTaskRef) => void;
  onViewCourseDetails: (course: Course) => void;
  onRequireCourseAuth: (course: Course) => void;
  onBookInstructor: (instructor: Instructor) => void;
  onViewInstructorReviews: (instructor: Instructor) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  resortSnapshot?: import('./StudentHomeBottomSections').StudentCabinetResortSnapshot;
  onToggleTemperatureUnit?: () => void;
}

/** Input boundary for the presentational "today" section. */
export interface StudentTodaySectionInput {
  currentSessions: CabinetSessionItem[];
  nextSession?: CabinetSessionItem | null;
  nextSessions?: NextSessionItem[];
  sessionItems: readonly CabinetSessionItem[];
  miniDays: MiniCalendarDay[];
  courses: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  todayTasks: TodayTask[];
  bookings: Booking[];
  reviews?: Review[];
  userProfile?: UserProfile;
  activityLogs?: ActivityLog[];
  achievementsConfig?: AchievementsConfig;
  skillConfig?: SkillConfig;
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onViewCourseDetails?: (courseId: string) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: TodayTaskRef) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}
