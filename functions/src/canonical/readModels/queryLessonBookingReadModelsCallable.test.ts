import { describe, expect, it } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { AccountIdSchema, InstructorIdSchema } from '@ski-academy/shared-domain';
import { createQueryLessonBookingReadModelsHandler } from './queryLessonBookingReadModelsCallable';

const instructorAccountId = AccountIdSchema.parse('account_instructor_panel_01');
const instructorId = InstructorIdSchema.parse('instructor_panel_fixture_01');

const instructorPanelTransportPayload = {
  scope: 'instructor_hot' as const,
  idempotencyKey: 'read:lesson_booking:instructor_hot:start:none',
};

function createInstructorPanelFirestore(): Firestore {
  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: id === instructorAccountId,
              data: () =>
                id === instructorAccountId ? { instructorId, isInstructor: true } : undefined,
            }),
          }),
        };
      }
      if (name === 'bookings') {
        return {
          where: () => ({
            limit: () => ({
              get: async () => ({ docs: [] }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

function createAdminFirestore(
  role: 'admin' | 'user',
  lifecycleStatus: 'active' | 'disabled' = 'active'
): Firestore {
  const bookingsQuery = {
    orderBy: () => bookingsQuery,
    startAfter: () => bookingsQuery,
    limit: () => bookingsQuery,
    get: async () => ({ docs: [] }),
  };
  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: (accountId: string) => ({
            get: async () => ({
              data: () => ({
                role,
                accountId,
                lifecycle:
                  lifecycleStatus === 'active'
                    ? { status: 'active' }
                    : {
                        status: 'disabled',
                        disabledAt: { seconds: 2, nanoseconds: 0 },
                      },
                revision: 1,
                createdAt: { seconds: 1, nanoseconds: 0 },
                updatedAt: { seconds: 2, nanoseconds: 0 },
                audit: {
                  createdByCommandId: 'command_admin_callable_seed',
                  lastChangedByCommandId: 'command_admin_callable_seed',
                  correlationId: 'correlation_admin_callable_seed',
                },
              }),
            }),
          }),
        };
      }
      if (name === 'bookings') return bookingsQuery;
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

describe('queryLessonBookingReadModelsCallable instructor panel contract', () => {
  it('accepts loadInstructorCollaborationReads transport payload for instructor_hot', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createInstructorPanelFirestore());

    await expect(
      handler({
        data: instructorPanelTransportPayload,
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'instructor_hot',
      items: [],
      hasMore: false,
    });
  });

  it('rejects instructor_hot without authentication', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createInstructorPanelFirestore());

    await expect(
      handler({
        data: instructorPanelTransportPayload,
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('allows Admin scopes only through server-resolved administrator authority', async () => {
    const adminHandler = createQueryLessonBookingReadModelsHandler(createAdminFirestore('admin'));
    await expect(
      adminHandler({
        data: { scope: 'admin_hot' },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'admin_hot',
      items: [],
      hasMore: false,
    });

    const userHandler = createQueryLessonBookingReadModelsHandler(createAdminFirestore('user'));
    await expect(
      userHandler({
        data: { scope: 'admin_history' },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      adminHandler({
        data: { scope: 'admin_detail', bookingId: 'booking_admin_callable_01' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('denies Admin scopes when the canonical Account is disabled', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(
      createAdminFirestore('admin', 'disabled')
    );
    await expect(
      handler({
        data: { scope: 'admin_hot' },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('maps invalid Admin cursors to invalid-argument', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createAdminFirestore('admin'));
    await expect(
      handler({
        data: { scope: 'admin_hot', cursor: 'not-a-cursor' },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
