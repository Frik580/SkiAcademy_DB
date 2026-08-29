import { describe, expect, it } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  InstructorIdSchema,
} from '@ski-academy/shared-domain';
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
                id === instructorAccountId
                  ? { instructorId, isInstructor: true }
                  : undefined,
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
});
