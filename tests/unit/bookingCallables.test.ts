import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Booking } from '../../src/types';
import { addBookingViaCallable } from '../../src/features/bookings/addBookingCallable';
import { createGuestBookingViaCallable } from '../../src/features/bookings/createGuestBookingCallable';
import { updateBookingScheduleViaCallable } from '../../src/features/bookings/updateBookingScheduleCallable';
import { linkGuestBookingViaCallable } from '../../src/features/bookings/linkGuestBookingCallable';
import { completeBookingViaCallable } from '../../src/features/bookings/completeBookingCallable';
import { confirmBookingViaCallable } from '../../src/features/bookings/confirmBookingCallable';
import { deleteBookingViaCallable } from '../../src/features/bookings/deleteBookingCallable';
import { requestBookingCancellationViaCallable } from '../../src/features/bookings/requestBookingCancellationCallable';
import {
  BookingIdConflictError,
  BookingSlotOverlapError,
  InsufficientFundsError,
} from '../../src/features/bookings/bookingTransactions';

vi.mock('../../src/lib/functions/functionsClient', () => {
  return {
    callFunction: vi.fn(),
    toFunctionsClientError: (error: unknown) => error,
  };
});

import { callFunction } from '../../src/lib/functions/functionsClient';

const sampleBooking: Booking = {
  id: 'b-100',
  userId: 'u-1',
  instructorId: 'inst-1',
  instructorName: 'Alex Pro',
  instructorAvatar: 'https://example.com/avatar.jpg',
  date: '2026-12-10',
  time: '10:00',
  durationHours: 2,
  totalPrice: 150,
  status: 'confirmed',
  difficulty: 'intermediate',
  notes: 'First time carving',
};

