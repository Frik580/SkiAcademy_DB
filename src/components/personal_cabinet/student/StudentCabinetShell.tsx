import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Booking, Course, Instructor, Review, UserProfile, ActivityLog } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../../../lib/skillData';
import { AchievementsConfig } from '../../../lib/achievementConfig';
import { cabinetPathForTab, parseCabinetTabParam } from '../../../lib/workspaceRoutes';
import { StudentCabinetHome } from './StudentCabinetHome';
import { StudentHistoryPanel } from './StudentHistoryPanel';
import { StudentCoachPanel } from './StudentCoachPanel';
import {
  StudentCalendarPanel,
  StudentCoursesPanel,
  StudentDevelopmentPanel,
  StudentTrainingPanel,
} from './StudentCabinetPanels';
import {
  StudentProfileHubPanel,
  StudentProfilePersonalPanel,
  StudentProfileJourneyPanel,
  StudentProfileSkillsPanel,
  StudentProfileCertificatesPanel,
  StudentProfileAchievementsPanel,
  StudentProfileSeasonPanel,
  StudentProfileVideosPanel,
  StudentProfilePreferencesPanel,
} from './StudentProfilePanels';
import { StudentCabinetTabBar, STUDENT_TAB_BAR_HEIGHT } from './StudentCabinetUI';
import { StudentCabinetTab } from './studentCabinetUtils';
import { StudentCabinetResortSnapshot } from './StudentHomeBottomSections';

export interface StudentCabinetShellProps {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  dismissedReviewIds?: string[];
  unreviewedCompletedBookings: Booking[];
  onDismissReview?: (id: string) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: import('../../../lib/todayChecklist').TodayTaskRef) => void;
  onSignOut: () => void;
  onUpdateProfile?: (data: Partial<UserProfile>) => Promise<void>;
  onLevelBadgeClick: () => void;
  onInvalidFile: () => void;
  onUploadSuccess: () => void;
  onUploadError: () => void;
  onViewCourseDetails: (course: Course) => void;
  onRequireCourseAuth: (course: Course) => void;
  onBookCourse: (courseId: string) => void;
  onBookInstructor: (instructor: Instructor) => void;
  onViewInstructorReviews: (instructor: Instructor) => void;
  syncTabWithRoute?: boolean;
  resortSnapshot?: StudentCabinetResortSnapshot;
  onToggleTemperatureUnit?: () => void;
  usersList?: UserProfile[];
}

