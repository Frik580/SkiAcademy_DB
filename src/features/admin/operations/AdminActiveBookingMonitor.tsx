import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Instructor, UserProfile } from '../../../types';
import { BookingsLog } from '../components/bookings/BookingsLog';
import { useSharedAdminMonitorReadModels } from './AdminMonitorReadModelsContext';
import {
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';

interface AdminActiveBookingMonitorProps {
  readonly usersList: UserProfile[];
  readonly instructors: Instructor[];
}

export function AdminActiveBookingMonitor({
  usersList,
  instructors,
}: AdminActiveBookingMonitorProps) {
  const [, setSearchParams] = useSearchParams();
  const {
    bookings,
    lessonsHot,
    lessonsHistory,
    enrollmentsRoster,
    enrollmentsPending,
    enrollmentsHistory,
  } = useSharedAdminMonitorReadModels();

  const loadMore = useCallback(() => {
    if (lessonsHot.list.hasMore) void lessonsHot.loadMore();
    if (lessonsHistory.list.hasMore) void lessonsHistory.loadMore();
    enrollmentsRoster.loadMore?.();
    enrollmentsPending.loadMore?.();
    enrollmentsHistory.loadMore?.();
  }, [enrollmentsHistory, enrollmentsPending, enrollmentsRoster, lessonsHistory, lessonsHot]);

  const handleOpenLesson = useCallback(
    (bookingId: string) => {
      const row = bookings.find((booking) => booking.id === bookingId);
      const view =
        row?.status === 'completed' || row?.status === 'cancelled' ? 'history' : 'hot';
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(ADMIN_TAB_QUERY_KEY, 'operations');
          next.set(ADMIN_LESSON_BOOKING_QUERY_KEY, bookingId);
          next.set(ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY, view);
          return next;
        },
        { replace: true }
      );
    },
    [bookings, setSearchParams]
  );

  const handleOpenEnrollment = useCallback(
    (enrollmentId: string) => {
      const row = bookings.find((booking) => booking.id === enrollmentId);
      const view =
        row?.status === 'completed' || row?.status === 'cancelled'
          ? 'history'
          : row?.isGuest && row.status === 'pending'
            ? 'pending_guest'
            : 'roster';
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(ADMIN_TAB_QUERY_KEY, 'operations');
          next.set(ADMIN_COURSE_ENROLLMENT_QUERY_KEY, enrollmentId);
          next.set(ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY, view);
          return next;
        },
        { replace: true }
      );
    },
    [bookings, setSearchParams]
  );

  return (
    <BookingsLog
      bookings={bookings}
      usersList={usersList}
      instructors={instructors}
      onOpenLesson={handleOpenLesson}
      onOpenEnrollment={handleOpenEnrollment}
      hasMoreBookings={
        lessonsHot.list.hasMore ||
        lessonsHistory.list.hasMore ||
        enrollmentsRoster.list.hasMore ||
        enrollmentsPending.list.hasMore ||
        enrollmentsHistory.list.hasMore
      }
      onLoadMoreBookings={loadMore}
    />
  );
}
