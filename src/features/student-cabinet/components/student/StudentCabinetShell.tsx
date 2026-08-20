import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Booking,
  Course,
  Instructor,
  Review,
  UserProfile,
  ActivityLog,
  WalletLedgerEntry,
} from '../../../../types';
import {
  SkillConfig,
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
} from '../../../../domain/achievements';
import { AchievementsConfig } from '../../../../domain/achievements';
import { cabinetPathForTab, parseCabinetTabParam } from '../../../../lib/workspaceRoutes';
import { StudentCabinetHome } from './StudentCabinetHome';
import { StudentHistoryPanel } from './StudentHistoryPanel';
import { StudentCoachPanel } from './StudentCoachPanel';
import { BookInstructorPickerModal } from './BookInstructorPickerModal';
import {
  StudentCalendarPanel,
  StudentCoursesPanel,
  StudentDevelopmentPanel,
  StudentTrainingPanel,
} from './StudentCabinetPanels';
import {
  StudentProfileHubPanel,
  StudentProfilePersonalPanel,
  StudentProfileWalletPanel,
  StudentProfileJourneyPanel,
  StudentProfileSkillsPanel,
  StudentProfileCertificatesPanel,
  StudentProfileAchievementsPanel,
  StudentProfileSeasonPanel,
  StudentProfileVideosPanel,
  StudentProfilePreferencesPanel,
} from './StudentProfilePanels';
import { StudentCabinetTabBar, studentCabinetFooterHeight } from './StudentCabinetUI';
import { isProfileTab, resolveStudentBottomNavTab, StudentCabinetTab } from './studentCabinetUtils';
import { StudentCabinetResortSnapshot } from './StudentHomeBottomSections';

const getSwipeNeighborSequence = (
  currentTab: StudentCabinetTab,
  instructorPickerOpen: boolean
): { prevTab: StudentCabinetTab | 'book' | null; nextTab: StudentCabinetTab | 'book' | null } => {
  if (instructorPickerOpen) {
    return { prevTab: 'settings', nextTab: null };
  }

  if (isProfileTab(currentTab) && currentTab !== 'settings') {
    return { prevTab: 'settings', nextTab: null };
  }
  if (currentTab === 'history') {
    return { prevTab: 'settings', nextTab: null };
  }
  if (currentTab === 'development' || currentTab === 'calendar' || currentTab === 'courses') {
    return { prevTab: 'home', nextTab: 'coach' };
  }
  if (currentTab === 'instructors') {
    return { prevTab: 'training', nextTab: 'settings' };
  }

  const bottomTab = resolveStudentBottomNavTab(currentTab);
  const sequence: (StudentCabinetTab | 'book')[] = [
    'home',
    'training',
    'coach',
    'settings',
    'book',
  ];
  const currentIndex = sequence.indexOf(bottomTab);
  if (currentIndex === -1) return { prevTab: null, nextTab: null };

  const prevTab = currentIndex > 0 ? sequence[currentIndex - 1] : null;
  const nextTab = currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null;

  return { prevTab, nextTab };
};

export interface StudentCabinetShellProps {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  walletLedgerEntries?: WalletLedgerEntry[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  dismissedReviewIds?: string[];
  unreviewedCompletedBookings: Booking[];
  onDismissReview?: (id: string) => void;
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
  onRemoveTodayTask?: (
    task: import('../../../../features/student-cabinet/todayChecklist').TodayTaskRef
  ) => void;
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
  const [instructorPickerOpen, setInstructorPickerOpen] = useState(false);

  useEffect(() => {
    if (props.syncTabWithRoute) {
      setTab(routeTab);
    }
  }, [props.syncTabWithRoute, routeTab]);

  const goToTab = useCallback(
    (next: StudentCabinetTab) => {
      if (props.syncTabWithRoute) {
        navigate(cabinetPathForTab(next));
        return;
      }
      setTab(next);
    },
    [props.syncTabWithRoute, navigate]
  );

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
    usersList: props.usersList ?? [],
    hasUnreadChat: props.hasUnreadChat,
  };

  const panelProps = {
    ...ctx,
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
    walletLedgerEntries: props.walletLedgerEntries ?? [],
  };

  useEffect(() => {
    let touchStart: { x: number; y: number; time: number; ignore: boolean } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchStart = null;
        return;
      }

      const touch = e.touches[0];
      const target = touch.target as HTMLElement | null;

      let ignore = false;

      // Check if inside another modal overlay (not instructor picker)
      const modalOverlay = target?.closest('.ui-modal-overlay, [role="dialog"], [data-modal-open]');
      if (modalOverlay && !target?.closest('[data-instructor-picker-modal]')) {
        ignore = true;
      }

      let curr: HTMLElement | null = target;
      while (curr && curr !== document.body) {
        const tagName = curr.tagName ? curr.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(tagName)) {
          ignore = true;
          break;
        }
        if (curr.getAttribute && curr.getAttribute('data-no-swipe') === 'true') {
          ignore = true;
          break;
        }
        if (
          !curr.hasAttribute('data-student-tab-bar') &&
          curr.scrollWidth > curr.clientWidth + 20
        ) {
          const style = window.getComputedStyle(curr);
          if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
            ignore = true;
            break;
          }
        }
        curr = curr.parentElement;
      }

      touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        ignore,
      };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart || touchStart.ignore) {
        touchStart = null;
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) {
        touchStart = null;
        return;
      }

      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      const duration = Date.now() - touchStart.time;
      touchStart = null;

      if (duration > 800) return;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX >= 35 && absX > absY * 1.1) {
        const { prevTab, nextTab } = getSwipeNeighborSequence(activeTab, instructorPickerOpen);
        const targetTab = deltaX < 0 ? prevTab : deltaX > 0 ? nextTab : null;

        if (targetTab === 'book') {
          setInstructorPickerOpen(true);
        } else if (targetTab) {
          if (instructorPickerOpen) {
            setInstructorPickerOpen(false);
          }
          goToTab(targetTab);
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [activeTab, instructorPickerOpen, goToTab]);

  return (
    <div
      className="relative w-full min-w-0"
      style={{
        paddingBottom: studentCabinetFooterHeight,
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
          onBack={() => goToTab('settings')}
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
      {activeTab === 'profile_wallet' && <StudentProfileWalletPanel {...panelProps} />}
      {activeTab === 'profile_journey' && <StudentProfileJourneyPanel {...panelProps} />}
      {activeTab === 'profile_skills' && <StudentProfileSkillsPanel {...panelProps} />}
      {activeTab === 'profile_certificates' && <StudentProfileCertificatesPanel {...panelProps} />}
      {activeTab === 'profile_achievements' && <StudentProfileAchievementsPanel {...panelProps} />}
      {activeTab === 'profile_season' && <StudentProfileSeasonPanel {...panelProps} />}
      {activeTab === 'profile_videos' && <StudentProfileVideosPanel {...panelProps} />}
      {activeTab === 'profile_preferences' && <StudentProfilePreferencesPanel {...panelProps} />}

      <StudentCabinetTabBar
        activeTab={activeTab}
        onSelect={(tab) => {
          setInstructorPickerOpen(false);
          goToTab(tab);
        }}
        onOpenBooking={() => setInstructorPickerOpen(true)}
        instructorPickerOpen={instructorPickerOpen}
      />

      <BookInstructorPickerModal
        open={instructorPickerOpen}
        onClose={() => setInstructorPickerOpen(false)}
        userProfile={props.userProfile}
        bookings={props.bookings}
        instructors={props.instructors}
        onSelectInstructor={props.onBookInstructor}
        onBrowseCourses={() => goToTab('courses')}
      />
    </div>
  );
};