describe('Booking Callables Client Wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addBookingViaCallable', () => {
    it('successfully calls addBooking callable and returns payment result', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({
        bookingId: 'b-100',
        totalPrice: 150,
        newBalance: 350,
      });

      const result = await addBookingViaCallable(sampleBooking, 'target-u-2');

      expect(callFunction).toHaveBeenCalledWith(
        'addBooking',
        expect.objectContaining({
          userId: 'target-u-2',
          booking: expect.objectContaining({
            id: 'b-100',
            instructorId: 'inst-1',
          }),
        }),
        expect.objectContaining({ idempotencyKey: 'add_b-100' })
      );
      expect(result).toEqual({ newBalance: 350, totalPrice: 150 });
    });

    it('maps functions/failed-precondition to InsufficientFundsError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/failed-precondition',
        message: 'Insufficient funds on target user account.',
      });

      await expect(addBookingViaCallable(sampleBooking)).rejects.toThrow(InsufficientFundsError);
    });

    it('maps functions/aborted to BookingSlotOverlapError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/aborted',
        message: 'Slot overlap',
      });

      await expect(addBookingViaCallable(sampleBooking)).rejects.toThrow(BookingSlotOverlapError);
    });

    it('maps functions/already-exists to BookingIdConflictError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/already-exists',
        message: 'Booking ID conflict',
      });

      await expect(addBookingViaCallable(sampleBooking)).rejects.toThrow(BookingIdConflictError);
    });
  });

  describe('createGuestBookingViaCallable', () => {
    it('successfully calls createGuestBooking callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({ bookingId: 'b-guest-1' });

      const result = await createGuestBookingViaCallable({
        ...sampleBooking,
        id: 'b-guest-1',
        isGuest: true,
        guestName: 'John Guest',
      });

      expect(callFunction).toHaveBeenCalledWith(
        'createGuestBooking',
        expect.objectContaining({
          id: 'b-guest-1',
          guestName: 'John Guest',
        }),
        expect.objectContaining({ idempotencyKey: 'guest_b-guest-1' })
      );
      expect(result).toEqual({ bookingId: 'b-guest-1' });
    });

    it('maps functions/aborted to BookingSlotOverlapError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/aborted',
        message: 'Slot overlap',
      });

      await expect(createGuestBookingViaCallable(sampleBooking)).rejects.toThrow(
        BookingSlotOverlapError
      );
    });

    it('maps functions/already-exists to BookingIdConflictError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/already-exists',
        message: 'Booking ID conflict',
      });

      await expect(createGuestBookingViaCallable(sampleBooking)).rejects.toThrow(
        BookingIdConflictError
      );
    });
  });

  describe('updateBookingScheduleViaCallable', () => {
    it('successfully calls updateBookingSchedule callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({ success: true, bookingId: 'b-100' });

      await expect(
        updateBookingScheduleViaCallable('b-100', { date: '2026-12-11', time: '14:00' })
      ).resolves.toBeUndefined();

      expect(callFunction).toHaveBeenCalledWith(
        'updateBookingSchedule',
        {
          bookingId: 'b-100',
          date: '2026-12-11',
          time: '14:00',
          instructorId: undefined,
        },
        expect.any(Object)
      );
    });

    it('maps functions/aborted to BookingSlotOverlapError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/aborted',
        message: 'Slot overlap',
      });

      await expect(
        updateBookingScheduleViaCallable('b-100', { date: '2026-12-11', time: '14:00' })
      ).rejects.toThrow(BookingSlotOverlapError);
    });

    it('maps insufficient-funds failed-precondition to InsufficientFundsError', async () => {
      vi.mocked(callFunction).mockRejectedValueOnce({
        code: 'functions/failed-precondition',
        message: 'Insufficient funds to reassign this booking.',
      });

      await expect(
        updateBookingScheduleViaCallable('b-100', { instructorId: 'inst-2' })
      ).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('linkGuestBookingViaCallable', () => {
    it('successfully calls linkGuestBooking callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({ newBalance: 200 });

      const result = await linkGuestBookingViaCallable('b-100', 'u-target');

      expect(callFunction).toHaveBeenCalledWith(
        'linkGuestBooking',
        { bookingId: 'b-100', targetUserId: 'u-target' },
        expect.objectContaining({ idempotencyKey: 'link_b-100_u-target' })
      );
      expect(result).toEqual({ newBalance: 200 });
    });
  });

  describe('completeBookingViaCallable', () => {
    it('successfully calls completeBooking callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({ bookingId: 'b-100', status: 'completed' });

      const result = await completeBookingViaCallable('b-100');

      expect(callFunction).toHaveBeenCalledWith(
        'completeBooking',
        { bookingId: 'b-100' },
        expect.objectContaining({ idempotencyKey: 'complete_b-100' })
      );
      expect(result).toEqual({ bookingId: 'b-100', status: 'completed' });
    });
  });

  describe('confirmBookingViaCallable', () => {
    it('successfully calls confirmBooking callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({ bookingId: 'b-100', status: 'confirmed' });

      await confirmBookingViaCallable('b-100');

      expect(callFunction).toHaveBeenCalledWith(
        'confirmBooking',
        { bookingId: 'b-100' },
        expect.objectContaining({ idempotencyKey: 'confirm_b-100' })
      );
    });
  });

  describe('deleteBookingViaCallable', () => {
    it('successfully calls deleteBooking callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({
        bookingId: 'b-100',
        isDeletedDoc: true,
      });

      const result = await deleteBookingViaCallable('b-100');

      expect(callFunction).toHaveBeenCalledWith(
        'deleteBooking',
        { bookingId: 'b-100' },
        expect.objectContaining({ idempotencyKey: 'delete_b-100' })
      );
      expect(result.isDeletedDoc).toBe(true);
    });
  });

  describe('requestBookingCancellationViaCallable', () => {
    it('successfully calls requestBookingCancellation callable', async () => {
      vi.mocked(callFunction).mockResolvedValueOnce({
        bookingId: 'b-100',
        status: 'pending_cancellation',
      });

      await requestBookingCancellationViaCallable('b-100', 'schedule conflict');

      expect(callFunction).toHaveBeenCalledWith(
        'requestBookingCancellation',
        { bookingId: 'b-100', reason: 'schedule conflict' },
        expect.objectContaining({ idempotencyKey: 'request_cancel_b-100' })
      );
    });
  });
});
