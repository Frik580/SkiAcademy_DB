import type { ActivityLog, Review } from '../../types';
import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import type { CabinetSessionItem, CourseEnrollmentCabinetItem } from '../course-enrollments';
import type { BookingProposalCabinetItem } from '../booking-collaboration';

/** Party membership, never payer/account identity or display names, owns a lesson. */
export function selectBookingsForParticipant(
  bookings: readonly LessonBookingCabinetItem[],
  participantId: string | undefined
): LessonBookingCabinetItem[] {
  if (!participantId) return [];
  return bookings.filter((booking) => booking.participantIds?.includes(participantId));
}

/** One presentation boundary over already-authorized account reads; adds no reads. */
export function selectCabinetDataForParticipant(input: {
  readonly selectedParticipantId: string | undefined;
  readonly bookings: readonly LessonBookingCabinetItem[];
  readonly sessionItems: readonly CabinetSessionItem[];
  readonly courseEnrollments: readonly CourseEnrollmentCabinetItem[];
  readonly reviews: readonly Review[];
  readonly activityLogs: readonly ActivityLog[];
  readonly unreviewedCompletedBookings: readonly LessonBookingCabinetItem[];
  readonly collaborationProposals: readonly BookingProposalCabinetItem[];
}) {
  const participantId = input.selectedParticipantId;
  const bookings = selectBookingsForParticipant(input.bookings, participantId);
  const bookingIds = new Set(bookings.map((booking) => booking.bookingId));
  return {
    bookings,
    sessionItems: input.sessionItems.filter((item) =>
      item.kind === 'lesson'
        ? Boolean(participantId && item.session.participantIds?.includes(participantId))
        : Boolean(participantId && item.participantId === participantId)
    ),
    courseEnrollments: input.courseEnrollments.filter(
      (enrollment) => participantId && enrollment.participantId === participantId
    ),
    reviews: input.reviews.filter((review) => review.bookingId && bookingIds.has(review.bookingId)),
    // Legacy activity_logs have no Participant ID. Only booking/review facts with
    // an explicit, owned Booking relation can be attributed. Skill, level,
    // recommendation and achievement logs cannot be assigned even on shared lessons.
    activityLogs: input.activityLogs.filter(
      (log) =>
        (log.type === 'booking_completed' || log.type === 'review_created') &&
        log.metadata?.bookingId &&
        bookingIds.has(log.metadata.bookingId)
    ),
    unreviewedCompletedBookings: selectBookingsForParticipant(
      input.unreviewedCompletedBookings,
      participantId
    ),
    collaborationProposals: input.collaborationProposals.filter(
      (proposal) => participantId && proposal.participantIds.includes(participantId)
    ),
  };
}
