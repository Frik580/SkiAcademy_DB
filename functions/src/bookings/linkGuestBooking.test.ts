import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { linkGuestBookingHandler } from './linkGuestBooking';

describe('linkGuestBooking leftover progress', () => {
  it('does not copy guest /users skillScores, skillComments, or level onto the target Account', async () => {
    const userUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const docs: Record<string, Record<string, unknown>> = {
      'users/admin-1': { role: 'admin' },
      'users/target-1': {
        displayName: 'Target',
        phoneNumber: '+15550001111',
        balanceUSD: 400,
        level: 3,
        skillScores: { carving: 4 },
      },
      'users/guest_old': {
        displayName: 'Guest',
        level: 2,
        skillScores: { carving: 99 },
        skillComments: { carving: 'Guest leftover' },
      },
      'bookings/b-1': {
        userId: 'guest_old',
        isGuest: true,
      },
    };

    const documentRef = (path: string) => ({
      path,
      get: async () => ({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
      update: async (data: Record<string, unknown>) => {
        if (path.startsWith('users/')) {
          userUpdates.push({ id: path.slice('users/'.length), data });
        }
        docs[path] = { ...docs[path], ...data };
      },
    });

    const db = {
      collection: (name: string) => ({
        doc: (id: string) => documentRef(`${name}/${id}`),
      }),
      runTransaction: async (handler: (transaction: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        update: (ref: { update: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>) =>
        handler({
          get: async (ref) => ref.get(),
          update: (ref, data) => {
            void ref.update(data);
          },
        }),
    } as unknown as Firestore;

    const result = await linkGuestBookingHandler(db)({
      auth: { uid: 'admin-1' },
      data: { bookingId: 'b-1', targetUserId: 'target-1' },
    } as CallableRequest<unknown>);

    expect(result).toEqual({ newBalance: 400 });
    expect(userUpdates).toEqual([]);
    expect(docs['users/target-1']).toMatchObject({
      displayName: 'Target',
      phoneNumber: '+15550001111',
      level: 3,
      skillScores: { carving: 4 },
    });
    expect(docs['users/guest_old']).toMatchObject({
      level: 2,
      skillScores: { carving: 99 },
      skillComments: { carving: 'Guest leftover' },
    });
    expect(docs['bookings/b-1']).toMatchObject({
      userId: 'target-1',
      isGuest: false,
    });
  });
});
