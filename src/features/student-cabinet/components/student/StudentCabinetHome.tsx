import { compactStudentDashboardLanes } from '../../../settings/studentDashboardVerticalLayout';
import { useStudentDashboardTileHeights } from './useStudentDashboardTileHeights';
import {
  useStudentTodayAchievements,
  hasStudentTodayProgress,
} from './useStudentTodayAchievements';
import { resolveStudentDashboardDesktopLayout } from '../../../settings/studentDashboardDesktopLayout';
import { StudentDashboardPlacementContext } from './studentDashboardPlacementContext';
import { useStudentDashboardViewport } from './useStudentDashboardDesktop';
import { resolveStudentDashboardTabletLayout } from '../../../settings/studentDashboardTabletLayout';
import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import React, { useMemo, useState, useRef } from 'react';
import { YourJourneySection } from '../../../../features/journey';
import {
  getMiniCalendarDaysFromSessions,
  sessionItemKey,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';
import {
  getCurrentSessions,
  getFirstName,
  getGreeting,
  getTodayTasks,
  getTodaySessionCountdown,
  getNextStepAction,
  getNeedsAttentionBookings,
} from './studentCabinetUtils';
import { buildCanonicalRecommendationTodayTasks } from '../../studentLessonFeedbackPresentation';
import { usePresentedParticipantLessonFeedback } from '../../usePresentedParticipantLessonFeedback';
import { ScTextButton } from './StudentCabinetUI';
import { StudentNeedsAttention } from './StudentNeedsAttention';
import {
  CurrentSessionsBlock,
  NextSessionBlock,
  SessionCountdownBlock,
} from './StudentTodaySessionBlocks';
import { TodayTasksBlock } from './StudentTodayTasksBlock';
import { PresentedTodayProgressBlock } from './StudentTodayProgressBlock';
import { StudentNextStepCard } from './StudentNextStepCard';
import { StudentDashboardTile, STUDENT_DASHBOARD_GRID_CLASSES } from './StudentDashboardTile';
import { useSettingsStore } from '../../../settings/settingsStore';
import {
  STUDENT_DASHBOARD_TILES,
  type StudentDashboardTileKey,
} from '../../../settings/studentDashboardLayout';
import { LazySkillRadarChart } from './LazySkillRadarChart';
import {
  StudentCabinetWeatherSection,
  StudentLatestRecommendationSection,
} from './StudentHomeBottomSections';
import { buildNextSessionCards, buildSessionParticipants } from './studentSessionParticipants';
import type { StudentCabinetHomeContext } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import { buildParticipantTodayProgress } from './studentTodayProgress';

type StudentCabinetHomeProps = StudentCabinetHomeContext;

export type { StudentCabinetHomeContext as StudentCabinetContext } from './studentCabinetContracts';

export const StudentCabinetHome: React.FC<StudentCabinetHomeProps> = (props) => {
  const { t, lang } = useStudentCabinetTranslations();
  const viewport = useStudentDashboardViewport();
  const isDesktop = viewport === 'desktop';
  const isTablet = viewport === 'tablet';
  const gridRef = useRef<HTMLDivElement>(null);
  const [expiredCountdown, setExpiredCountdown] = useState<number | null>(null);
  const layout = useSettingsStore((state) => state.studentDashboardLayout);
  const {
    userProfile,
    selectedParticipantId,
    bookings,
    sessionItems,
    courses,
    instructors,
    reviews,
    usersList = [],
    dismissedReviewIds = [],
    skillConfig,
    onOpenSession,
    onOpenLesson,
    onOpenLessonByBookingId,
    onViewCourseDetails,
    onWriteReview,
    onDismissReview,
    onGoToTab,
    onContinueDevelopment,
    onToggleSkillToday,
    onToggleRecommendation,
    onToggleTodayTaskComplete,
    onAddCustomTodayTask,
    onRemoveTodayTask,
    resortSnapshot,
    onToggleTemperatureUnit,
  } = props;

  const hideProgress = Boolean(userProfile.hideProgressTracking);
  const selectedParticipant = props.participantProfiles?.find(
    (participant) => participant.participantId === selectedParticipantId
  );
  const scopeParticipant =
    (props.participantProfiles?.length ?? 0) > 1 ? selectedParticipant : undefined;
  const feedback = usePresentedParticipantLessonFeedback(bookings);
  const todayProgress = buildParticipantTodayProgress(
    selectedParticipantId,
    props.participantProgress,
    skillConfig,
    lang
  );
  const todayAchievements = useStudentTodayAchievements({
    selectedParticipantId,
    achievementsConfig: props.achievementsConfig,
    skillConfig,
  });
  const pendingFeedback = feedback.incomplete
    .map((item) => feedback.feedbackForLesson(item.lessonBookingId))
    .filter((item): item is NonNullable<typeof item> => item != null);
  const showAchievements = hasStudentTodayProgress(todayProgress, todayAchievements);
  const showAttention =
    pendingFeedback.length > 0 ||
    getNeedsAttentionBookings(bookings, reviews, dismissedReviewIds, userProfile.uid).length > 0;
  const openLessonById = (lessonBookingId: string) => {
    if (onOpenLessonByBookingId) {
      onOpenLessonByBookingId(lessonBookingId);
      return;
    }
    const booking = bookings.find((item) => item.id === lessonBookingId);
    if (booking) onOpenLesson(booking);
  };

  const nextSessionItems = props.nextSessionItems ?? sessionItems;
  const { nextSessions, participantsBySessionKey } = useMemo(
    () => buildNextSessionCards(nextSessionItems, props.participantProfiles ?? [], new Date()),
    [nextSessionItems, props.participantProfiles]
  );
  const countdown = useMemo(() => getTodaySessionCountdown(nextSessionItems), [nextSessionItems]);
  const countdownParticipants = useMemo(
    () =>
      countdown
        ? (buildSessionParticipants([countdown.session], props.participantProfiles ?? [])[
            sessionItemKey(countdown.session)
          ] ?? [])
        : [],
    [countdown, props.participantProfiles]
  );
  const currentSessions = useMemo(
    () => getCurrentSessions(nextSessionItems, new Date()),
    [nextSessionItems]
  );
  const currentParticipantsBySessionKey = useMemo(
    () => buildSessionParticipants(currentSessions, props.participantProfiles ?? []),
    [currentSessions, props.participantProfiles]
  );
  const recommendationTodayTasks = useMemo(
    () =>
      feedback.participantId
        ? buildCanonicalRecommendationTodayTasks({
            items: feedback.items,
            participantId: feedback.participantId,
            dismissedTaskIds: new Set(userProfile.dismissedTodayTaskIds ?? []),
            contextByLessonId: feedback.contextByLessonId,
            language: lang,
          })
        : [],
    [
      feedback.contextByLessonId,
      feedback.items,
      feedback.participantId,
      lang,
      userProfile.dismissedTodayTaskIds,
    ]
  );
  const todayTasks = useMemo(
    () => getTodayTasks(userProfile, lang, skillConfig, recommendationTodayTasks),
    [userProfile, lang, skillConfig, recommendationTodayTasks]
  );
  const miniDays = useMemo(
    () => getMiniCalendarDaysFromSessions(sessionItems, lang),
    [sessionItems, lang]
  );
  const showWeather = Boolean(resortSnapshot) && props.hasAnyParticipantSessionToday;

  const viewCourseById = useMemo(
    () =>
      onViewCourseDetails
        ? (courseId: string, enrollmentId?: string) => {
            const course = courses.find((item) => item.id === courseId);
            if (course) onViewCourseDetails(course, enrollmentId);
          }
        : undefined,
    [courses, onViewCourseDetails]
  );

  const nextStepAction = useMemo(
    () => getNextStepAction(userProfile, recommendationTodayTasks[0], skillConfig, lang),
    [userProfile, recommendationTodayTasks, skillConfig, lang]
  );
  const showCountdown = Boolean(
    countdown &&
    countdown.startsAt.getTime() > Date.now() &&
    expiredCountdown !== countdown.startsAt.getTime()
  );
  const tiles: Record<StudentDashboardTileKey, React.ReactNode> = {
    currentSessions:
      currentSessions.length > 0 ? (
        <StudentDashboardTile
          tileKey={STUDENT_DASHBOARD_TILES.currentSessions.key}
          size={layout.tiles.currentSessions.desktopSize}
        >
          <CurrentSessionsBlock
            sessions={currentSessions}
            participantsBySessionKey={currentParticipantsBySessionKey}
            courses={courses}
            instructors={instructors}
            usersList={usersList}
            onOpenLesson={onOpenLesson}
            onOpenSession={onOpenSession}
            onViewCourseDetails={viewCourseById}
            hasUnreadChat={props.hasUnreadChat}
          />
        </StudentDashboardTile>
      ) : null,
    countdown:
      countdown && showCountdown ? (
        <SessionCountdownBlock
          key={countdown.startsAt.getTime()}
          dashboardSize={layout.tiles.countdown.desktopSize}
          countdown={countdown}
          onExpire={() => setExpiredCountdown(countdown.startsAt.getTime())}
          participants={countdownParticipants}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
        />
      ) : null,
    todayTasks: (
      <StudentDashboardTile
        tileKey={STUDENT_DASHBOARD_TILES.todayTasks.key}
        size={layout.tiles.todayTasks.desktopSize}
      >
        <TodayTasksBlock
          key={`tasks:${selectedParticipantId}`}
          todayTasks={todayTasks}
          scopeParticipant={scopeParticipant}
          bookings={bookings}
          onToggleRecommendation={onToggleRecommendation}
          onToggleTodayTaskComplete={onToggleTodayTaskComplete}
          onAddCustomTodayTask={onAddCustomTodayTask}
          onRemoveTodayTask={onRemoveTodayTask}
          onOpenLesson={onOpenLesson}
          onContinueDevelopment={onContinueDevelopment}
        />
      </StudentDashboardTile>
    ),
    nextStep: nextStepAction ? (
      <StudentDashboardTile
        tileKey={STUDENT_DASHBOARD_TILES.nextStep.key}
        size={layout.tiles.nextStep.desktopSize}
      >
        <section>
          <StudentDashboardTileHeader
            title={t('scNextStepTitle')}
            actions={
              <ParticipantScopeIndicator
                participant={scopeParticipant}
                visible={Boolean(scopeParticipant)}
              />
            }
          />
          <StudentDashboardTileBody>
            <StudentNextStepCard
              action={nextStepAction}
              onStartExercise={(exerciseId) => {
                const pinned = userProfile.todaySkillItemIds?.includes(exerciseId);
                if (!pinned) void onToggleSkillToday?.(exerciseId, true);
              }}
              onOpenRecommendation={(bookingId) => {
                const booking = bookings.find((item) => item.id === bookingId);
                if (booking) onOpenLesson(booking);
              }}
              onContinueDevelopment={onContinueDevelopment}
            />
          </StudentDashboardTileBody>
        </section>
      </StudentDashboardTile>
    ) : null,
    nextSession: (
      <StudentDashboardTile
        tileKey={STUDENT_DASHBOARD_TILES.nextSession.key}
        size={layout.tiles.nextSession.desktopSize}
      >
        <NextSessionBlock
          nextSessions={nextSessions}
          participantsBySessionKey={participantsBySessionKey}
          miniDays={miniDays}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
          onGoToTab={onGoToTab}
          onOpenLesson={onOpenLesson}
          onOpenSession={onOpenSession}
          onViewCourseDetails={viewCourseById}
          hasUnreadChat={props.hasUnreadChat}
        />
      </StudentDashboardTile>
    ),
    todayAchievements: showAchievements ? (
      <PresentedTodayProgressBlock
        key={`progress:${selectedParticipantId}`}
        dashboardSize={layout.tiles.todayAchievements.desktopSize}
        progress={todayProgress}
        todayAchievements={todayAchievements}
        scopeParticipant={scopeParticipant}
        selectedParticipantId={selectedParticipantId}
        achievementsConfig={props.achievementsConfig}
        skillConfig={skillConfig}
      />
    ) : null,
    skillRadar: !hideProgress ? (
      <StudentDashboardTile
        tileKey={STUDENT_DASHBOARD_TILES.skillRadar.key}
        size={layout.tiles.skillRadar.desktopSize}
      >
        <section>
          <StudentDashboardTileHeader
            title={t('scRadarTitle')}
            actions={
              <ParticipantScopeIndicator
                participant={scopeParticipant}
                visible={Boolean(scopeParticipant)}
              />
            }
          />
          <StudentDashboardTileBody>
            <LazySkillRadarChart
              key={selectedParticipantId}
              userProfile={userProfile}
              skillConfig={skillConfig}
              onToggleSkillToday={onToggleSkillToday}
              compact
              embed
            />
            <div className="pt-2">
              <ScTextButton arrow onClick={onContinueDevelopment}>
                {t('scContinueDevelopment')}
              </ScTextButton>
            </div>
          </StudentDashboardTileBody>
        </section>
      </StudentDashboardTile>
    ) : null,
    needsAttention: showAttention ? (
      <StudentNeedsAttention
        key={`attention:${selectedParticipantId}`}
        dashboardSize={layout.tiles.needsAttention.desktopSize}
        bookings={bookings}
        reviews={reviews}
        userId={userProfile.uid}
        dismissedReviewIds={dismissedReviewIds}
        pendingFeedback={pendingFeedback}
        onOpenLesson={onOpenLesson}
        onOpenFeedbackLesson={openLessonById}
        onWriteReview={onWriteReview}
        onDismissReview={onDismissReview}
      />
    ) : null,
    instructorRecommendations: (
      <StudentDashboardTile
        tileKey={STUDENT_DASHBOARD_TILES.instructorRecommendations.key}
        size={layout.tiles.instructorRecommendations.desktopSize}
      >
        <StudentLatestRecommendationSection
          key={`recommendation:${selectedParticipantId}`}
          latest={feedback.latestView}
          scopeParticipant={scopeParticipant}
          highlightPending={feedback.latestHighlight?.isPending ?? false}
          highlightText={feedback.latestHighlight?.item.text ?? null}
          loading={feedback.isLoadingPlaceholder}
          onOpenLesson={openLessonById}
        />
      </StudentDashboardTile>
    ),
    weather:
      showWeather && resortSnapshot ? (
        <StudentDashboardTile
          tileKey={STUDENT_DASHBOARD_TILES.weather.key}
          size={layout.tiles.weather.desktopSize}
        >
          <StudentCabinetWeatherSection
            resort={resortSnapshot}
            onToggleTemperatureUnit={onToggleTemperatureUnit}
          />
        </StudentDashboardTile>
      ) : null,
  };

  const visibleKeys = layout.order.filter((key) => tiles[key] !== null);
  const desktopRows = isDesktop ? resolveStudentDashboardDesktopLayout(layout, visibleKeys) : [];
  const horizontal = desktopRows.flatMap((row) => row.tiles);
  const layoutIdentity = isDesktop
    ? 'desktop:' +
      horizontal.map((tile) => `${tile.key}:${tile.effectiveSize}:${tile.column}`).join('|')
    : `${viewport}:${visibleKeys.join('|')}`;
  const heights = useStudentDashboardTileHeights(gridRef, isDesktop || isTablet, layoutIdentity);
  const canCompact =
    isDesktop && horizontal.length > 0 && horizontal.every((tile) => (heights[tile.key] ?? 0) > 0);
  const compacted = canCompact ? compactStudentDashboardLanes(desktopRows, heights) : null;
  const tablet =
    isTablet && visibleKeys.length > 0 && visibleKeys.every((key) => (heights[key] ?? 0) > 0)
      ? resolveStudentDashboardTabletLayout(
          visibleKeys.map((key) => ({ key, width: 'half' })),
          heights
        )
      : null;
  const placements = tablet?.placements ?? compacted?.placements ?? horizontal;
  const renderOrder = isDesktop || tablet ? placements.map((tile) => tile.key) : visibleKeys;
  const placementMap =
    isDesktop || tablet ? new Map(placements.map((tile) => [tile.key, tile])) : null;

  return (
    <div className="space-y-0 pb-24 w-full min-w-0">
      <div className="w-full shrink-0">
        <YourJourneySection
          key={selectedParticipantId}
          skillConfig={skillConfig}
          userProfile={userProfile}
          markerParticipant={selectedParticipant}
          animateSequence={false}
          fillViewport
          onOpenDevelopment={onContinueDevelopment}
        />
      </div>
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 min-w-0">
        <header className="py-6 space-y-2.5 min-w-0">
          <p className="text-base sm:text-lg font-medium text-[var(--ink)] leading-snug break-words">
            {getGreeting(lang, getFirstName(userProfile.displayName))}
          </p>
          <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]">
            {t('scTodaySection')}
          </p>
        </header>
        <StudentDashboardPlacementContext.Provider value={placementMap}>
          <div
            ref={gridRef}
            className={`${STUDENT_DASHBOARD_GRID_CLASSES} relative`}
            style={tablet || compacted ? { height: (tablet ?? compacted)!.height } : undefined}
            data-testid="student-dashboard-grid"
          >
            {renderOrder.map((key) => (
              <React.Fragment key={key}>{tiles[key]}</React.Fragment>
            ))}
          </div>
        </StudentDashboardPlacementContext.Provider>
      </div>
    </div>
  );
};
