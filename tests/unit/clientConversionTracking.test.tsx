import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({
  trackSessionSource: vi.fn(),
  trackInstructorView: vi.fn(),
  trackCourseView: vi.fn(),
  trackBookingStart: vi.fn(),
}));

vi.mock('../../src/infrastructure/analytics/clientConversionAnalytics', () => ({
  clientConversionAnalytics: analytics,
}));

import {
  useTrackConversionModals,
  useTrackPublicLanding,
} from '../../src/infrastructure/analytics/useClientConversionTracking';

describe('client conversion call sites', () => {
  beforeEach(() => {
    analytics.trackSessionSource.mockClear();
    analytics.trackInstructorView.mockClear();
    analytics.trackCourseView.mockClear();
    analytics.trackBookingStart.mockClear();
  });

  it('tracks session_source once the public landing is shown', () => {
    const { rerender } = renderHook(
      ({ shown }: { shown: boolean }) => useTrackPublicLanding(shown),
      { initialProps: { shown: false } }
    );
    expect(analytics.trackSessionSource).not.toHaveBeenCalled();

    rerender({ shown: true });
    rerender({ shown: true });
    expect(analytics.trackSessionSource).toHaveBeenCalledTimes(1);
  });

  it('maps opened details and booking entry onto the contract events', () => {
    const closed = {
      bookingInstructorId: null,
      courseDetailsId: null,
      courseEnrollmentId: null,
      instructorDetailId: null,
    };
    const { rerender } = renderHook((targets: typeof closed) => useTrackConversionModals(targets), {
      initialProps: closed,
    });
    expect(analytics.trackCourseView).not.toHaveBeenCalled();
    expect(analytics.trackBookingStart).not.toHaveBeenCalled();

    rerender({
      ...closed,
      courseDetailsId: 'course_1',
      instructorDetailId: 'ins_9',
    });
    expect(analytics.trackCourseView).toHaveBeenCalledWith({ course_id: 'course_1' });
    expect(analytics.trackInstructorView).toHaveBeenCalledWith({ instructor_id: 'ins_9' });
    expect(analytics.trackBookingStart).not.toHaveBeenCalled();

    rerender({
      bookingInstructorId: 'ins_1',
      courseDetailsId: 'course_1',
      courseEnrollmentId: 'course_1',
      instructorDetailId: 'ins_9',
    });
    expect(analytics.trackBookingStart).toHaveBeenNthCalledWith(1, {
      product_kind: 'lesson',
      instructor_id: 'ins_1',
    });
    expect(analytics.trackBookingStart).toHaveBeenNthCalledWith(2, {
      product_kind: 'course',
      course_id: 'course_1',
    });
  });
});
