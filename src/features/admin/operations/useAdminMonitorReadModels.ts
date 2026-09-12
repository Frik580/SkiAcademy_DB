import { useMemo } from 'react';
import { useAdminLessonBookingReadModels } from '../lesson-bookings/useAdminLessonBookingReadModels';
import { useAdminCourseEnrollmentReadModels } from '../course-enrollments/useAdminCourseEnrollmentReadModels';
import { mergeAdminBookingMonitorRows } from './adminBookingMonitorMapping';

export function useAdminMonitorReadModels() {
  const lessonsHot = useAdminLessonBookingReadModels({
    enabled: true,
    view: 'hot',
    drainAll: true,
  });
  const lessonsHistory = useAdminLessonBookingReadModels({
    enabled: true,
    view: 'history',
    drainAll: true,
  });
  const enrollmentsRoster = useAdminCourseEnrollmentReadModels({ view: 'roster' });
  const enrollmentsPending = useAdminCourseEnrollmentReadModels({ view: 'pending_guest' });
  const enrollmentsHistory = useAdminCourseEnrollmentReadModels({ view: 'history' });

  const activeBookings = useMemo(
    () =>
      mergeAdminBookingMonitorRows(lessonsHot.list.items, [
        ...enrollmentsRoster.list.items,
        ...enrollmentsPending.list.items,
      ]),
    [enrollmentsPending.list.items, enrollmentsRoster.list.items, lessonsHot.list.items]
  );

  return {
    bookings: activeBookings,
    lessonsHot,
    lessonsHistory,
    enrollmentsRoster,
    enrollmentsPending,
    enrollmentsHistory,
  };
}
