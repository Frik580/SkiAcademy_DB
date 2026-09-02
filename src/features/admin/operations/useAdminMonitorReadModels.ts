import { useMemo } from 'react';
import { useAdminLessonBookingReadModels } from '../lesson-bookings/useAdminLessonBookingReadModels';
import { useAdminCourseEnrollmentReadModels } from '../course-enrollments/useAdminCourseEnrollmentReadModels';
import { mergeAdminBookingMonitorRows } from './adminBookingMonitorMapping';

export function useAdminMonitorReadModels() {
  const lessonsHot = useAdminLessonBookingReadModels({ enabled: true, view: 'hot' });
  const lessonsHistory = useAdminLessonBookingReadModels({ enabled: true, view: 'history' });
  const enrollmentsRoster = useAdminCourseEnrollmentReadModels({ view: 'roster' });
  const enrollmentsPending = useAdminCourseEnrollmentReadModels({ view: 'pending_guest' });
  const enrollmentsHistory = useAdminCourseEnrollmentReadModels({ view: 'history' });

  const bookings = useMemo(
    () =>
      mergeAdminBookingMonitorRows(
        [...lessonsHot.list.items, ...lessonsHistory.list.items],
        [
          ...enrollmentsRoster.list.items,
          ...enrollmentsPending.list.items,
          ...enrollmentsHistory.list.items,
        ]
      ),
    [
      enrollmentsHistory.list.items,
      enrollmentsPending.list.items,
      enrollmentsRoster.list.items,
      lessonsHistory.list.items,
      lessonsHot.list.items,
    ]
  );

  return {
    bookings,
    lessonsHot,
    lessonsHistory,
    enrollmentsRoster,
    enrollmentsPending,
    enrollmentsHistory,
  };
}
