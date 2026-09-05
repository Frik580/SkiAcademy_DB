import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
import type { Instructor, UserProfile } from '../../../types';
import { CanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import {
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_PLANNER_DATE_QUERY_KEY,
  ADMIN_PLANNER_FOCUS_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';
import { ScheduleCalendar } from '../components/schedule/ScheduleCalendar';
import type { PlannerCreateOccupancyInput } from '../components/schedule/scheduleContracts';
import type { ScheduleViewMode } from '../components/schedule/ScheduleToolbar';
import { formatDateLocalYMD } from '../components/schedule/scheduleUtils';
import { useScheduleTranslations } from '../components/schedule/useScheduleTranslations';
import {
  mapPlannerCourses,
  mapPlannerInstructors,
  mapPlannerOccupancyToBookings,
} from './adminPlannerMapping';
import { filterOccupancyForLocalDate, plannerFetchWindow } from './adminPlannerDayWindow';
import { resolveAdminTimeZone } from './adminTimeZone';
import {
  changePlannerOccupancyDuration,
  completePlannerLesson,
  createPlannerOccupancyFromLegacyBookingShape,
  linkPlannerGuestBooking,
  reassignPlannerOccupancy,
  releasePlannerOccupancy,
  reschedulePlannerOccupancy,
} from './adminPlannerCommands';
import { useAdminPlannerReadModels } from './useAdminPlannerReadModels';

const EMPTY_PLANNER_OCCUPANCY: readonly AdminPlannerOccupancyItem[] = [];

interface AdminPlannerBoardProps {
  readonly adminProfile: UserProfile;
  readonly usersList: UserProfile[];
  readonly fallbackInstructors: Instructor[];
}

async function runPlannerMutation(
  mutation: () => Promise<void>,
  refresh: () => Promise<void>
): Promise<void> {
  try {
    await mutation();
  } catch (error) {
    if (
      error instanceof CanonicalCommandClientError &&
      (error.code === 'stale_version' || error.code === 'concurrent_modification')
    ) {
      await refresh();
    }
    throw error;
  }
  await refresh();
}

export function AdminPlannerBoard({
  adminProfile,
  usersList,
  fallbackInstructors,
}: AdminPlannerBoardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const plannerDateParam = searchParams.get(ADMIN_PLANNER_DATE_QUERY_KEY);
  const focusBookingId = searchParams.get(ADMIN_PLANNER_FOCUS_QUERY_KEY) ?? undefined;
  const [localDate, setLocalDate] = useState(
    () => plannerDateParam || formatDateLocalYMD(new Date())
  );
  const [view, setView] = useState<ScheduleViewMode>('day');
  const fetchWindow = useMemo(() => plannerFetchWindow(localDate, view), [localDate, view]);
  const planner = useAdminPlannerReadModels({
    enabled: true,
    localDate: fetchWindow.localDate,
    view: fetchWindow.view,
  });
  const occupancy = planner.item?.occupancy ?? EMPTY_PLANNER_OCCUPANCY;
  const plannerTimeZone = planner.item?.timeZone ?? resolveAdminTimeZone();
  const { t } = useScheduleTranslations();

  useEffect(() => {
    if (plannerDateParam && plannerDateParam !== localDate) {
      setLocalDate(plannerDateParam);
    }
  }, [localDate, plannerDateParam]);

  const visibleOccupancy = useMemo(() => {
    if (view !== 'day') return occupancy;
    return filterOccupancyForLocalDate(occupancy, localDate, plannerTimeZone);
  }, [localDate, occupancy, plannerTimeZone, view]);

  const instructors = useMemo(() => {
    const mapped = planner.item ? mapPlannerInstructors(planner.item) : [];
    return mapped.length > 0 ? mapped : fallbackInstructors;
  }, [fallbackInstructors, planner.item]);
  const bookings = useMemo(
    () =>
      mapPlannerOccupancyToBookings(
        view === 'day' ? visibleOccupancy : occupancy,
        view === 'day' ? localDate : undefined
      ),
    [localDate, occupancy, view, visibleOccupancy]
  );
  const courses = useMemo(
    () =>
      mapPlannerCourses(
        view === 'day' ? visibleOccupancy : occupancy,
        view === 'day' ? localDate : undefined
      ),
    [localDate, occupancy, view, visibleOccupancy]
  );

  const handleWindowChange = useCallback(
    (nextDate: string, nextView: ScheduleViewMode) => {
      setLocalDate(nextDate);
      setView(nextView);
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(ADMIN_PLANNER_DATE_QUERY_KEY, nextDate);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleAddBooking = useCallback(
    async (booking: PlannerCreateOccupancyInput) => {
      await runPlannerMutation(
        () =>
          createPlannerOccupancyFromLegacyBookingShape({
            adminAccountId: adminProfile.uid,
            booking,
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, planner.refresh]
  );

  const handleReschedule = useCallback(
    async (id: string, newDate: string, newTime: string) => {
      await runPlannerMutation(
        () =>
          reschedulePlannerOccupancy({
            adminAccountId: adminProfile.uid,
            occupancy,
            occupancyId: id,
            localDate: newDate,
            localTime: newTime,
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, occupancy, planner.refresh]
  );

  const handleReassign = useCallback(
    async (id: string, instructor: Instructor, newDate?: string, newTime?: string) => {
      await runPlannerMutation(
        () =>
          reassignPlannerOccupancy({
            adminAccountId: adminProfile.uid,
            occupancy,
            occupancyId: id,
            instructor,
            localDate: newDate,
            localTime: newTime,
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, occupancy, planner.refresh]
  );

  const handleChangeDuration = useCallback(
    async (id: string, durationHours: number) => {
      await runPlannerMutation(
        () =>
          changePlannerOccupancyDuration({
            adminAccountId: adminProfile.uid,
            occupancy,
            occupancyId: id,
            durationMinutes: Math.max(1, Math.round(durationHours * 60)),
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, occupancy, planner.refresh]
  );

  const handleRelease = useCallback(
    async (id: string) => {
      await runPlannerMutation(
        () =>
          releasePlannerOccupancy({
            adminAccountId: adminProfile.uid,
            occupancy,
            occupancyId: id,
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, occupancy, planner.refresh]
  );

  const handleComplete = useCallback(
    async (id: string) => {
      await runPlannerMutation(
        () =>
          completePlannerLesson({
            adminAccountId: adminProfile.uid,
            occupancy,
            occupancyId: id,
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, occupancy, planner.refresh]
  );

  const handleLink = useCallback(
    async (bookingId: string, targetUserId: string) => {
      await runPlannerMutation(
        () =>
          linkPlannerGuestBooking({
            adminAccountId: adminProfile.uid,
            occupancy,
            occupancyId: bookingId,
            targetAccountId: targetUserId,
          }),
        planner.refresh
      );
    },
    [adminProfile.uid, occupancy, planner.refresh]
  );

  const handleOpenLessonDetail = useCallback(
    (bookingId: string) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(ADMIN_TAB_QUERY_KEY, 'operations');
          next.set(ADMIN_LESSON_BOOKING_QUERY_KEY, bookingId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleFocusConsumed = useCallback(() => {
    setSearchParams(
      (previous) => {
        if (!previous.get(ADMIN_PLANNER_FOCUS_QUERY_KEY)) return previous;
        const next = new URLSearchParams(previous);
        next.delete(ADMIN_PLANNER_FOCUS_QUERY_KEY);
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return (
    <div className="space-y-3">
      {planner.error ? <p className="text-xs font-mono text-rose-600">{planner.error}</p> : null}
      {planner.loading ? (
        <p className="text-xs font-mono text-[var(--ink-dim)]">Loading planner…</p>
      ) : null}
      {planner.item?.truncated ? (
        <p className="text-xs font-mono text-amber-600 dark:text-amber-400">
          {t('plannerOccupancyTruncated')}
        </p>
      ) : null}
      <ScheduleCalendar
        instructors={instructors}
        bookings={bookings}
        courses={courses}
        usersList={usersList}
        adminProfile={adminProfile}
        plannerDate={localDate}
        plannerView={view}
        focusBookingId={focusBookingId}
        onFocusConsumed={handleFocusConsumed}
        onWindowChange={handleWindowChange}
        skipLegacyBalanceGate
        onAddBooking={handleAddBooking}
        onRescheduleBooking={handleReschedule}
        onReassignInstructor={handleReassign}
        onChangeBookingDuration={handleChangeDuration}
        onDeleteBooking={handleRelease}
        onCancelBooking={handleRelease}
        onCompleteBooking={handleComplete}
        onLinkGuestBooking={handleLink}
        onOpenLessonDetail={handleOpenLessonDetail}
      />
    </div>
  );
}
