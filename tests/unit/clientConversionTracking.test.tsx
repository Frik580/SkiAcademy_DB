import { act, renderHook } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({
  trackLandingView: vi.fn(),
  trackInstructorView: vi.fn(),
  trackCourseView: vi.fn(),
  trackBookingStart: vi.fn(),
}));

vi.mock('../../src/infrastructure/analytics/clientConversionAnalytics', () => ({
  clientConversionAnalytics: analytics,
}));

import {
  useTrackConversionModals,
  useTrackInstructorCatalogueView,
  useTrackPublicLanding,
} from '../../src/infrastructure/analytics/useClientConversionTracking';

describe('client conversion call sites', () => {
  beforeEach(() => {
    analytics.trackLandingView.mockClear();
    analytics.trackInstructorView.mockClear();
    analytics.trackCourseView.mockClear();
    analytics.trackBookingStart.mockClear();
  });

  it('tracks the public landing once it is actually shown', () => {
    const { rerender } = renderHook(
      ({ shown }: { shown: boolean }) => useTrackPublicLanding(shown),
      {
        initialProps: { shown: false },
      }
    );
    expect(analytics.trackLandingView).not.toHaveBeenCalled();

    rerender({ shown: true });
    rerender({ shown: true });
    expect(analytics.trackLandingView).toHaveBeenCalledTimes(1);
  });

  it('maps open modals to course_view, instructor_view, and booking_start', () => {
    const closed = {
      bookingInstructorId: null,
      courseDetailsId: null,
      courseEnrollmentId: null,
      reviewsInstructorId: null,
    };
    const { rerender } = renderHook((targets: typeof closed) => useTrackConversionModals(targets), {
      initialProps: closed,
    });
    expect(analytics.trackCourseView).not.toHaveBeenCalled();
    expect(analytics.trackBookingStart).not.toHaveBeenCalled();

    rerender({
      ...closed,
      courseDetailsId: 'course_1',
      reviewsInstructorId: 'ins_9',
    });
    expect(analytics.trackCourseView).toHaveBeenCalledWith({ course_id: 'course_1' });
    expect(analytics.trackInstructorView).toHaveBeenCalledWith({
      instructor_id: 'ins_9',
      surface: 'reviews',
    });
    expect(analytics.trackBookingStart).not.toHaveBeenCalled();

    rerender({
      bookingInstructorId: 'ins_1',
      courseDetailsId: 'course_1',
      courseEnrollmentId: 'course_1',
      reviewsInstructorId: 'ins_9',
    });
    expect(analytics.trackBookingStart).toHaveBeenNthCalledWith(1, {
      product_type: 'lesson',
      product_id: 'ins_1',
      instructor_id: 'ins_1',
    });
    expect(analytics.trackBookingStart).toHaveBeenNthCalledWith(2, {
      product_type: 'course',
      product_id: 'course_1',
      course_id: 'course_1',
    });
  });

  it('tracks a catalogue instructor when the card is in view', () => {
    let observerCallback: IntersectionObserverCallback = () => undefined;
    class ObserverStub implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0.2];
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', ObserverStub);

    const ref = createRef<HTMLDivElement>() as RefObject<HTMLElement | null>;
    ref.current = document.createElement('div');
    renderHook(() => useTrackInstructorCatalogueView('ins_card', ref));

    act(() => {
      observerCallback(
        [{ isIntersecting: true, intersectionRatio: 0.5 } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(analytics.trackInstructorView).toHaveBeenCalledWith({
      instructor_id: 'ins_card',
      surface: 'catalogue',
    });
    vi.unstubAllGlobals();
  });
});
