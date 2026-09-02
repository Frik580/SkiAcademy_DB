import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Instructor, UserProfile } from '../../../types';
import { isCourseBooking } from '../../../domain/availability';
import { BookingsLog } from '../components/bookings/BookingsLog';
import { useAdminMonitorReadModels } from './useAdminMonitorReadModels';
import { executeAdminLessonBookingAttempt } from '../lesson-bookings/useAdminLessonBookingCommands';
import { executeAdminCourseEnrollmentAttempt } from '../course-enrollments/useAdminCourseEnrollmentCommands';
import { createAdminLessonBookingAttemptId } from '../lesson-bookings/lessonBookingAdminUtils';
import { createAdminCourseEnrollmentAttemptId } from '../course-enrollments/adminCourseEnrollmentUtils';
import {
  queryAdminIdentityReadModels,
  queryLessonBookingReadModels,
} from '../../../lib/canonical/canonicalReadModelClient';
import { AccountIdSchema, ParticipantIdSchema } from '@ski-academy/shared-domain';
import {
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';

interface AdminActiveBookingMonitorProps {
  readonly adminAccountId: string;
  readonly usersList: UserProfile[];
  readonly instructors: Instructor[];
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

async function firstEligibleParticipant(accountId: string): Promise<string | undefined> {
  const result = await queryAdminIdentityReadModels({
    scope: 'admin_eligible_participants',
    accountId: AccountIdSchema.parse(accountId),
  });
  return result.scope === 'admin_eligible_participants' ? result.items[0]?.participantId : undefined;
}

export function AdminActiveBookingMonitor({
  adminAccountId,
  usersList,
  instructors,
  onRequestConfirm,
}: AdminActiveBookingMonitorProps) {
  const [, setSearchParams] = useSearchParams();
  const {
    bookings,
    lessonsHot,
    lessonsHistory,
    enrollmentsRoster,
    enrollmentsPending,
    enrollmentsHistory,
  } = useAdminMonitorReadModels();

  const refresh = useCallback(async () => {
    await Promise.all([
      lessonsHot.retryList(),
      lessonsHistory.retryList(),
      enrollmentsRoster.refreshList(),
      enrollmentsPending.refreshList(),
      enrollmentsHistory.refreshList(),
    ]);
  }, [enrollmentsHistory, enrollmentsPending, enrollmentsRoster, lessonsHistory, lessonsHot]);

  const handleCancel = useCallback(
    async (id: string) => {
      const row = bookings.find((booking) => booking.id === id);
      if (!row) return;
      if (isCourseBooking(row)) {
        const enrollment =
          enrollmentsRoster.list.items.find((item) => item.enrollmentId === id) ??
          enrollmentsPending.list.items.find((item) => item.enrollmentId === id) ??
          enrollmentsHistory.list.items.find((item) => item.enrollmentId === id);
        if (!enrollment) return;
        await executeAdminCourseEnrollmentAttempt(adminAccountId, {
          kind: 'resolve_course_enrollment_cancellation',
          idempotencyKey: createAdminCourseEnrollmentAttemptId('monitor_cancel'),
          target: {
            enrollmentId: enrollment.enrollmentId,
            revision: enrollment.revision,
            courseId: enrollment.course.courseId,
            paymentId: enrollment.payment?.paymentId ?? 'payment_unknown',
          },
          decision: row.status === 'pending_cancellation' ? 'approve' : 'direct_cancel',
          refundAmount: enrollment.payment?.outstanding === 0 ? (enrollment.payment?.paid ?? 0) : 0,
          reasonExplanation: 'Admin booking monitor cancellation',
        });
      } else {
        const detail = await queryLessonBookingReadModels({
          scope: 'admin_detail',
          bookingId: id as never,
        });
        const booking = detail.scope === 'admin_detail' ? detail.items[0] : undefined;
        if (!booking?.admin) return;
        await executeAdminLessonBookingAttempt(adminAccountId, {
          kind: 'resolve_booking_cancellation',
          idempotencyKey: createAdminLessonBookingAttemptId('monitor_cancel'),
          target: { bookingId: booking.bookingId, revision: booking.revision },
          paymentId: booking.admin.payment.paymentId,
          paymentRevision: booking.admin.payment.revision,
          decision: row.status === 'pending_cancellation' ? 'approve' : 'direct_cancel',
          refundAmount: booking.admin.cancellationFinancial.maximumRefund,
          reasonExplanation: 'Admin booking monitor cancellation',
        });
      }
      await refresh();
    },
    [adminAccountId, bookings, enrollmentsHistory.list.items, enrollmentsPending.list.items, enrollmentsRoster.list.items, refresh]
  );

  const handleRejectCancellation = useCallback(
    async (id: string) => {
      const row = bookings.find((booking) => booking.id === id);
      if (!row || row.status !== 'pending_cancellation') return;
      if (isCourseBooking(row)) {
        const enrollment =
          enrollmentsRoster.list.items.find((item) => item.enrollmentId === id) ??
          enrollmentsHistory.list.items.find((item) => item.enrollmentId === id);
        if (!enrollment) return;
        await executeAdminCourseEnrollmentAttempt(adminAccountId, {
          kind: 'resolve_course_enrollment_cancellation',
          idempotencyKey: createAdminCourseEnrollmentAttemptId('monitor_reject_cancel'),
          target: {
            enrollmentId: enrollment.enrollmentId,
            revision: enrollment.revision,
            courseId: enrollment.course.courseId,
            paymentId: enrollment.payment?.paymentId ?? 'payment_unknown',
          },
          decision: 'reject',
          reasonExplanation: 'Admin booking monitor keep reservation',
        });
      } else {
        const detail = await queryLessonBookingReadModels({
          scope: 'admin_detail',
          bookingId: id as never,
        });
        const booking = detail.scope === 'admin_detail' ? detail.items[0] : undefined;
        if (!booking?.admin) return;
        await executeAdminLessonBookingAttempt(adminAccountId, {
          kind: 'resolve_booking_cancellation',
          idempotencyKey: createAdminLessonBookingAttemptId('monitor_reject_cancel'),
          target: { bookingId: booking.bookingId, revision: booking.revision },
          paymentId: booking.admin.payment.paymentId,
          paymentRevision: booking.admin.payment.revision,
          decision: 'reject',
          reasonExplanation: 'Admin booking monitor keep reservation',
        });
      }
      await refresh();
    },
    [adminAccountId, bookings, enrollmentsHistory.list.items, enrollmentsRoster.list.items, refresh]
  );

  const handleComplete = useCallback(
    async (id: string) => {
      const row = bookings.find((booking) => booking.id === id);
      if (!row || isCourseBooking(row)) return;
      const detail = await queryLessonBookingReadModels({
        scope: 'admin_detail',
        bookingId: id as never,
      });
      const booking = detail.scope === 'admin_detail' ? detail.items[0] : undefined;
      if (!booking?.admin) return;
      for (const attendance of booking.admin.attendance) {
        if (attendance.attendanceStatus === 'present') continue;
        await executeAdminLessonBookingAttempt(adminAccountId, {
          kind: 'record_booking_attendance',
          idempotencyKey: createAdminLessonBookingAttemptId(`monitor_att_${attendance.participantId}`),
          target: { bookingId: booking.bookingId, revision: booking.revision },
          participantId: attendance.participantId,
          attendanceStatus: 'present',
          ...(attendance.revision === undefined
            ? {}
            : { expectedAttendanceRevision: attendance.revision }),
          reasonExplanation: 'Admin booking monitor attendance completion',
        });
      }
      await executeAdminLessonBookingAttempt(adminAccountId, {
        kind: 'resolve_attendance_outcome',
        idempotencyKey: createAdminLessonBookingAttemptId('monitor_complete'),
        target: { bookingId: booking.bookingId, revision: booking.revision },
      });
      await refresh();
    },
    [adminAccountId, bookings, refresh]
  );

  const handleLink = useCallback(
    async (bookingId: string, targetUserId: string) => {
      const row = bookings.find((booking) => booking.id === bookingId);
      const participantId = await firstEligibleParticipant(targetUserId);
      if (!row || !participantId) return;
      if (isCourseBooking(row)) {
        const enrollment =
          enrollmentsPending.list.items.find((item) => item.enrollmentId === bookingId) ??
          enrollmentsRoster.list.items.find((item) => item.enrollmentId === bookingId);
        if (!enrollment) return;
        await executeAdminCourseEnrollmentAttempt(adminAccountId, {
          kind: 'link_guest_course_enrollment_to_account_as_administrator',
          idempotencyKey: createAdminCourseEnrollmentAttemptId('monitor_link'),
          target: {
            enrollmentId: enrollment.enrollmentId,
            revision: enrollment.revision,
            courseId: enrollment.course.courseId,
            paymentId: enrollment.payment?.paymentId ?? 'payment_unknown',
          },
          targetAccountId: targetUserId,
          targetParticipantId: ParticipantIdSchema.parse(participantId),
          targetParticipantDisplayName: targetUserId,
          reasonExplanation: 'Admin booking monitor guest identity link',
        });
      } else {
        const detail = await queryLessonBookingReadModels({
          scope: 'admin_detail',
          bookingId: bookingId as never,
        });
        const booking = detail.scope === 'admin_detail' ? detail.items[0] : undefined;
        if (!booking) return;
        await executeAdminLessonBookingAttempt(adminAccountId, {
          kind: 'link_guest_booking_to_account_as_administrator',
          idempotencyKey: createAdminLessonBookingAttemptId('monitor_link'),
          target: { bookingId: booking.bookingId, revision: booking.revision },
          targetAccountId: targetUserId,
          targetParticipantId: ParticipantIdSchema.parse(participantId),
          targetParticipantDisplayName: targetUserId,
          reasonExplanation: 'Admin booking monitor guest identity link',
        });
      }
      await refresh();
    },
    [adminAccountId, bookings, enrollmentsPending.list.items, enrollmentsRoster.list.items, refresh]
  );

  const loadMore = useCallback(() => {
    if (lessonsHot.list.hasMore) void lessonsHot.loadMore();
    if (lessonsHistory.list.hasMore) void lessonsHistory.loadMore();
    enrollmentsRoster.loadMore?.();
    enrollmentsPending.loadMore?.();
    enrollmentsHistory.loadMore?.();
  }, [enrollmentsHistory, enrollmentsPending, enrollmentsRoster, lessonsHistory, lessonsHot]);

  const handleOpenEnrollment = useCallback(
    (enrollmentId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(ADMIN_TAB_QUERY_KEY, 'operations');
          next.set(ADMIN_COURSE_ENROLLMENT_QUERY_KEY, enrollmentId);
          next.set(ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY, 'roster');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return (
    <BookingsLog
      bookings={bookings}
      usersList={usersList}
      instructors={instructors}
      hideUnpaidConfirm
      onConfirmBooking={handleRejectCancellation}
      onCompleteBooking={handleComplete}
      onLinkGuestBooking={handleLink}
      onCancelBooking={handleCancel}
      onOpenEnrollment={handleOpenEnrollment}
      onRequestConfirm={onRequestConfirm}
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
