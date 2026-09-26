import { useEffect, useRef, type RefObject } from 'react';
import { clientConversionAnalytics, type BookingProductType } from './clientConversionAnalytics';

const CATALOGUE_VIEW_THRESHOLD = 0.2;

/** Public marketing landing only. Logged-in workspace redirects are not a landing view. */
export function useTrackPublicLanding(isPublicLanding: boolean): void {
  const tracked = useRef(false);

  useEffect(() => {
    if (!isPublicLanding || tracked.current) return;
    tracked.current = true;
    clientConversionAnalytics.trackLandingView();
  }, [isPublicLanding]);
}

/**
 * First meaningful look at an instructor card. Reviews use a separate surface
 * in the modal host; session dedupe keeps one instructor_view per instructor.
 */
export function useTrackInstructorCatalogueView(
  instructorId: string,
  elementRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const element = elementRef.current;
    if (!instructorId || !element) return;

    if (typeof IntersectionObserver === 'undefined') {
      clientConversionAnalytics.trackInstructorView({
        instructor_id: instructorId,
        surface: 'catalogue',
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= CATALOGUE_VIEW_THRESHOLD
        );
        if (!visible) return;
        clientConversionAnalytics.trackInstructorView({
          instructor_id: instructorId,
          surface: 'catalogue',
        });
        observer.disconnect();
      },
      { threshold: [CATALOGUE_VIEW_THRESHOLD] }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, instructorId]);
}

export interface ConversionModalTargets {
  bookingInstructorId: string | null;
  courseDetailsId: string | null;
  courseEnrollmentId: string | null;
  reviewsInstructorId: string | null;
}

/**
 * Modal host is the shared open path for home and cabinet:
 * course details → course_view, reviews → instructor_view,
 * lesson booking modal and course enrollment modal → booking_start.
 * Payment and completion stay on the server.
 */
export function useTrackConversionModals(targets: ConversionModalTargets): void {
  const { bookingInstructorId, courseDetailsId, courseEnrollmentId, reviewsInstructorId } = targets;

  useEffect(() => {
    if (!reviewsInstructorId) return;
    clientConversionAnalytics.trackInstructorView({
      instructor_id: reviewsInstructorId,
      surface: 'reviews',
    });
  }, [reviewsInstructorId]);

  useEffect(() => {
    if (!courseDetailsId) return;
    clientConversionAnalytics.trackCourseView({ course_id: courseDetailsId });
  }, [courseDetailsId]);

  useEffect(() => {
    if (!bookingInstructorId) return;
    clientConversionAnalytics.trackBookingStart({
      product_type: 'lesson' satisfies BookingProductType,
      product_id: bookingInstructorId,
      instructor_id: bookingInstructorId,
    });
  }, [bookingInstructorId]);

  useEffect(() => {
    if (!courseEnrollmentId) return;
    clientConversionAnalytics.trackBookingStart({
      product_type: 'course' satisfies BookingProductType,
      product_id: courseEnrollmentId,
      course_id: courseEnrollmentId,
    });
  }, [courseEnrollmentId]);
}
