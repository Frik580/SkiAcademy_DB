import { useEffect, useRef } from 'react';
import { clientConversionAnalytics, type BookingProductKind } from './clientConversionAnalytics';

/** First public landing hit. Logged-in workspace redirects are not a session start. */
export function useTrackPublicLanding(isPublicLanding: boolean): void {
  const tracked = useRef(false);

  useEffect(() => {
    if (!isPublicLanding || tracked.current) return;
    tracked.current = true;
    clientConversionAnalytics.trackSessionSource();
  }, [isPublicLanding]);
}

export interface ConversionModalTargets {
  bookingInstructorId: string | null;
  courseDetailsId: string | null;
  courseEnrollmentId: string | null;
  /** Instructor reviews modal is the client instructor detail surface. */
  instructorDetailId: string | null;
}

/**
 * Modal host is the shared open path for home and cabinet.
 * Instructor detail → instructor_view. Course details → course_view.
 * Lesson booking and course enrollment → booking_start.
 * participant_count is omitted here: the party size is not known when the
 * flow opens. Payment and completion stay on the server.
 */
export function useTrackConversionModals(targets: ConversionModalTargets): void {
  const { bookingInstructorId, courseDetailsId, courseEnrollmentId, instructorDetailId } = targets;

  useEffect(() => {
    if (!instructorDetailId) return;
    clientConversionAnalytics.trackInstructorView({ instructor_id: instructorDetailId });
  }, [instructorDetailId]);

  useEffect(() => {
    if (!courseDetailsId) return;
    clientConversionAnalytics.trackCourseView({ course_id: courseDetailsId });
  }, [courseDetailsId]);

  useEffect(() => {
    if (!bookingInstructorId) return;
    clientConversionAnalytics.trackBookingStart({
      product_kind: 'lesson' satisfies BookingProductKind,
      instructor_id: bookingInstructorId,
    });
  }, [bookingInstructorId]);

  useEffect(() => {
    if (!courseEnrollmentId) return;
    clientConversionAnalytics.trackBookingStart({
      product_kind: 'course' satisfies BookingProductKind,
      course_id: courseEnrollmentId,
    });
  }, [courseEnrollmentId]);
}
