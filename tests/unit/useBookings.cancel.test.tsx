/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking, UserProfile } from '../../src/types';

const {
  mockCancelBookingWithRefund,
  mockAddNotification,
  mockCreateNotificationForUser,
  mockHandleFirestoreError,
} = vi.hoisted(() => ({
  mockCancelBookingWithRefund: vi.fn(),
  mockAddNotification: vi.fn(),
  mockCreateNotificationForUser: vi.fn(),
  mockHandleFirestoreError: vi.fn(),
}));

const confirmedBooking: Booking = {
  id: 'booking-course-1',
  userId: 'client-1',
  instructorId: 'course_course-1',
  instructorName: 'Freeride Camp',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 5,
  totalPrice: 200,
  status: 'confirmed',
  difficulty: 'intermediate',
};

const adminProfile: UserProfile = {
  uid: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  role: 'admin',
  avatarUrl: '',
  balanceUSD: 0,
};

const firebaseUser = { uid: 'admin-1', email: 'admin@example.com' } as any;

vi.mock('../../src/lib/bookingTransactions', () => ({
  cancelBookingWithRefund: (...args: any[]) => mockCancelBookingWithRefund(...args),
}));

vi.mock('../../src/lib/notifications', () => ({
  createNotificationForUser: (...args: any[]) => mockCreateNotificationForUser(...args),
}));

vi.mock('../../src/components/PushNotificationHub', () => ({
  useNotifications: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('../../src/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  parseCourseEndDateTime: () => new Date('2099-01-01'),
}));

vi.mock('../../src/lib/createBookingCallable', () => ({
  createBookingViaCallable: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: 'admin-1', email: 'admin@example.com' } },
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  onSnapshot: (_query: unknown, callback: (snapshot: any) => void) => {
    callback({
      docs: [
        {
          id: confirmedBooking.id,
          data: () => confirmedBooking,
        },
      ],
    });
    return vi.fn();
  },
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  handleFirestoreError: (...args: any[]) => mockHandleFirestoreError(...args),
  OperationType: { LIST: 'list', WRITE: 'write' },
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
}));

import { useBookingActions } from '../../src/features/bookings/useBookingActions';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { useWalletStore } from '../../src/features/wallet/walletStore';
import { useBookingsStore } from '../../src/features/bookings/bookingsStore';
import { setStoreContext } from '../../src/store/storeContext';

describe('useBookings.handleCancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelBookingWithRefund.mockResolvedValue({ refunded: 200, alreadyCancelled: false });
    mockCreateNotificationForUser.mockResolvedValue(undefined);
    setStoreContext({
      notify: mockAddNotification,
      t: (key: string) => key,
      language: () => 'en',
    });
    useBookingsStore.setState({
      bookings: [confirmedBooking],
      bookingsLoaded: true,
      deletedCompletedStats: { revenue: 0, count: 0 },
    });
    useAuthStore.setState({
      firebaseUser,
    });
    useProfileStore.setState({
      userProfile: adminProfile,
    });
    useWalletStore.setState({
      optimisticBalanceDelta: 0,
    });
  });

  it('cancels a course booking as admin, notifies the client, and shows a success toast', async () => {
    const { result } = renderHook(() => useBookingActions());

    expect(useBookingsStore.getState().bookings).toHaveLength(1);

    await act(async () => {
      await result.current.handleCancel('booking-course-1');
    });

    expect(mockCancelBookingWithRefund).toHaveBeenCalledWith({}, 'booking-course-1', undefined);
    expect(mockCreateNotificationForUser).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({
        titleEn: 'Lesson Cancelled',
        titleRu: 'Урок отменен',
        messageEn: expect.stringContaining('Freeride Camp'),
        messageRu: expect.stringContaining('Freeride Camp'),
      }),
      'warning'
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      'success',
      'lessonCancelled',
      expect.stringContaining('Freeride Camp')
    );
  });

  it('does not update local profile balance when the current user cancels their own booking', async () => {
    const clientProfile: UserProfile = {
      ...adminProfile,
      uid: 'client-1',
      role: 'user',
      balanceUSD: 50,
    };
    const clientUser = { uid: 'client-1', email: 'client@example.com' } as any;

    useAuthStore.setState({
      firebaseUser: clientUser,
    });
    useProfileStore.setState({
      userProfile: clientProfile,
    });
    useWalletStore.setState({
      optimisticBalanceDelta: 0,
    });

    const { result } = renderHook(() => useBookingActions());

    expect(useBookingsStore.getState().bookings).toHaveLength(1);

    await act(async () => {
      await result.current.handleCancel('booking-course-1');
    });

    expect(mockCreateNotificationForUser).not.toHaveBeenCalled();
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('does nothing when the booking is already cancelled', async () => {
    mockCancelBookingWithRefund.mockResolvedValue({ refunded: 0, alreadyCancelled: true });

    const { result } = renderHook(() => useBookingActions());

    expect(useBookingsStore.getState().bookings).toHaveLength(1);

    await act(async () => {
      await result.current.handleCancel('booking-course-1');
    });

    expect(mockCreateNotificationForUser).not.toHaveBeenCalled();
    expect(mockAddNotification).not.toHaveBeenCalled();
  });
});
