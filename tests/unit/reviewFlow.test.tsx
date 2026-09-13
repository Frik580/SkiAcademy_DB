import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { NotificationProvider, useNotifications } from '../../src/features/notifications';
import { useReviewFlow } from '../../src/features/profile/components/ReviewFlow';
import type { Booking } from '../../src/types';

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LanguageProvider>
    <NotificationProvider>{children}</NotificationProvider>
  </LanguageProvider>
);

describe('useReviewFlow', () => {
  it('keeps the form open and reports an error when the server rejects the review', async () => {
    const onAddReview = vi.fn().mockRejectedValue(new Error('server rejected review'));
    const booking = {
      id: 'booking-review-server-reject',
      instructorId: 'instructor-review-server-reject',
    } as Booking;
    const { result } = renderHook(
      () => ({
        flow: useReviewFlow({ onAddReview }),
        notifications: useNotifications(),
      }),
      { wrapper }
    );

    act(() => result.current.flow.openReview(booking));
    await act(async () => {
      await result.current.flow.handleSubmitReview({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onAddReview).toHaveBeenCalledTimes(1);
    expect(result.current.flow.reviewBooking).toBe(booking);
    expect(result.current.flow.isSubmittingReview).toBe(false);
    await waitFor(() => {
      expect(result.current.notifications.notifications[0]?.type).toBe('error');
    });
  });
});