export const StudentCabinetShell: React.FC<StudentCabinetShellProps> = (props) => {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const routeTab = parseCabinetTabParam(tabParam);
  const [tab, setTab] = useState<StudentCabinetTab>(routeTab);

  useEffect(() => {
    if (props.syncTabWithRoute) {
      setTab(routeTab);
    }
  }, [props.syncTabWithRoute, routeTab]);

  const goToTab = (next: StudentCabinetTab) => {
    if (props.syncTabWithRoute) {
      navigate(cabinetPathForTab(next));
      return;
    }
    setTab(next);
  };

  const activeTab = props.syncTabWithRoute ? routeTab : tab;

  useEffect(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.querySelector('main')?.scrollTo(0, 0);
    });
  }, [activeTab]);

  const skillProgress = calculateSkillProgress(
    props.userProfile.skillScores || {},
    props.skillConfig?.items || DEFAULT_SKILL_CONFIG.items,
    props.userProfile.level || 1,
    props.skillConfig?.passPercentage ?? 80
  );

  const ctx = {
    userProfile: props.userProfile,
    bookings: props.bookings,
    courses: props.courses,
    instructors: props.instructors,
    reviews: props.reviews,
    activityLogs: props.activityLogs ?? [],
    dismissedReviewIds: props.dismissedReviewIds ?? [],
    skillConfig: props.skillConfig,
    achievementsConfig: props.achievementsConfig,
    onOpenSession: (booking: Booking) => props.onChat(booking),
    onOpenLesson: props.onOpenLesson,
    onWriteReview: props.onWriteReview,
    onDismissReview: props.onDismissReview,
    onGoToTab: goToTab,
    onOpenDevelopmentSection: () => goToTab('development'),
    onContinueDevelopment: () => goToTab('development'),
    onToggleRecommendation: props.onToggleRecommendation,
    onToggleSkillToday: props.onToggleSkillToday,
    onPinSkillsToday: props.onPinSkillsToday,
    onToggleTodayTaskComplete: props.onToggleTodayTaskComplete,
    onAddCustomTodayTask: props.onAddCustomTodayTask,
    onRemoveTodayTask: props.onRemoveTodayTask,
    onViewCourseDetails: props.onViewCourseDetails,
    onRequireCourseAuth: props.onRequireCourseAuth,
    onBookCourse: props.onBookCourse,
    onBookInstructor: props.onBookInstructor,
    onViewInstructorReviews: props.onViewInstructorReviews,
    resortSnapshot: props.resortSnapshot,
    onToggleTemperatureUnit: props.onToggleTemperatureUnit,
  };

  const panelProps = {
    ...ctx,
    onReschedule: props.onReschedule,
    onCancel: props.onCancel,
    onChat: props.onChat,
    onWriteReview: props.onWriteReview,
    onSignOut: props.onSignOut,
    onUpdateProfile: props.onUpdateProfile,
    onLevelBadgeClick: props.onLevelBadgeClick,
    skillProgress,
    onToggleSkillToday: props.onToggleSkillToday,
    onPinSkillsToday: props.onPinSkillsToday,
    onToggleTodayTaskComplete: props.onToggleTodayTaskComplete,
    onAddCustomTodayTask: props.onAddCustomTodayTask,
    onRemoveTodayTask: props.onRemoveTodayTask,
    onInvalidFile: props.onInvalidFile,
    onUploadSuccess: props.onUploadSuccess,
    onUploadError: props.onUploadError,
  };

  return (
    <div
      className="relative w-full min-w-0"
      style={{
        paddingBottom: `calc(${STUDENT_TAB_BAR_HEIGHT} + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {activeTab === 'home' && <StudentCabinetHome {...ctx} />}
      {activeTab === 'training' && <StudentTrainingPanel onGoToTab={goToTab} />}
      {activeTab === 'history' && (
        <StudentHistoryPanel
          userProfile={props.userProfile}
          bookings={props.bookings}
          courses={props.courses}
          reviews={props.reviews}
          activityLogs={props.activityLogs}
          dismissedReviewIds={props.dismissedReviewIds}
          onOpenLesson={props.onOpenLesson}
          onWriteReview={props.onWriteReview}
          onOpenDevelopment={() => goToTab('development')}
          onBack={() => goToTab('home')}
          onToggleRecommendation={props.onToggleRecommendation}
        />
      )}
      {activeTab === 'development' && (
        <StudentDevelopmentPanel {...panelProps} onToggleSkillToday={props.onToggleSkillToday} />
      )}
      {activeTab === 'calendar' && (
        <StudentCalendarPanel
          {...panelProps}
          unreviewedCompletedBookings={props.unreviewedCompletedBookings}
          onDismissReview={props.onDismissReview}
        />
      )}
      {activeTab === 'courses' && (
        <StudentCoursesPanel
          {...panelProps}
          onViewCourseDetails={props.onViewCourseDetails}
          onRequireCourseAuth={props.onRequireCourseAuth}
          onBookCourse={props.onBookCourse}
        />
      )}
      {(activeTab === 'coach' || activeTab === 'instructors') && (
        <StudentCoachPanel
          bookings={props.bookings}
          courses={props.courses}
          instructors={props.instructors}
          userProfile={props.userProfile}
          usersList={props.usersList}
          activityLogs={props.activityLogs}
          skillConfig={props.skillConfig}
          onGoToTab={goToTab}
          onChat={props.onChat}
          onOpenLesson={props.onOpenLesson}
          onToggleRecommendation={props.onToggleRecommendation}
          onBookInstructor={props.onBookInstructor}
          onViewInstructorReviews={props.onViewInstructorReviews}
        />
      )}
      {activeTab === 'settings' && <StudentProfileHubPanel onGoToTab={goToTab} />}
      {activeTab === 'profile_personal' && <StudentProfilePersonalPanel {...panelProps} />}
      {activeTab === 'profile_journey' && <StudentProfileJourneyPanel {...panelProps} />}
      {activeTab === 'profile_skills' && <StudentProfileSkillsPanel {...panelProps} />}
      {activeTab === 'profile_certificates' && (
        <StudentProfileCertificatesPanel {...panelProps} />
      )}
      {activeTab === 'profile_achievements' && (
        <StudentProfileAchievementsPanel {...panelProps} />
      )}
      {activeTab === 'profile_season' && <StudentProfileSeasonPanel {...panelProps} />}
      {activeTab === 'profile_videos' && <StudentProfileVideosPanel {...panelProps} />}
      {activeTab === 'profile_preferences' && (
        <StudentProfilePreferencesPanel {...panelProps} />
      )}

      <StudentCabinetTabBar activeTab={activeTab} onSelect={goToTab} />
    </div>
  );
};
