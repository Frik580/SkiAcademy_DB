import { useCallback, useMemo, useState } from 'react';
import type { AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
import type { Booking, Instructor, UserProfile } from '../../../types';
import { CanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import { ScheduleCalendar } from '../components/schedule/ScheduleCalendar';
import type { ScheduleViewMode } from '../components/schedule/ScheduleToolbar';
import { formatDateLocalYMD } from '../components/schedule/scheduleUtils';
import { useScheduleTranslations } from '../components/schedule/useScheduleTranslations';
import {
  mapPlannerCourses,
  mapPlannerInstructors,
  mapPlannerOccupancyToBookings,
} from './adminPlannerMapping';
import {
  filterOccupancyForLocalDate,
  plannerFetchWindow,
} from './adminPlannerDayWindow';
import { resolveAdminTimeZone } from './adminTimeZone';
import {
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
  const [localDate, setLocalDate] = useState(() => formatDateLocalYMD(new Date()));
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

  const handleWindowChange = useCallback((nextDate: string, nextView: ScheduleViewMode) => {
    setLocalDate(nextDate);
    setView(nextView);
  }, []);

  const handleAddBooking = useCallback(
    async (booking: Booking) => {
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
        onWindowChange={handleWindowChange}
        skipLegacyBalanceGate
        onAddBooking={handleAddBooking}
        onRescheduleBooking={handleReschedule}
        onReassignInstructor={handleReassign}
        onDeleteBooking={handleRelease}
        onCancelBooking={handleRelease}
        onCompleteBooking={handleComplete}
        onLinkGuestBooking={handleLink}
      />
    </div>
  );
}
