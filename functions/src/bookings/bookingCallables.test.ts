import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { addBookingHandler } from './addBooking';
import { createGuestBookingHandler } from './createGuestBooking';
import { updateBookingScheduleHandler } from './updateBookingSchedule';
import { linkGuestBookingHandler } from './linkGuestBooking';
import { completeBookingHandler } from './completeBooking';
import { confirmBookingHandler } from './confirmBooking';
import { deleteBookingHandler } from './deleteBooking';
import { requestBookingCancellationHandler } from './requestBookingCancellation';

describe('Cloud Functions Booking Handlers - Input & Auth Validation', () => {
  const mockDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => undefined }),
      }),
    }),
  } as unknown as Firestore;

  it('addBooking rejects unauthenticated requests', async () => {
    const handler = addBookingHandler(mockDb);
    const req = { auth: null, data: {} } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('addBooking rejects non-admin callers', async () => {
    const dbWithUser = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ role: 'user' }) }),
        }),
      }),
    } as unknown as Firestore;

    const handler = addBookingHandler(dbWithUser);
    const req = {
      auth: { uid: 'regular-user' },
      data: {
        userId: 'target-1',
        booking: {
          id: 'b-1',
          instructorId: 'inst-1',
          instructorName: 'Alex',
          date: '2026-12-10',
          time: '10:00',
          durationHours: 2,
          status: 'confirmed',
          difficulty: 'beginner',
        },
      },
    } as unknown as CallableRequest<unknown>;

    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  it('updateBookingSchedule rejects unauthenticated requests', async () => {
    const handler = updateBookingScheduleHandler(mockDb);
    const req = {
      auth: null,
      data: {},
    } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('linkGuestBooking rejects unauthenticated requests', async () => {
    const handler = linkGuestBookingHandler(mockDb);
    const req = {
      auth: null,
      data: {},
    } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('completeBooking rejects unauthenticated requests', async () => {
    const handler = completeBookingHandler(mockDb);
    const req = {
      auth: null,
      data: {},
    } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('createGuestBooking validates required fields', async () => {
    const handler = createGuestBookingHandler(mockDb);
    const req = {
      auth: null,
      data: {},
    } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('createGuestBooking rejects non-pending status', async () => {
    const handler = createGuestBookingHandler(mockDb);
    const req = {
      auth: null,
      data: {
        instructorId: 'inst-1',
        instructorName: 'Alex',
        date: '2026-12-10',
        time: '10:00',
        durationHours: 2,
        status: 'confirmed',
        difficulty: 'beginner',
      },
    } as unknown as CallableRequest<unknown>;

    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('createGuestBooking rejects a non-guest userId', async () => {
    const handler = createGuestBookingHandler(mockDb);
    const req = {
      auth: null,
      data: {
        userId: 'user-1',
        instructorId: 'inst-1',
        instructorName: 'Alex',
        date: '2026-12-10',
        time: '10:00',
        durationHours: 2,
        difficulty: 'beginner',
      },
    } as unknown as CallableRequest<unknown>;

    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('completeBooking rejects the booking owner', async () => {
    const dbWithOwner = {
      collection: (name: string) => ({
        doc: () => ({
          get: async () =>
            name === 'bookings'
              ? {
                  exists: true,
                  data: () => ({
                    id: 'b-1',
                    userId: 'student-1',
                    instructorId: 'inst-1',
                  }),
                }
              : { exists: true, data: () => ({ role: 'user' }) },
        }),
      }),
    } as unknown as Firestore;

    const handler = completeBookingHandler(dbWithOwner);
    const req = {
      auth: { uid: 'student-1' },
      data: { bookingId: 'b-1' },
    } as unknown as CallableRequest<unknown>;

    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  it('confirmBooking rejects unauthenticated requests', async () => {
    const handler = confirmBookingHandler(mockDb);
    const req = { auth: null, data: {} } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('confirmBooking rejects the booking owner', async () => {
    const dbWithOwner = {
      collection: (name: string) => ({
        doc: () => ({
          get: async () =>
            name === 'bookings'
              ? {
                  exists: true,
                  data: () => ({
                    id: 'b-1',
                    userId: 'student-1',
                    instructorId: 'inst-1',
                  }),
                }
              : { exists: true, data: () => ({ role: 'user' }) },
        }),
      }),
    } as unknown as Firestore;

    const handler = confirmBookingHandler(dbWithOwner);
    const req = {
      auth: { uid: 'student-1' },
      data: { bookingId: 'b-1' },
    } as unknown as CallableRequest<unknown>;

    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  it('deleteBooking rejects non-admin callers', async () => {
    const dbWithUser = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ role: 'user' }) }),
        }),
      }),
    } as unknown as Firestore;

    const handler = deleteBookingHandler(dbWithUser);
    const req = {
      auth: { uid: 'regular-user' },
      data: { bookingId: 'b-1' },
    } as unknown as CallableRequest<unknown>;

    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  it('requestBookingCancellation rejects unauthenticated requests', async () => {
    const handler = requestBookingCancellationHandler(mockDb);
    const req = { auth: null, data: {} } as unknown as CallableRequest<unknown>;
    await expect(handler(req)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });
});
