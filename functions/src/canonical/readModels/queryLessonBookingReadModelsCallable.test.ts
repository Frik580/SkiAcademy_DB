import { describe, expect, it } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  TestSessionIdSchema,
  boundCanonicalReadIdempotencyCursor,
  buildCanonicalReadIdempotencyKey,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryLessonBookingReadModelsHandler } from './queryLessonBookingReadModelsCallable';
import {
  isTestScopeCollection,
  missingTestScopeCollection,
} from '../testSessions/missingTestScopeCollection';

const instructorAccountId = AccountIdSchema.parse('account_instructor_panel_01');
const instructorId = InstructorIdSchema.parse('instructor_panel_fixture_01');

const instructorPanelTransportPayload = {
  scope: 'instructor_hot' as const,
  idempotencyKey: 'read:lesson_booking:instructor_hot:start:none',
};

function createInstructorPanelFirestore(
  lifecycleStatus: 'active' | 'disabled' = 'active'
): Firestore {
  const bookingsQuery = {
    where: () => bookingsQuery,
    orderBy: () => bookingsQuery,
    startAfter: () => bookingsQuery,
    limit: () => bookingsQuery,
    get: async () => ({ docs: [] }),
  };
  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: id === instructorAccountId,
              data: () =>
                id === instructorAccountId
                  ? {
                      instructorId,
                      isInstructor: true,
                      accountId: instructorAccountId,
                      lifecycle:
                        lifecycleStatus === 'active'
                          ? { status: 'active' }
                          : { status: 'disabled', disabledAt: { seconds: 2, nanoseconds: 0 } },
                      revision: 1,
                      createdAt: { seconds: 1, nanoseconds: 0 },
                      updatedAt: { seconds: 2, nanoseconds: 0 },
                      audit: {
                        createdByCommandId: 'command_instructor_callable_seed',
                        lastChangedByCommandId: 'command_instructor_callable_seed',
                        correlationId: 'correlation_instructor_callable_seed',
                      },
                    }
                  : undefined,
            }),
          }),
        };
      }
      if (name === 'bookings') {
        return bookingsQuery;
      }
      if (isTestScopeCollection(name)) return missingTestScopeCollection();
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

function createAdminFirestore(
  role: 'admin' | 'user',
  lifecycleStatus: 'active' | 'disabled' = 'active'
): Firestore {
  const bookingsQuery = {
    where: () => bookingsQuery,
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
      if (isTestScopeCollection(name)) return missingTestScopeCollection();
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

    await expect(
      handler({
        data: {
          scope: 'instructor_history',
          idempotencyKey: 'read:lesson_booking:instructor_history:start:none',
        },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'instructor_history',
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

  it('denies instructor scopes when the canonical Account is disabled', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(
      createInstructorPanelFirestore('disabled')
    );

    await expect(
      handler({
        data: instructorPanelTransportPayload,
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
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
    await expect(
      adminHandler({
        data: { scope: 'admin_pending_guest' },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'admin_pending_guest',
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
      userHandler({
        data: { scope: 'admin_pending_guest' },
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

  it('rejects instructor_history page 2 when idempotencyKey embeds the raw cursor', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createInstructorPanelFirestore());
    const cursor =
      'eyJzY29wZSI6Imluc3RydWN0b3JfaGlzdG9yeSIsInVwZGF0ZWRBdFNlY29uZHMiOjE3ODgzNTU5MDQsInVwZGF0ZWRBdE5hbm9zZWNvbmRzIjozMzAwMDAwMCwiYm9va2luZ0lkIjoiYm9va2luZ19hZG1pbl8xMWY1YmM5YTY5Zjc0ZmY5YWFkNjU5MDVmZjI5ZmE2ZSJ9';
    await expect(
      handler({
        data: {
          scope: 'instructor_history',
          cursor,
          idempotencyKey: `read:lesson_booking:instructor_history:${cursor}:none`,
        },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'The request is invalid.',
    });
  });

  it('accepts instructor_history page 2 when idempotencyKey uses a bounded cursor hash', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createInstructorPanelFirestore());
    const cursor =
      'eyJzY29wZSI6Imluc3RydWN0b3JfaGlzdG9yeSIsInVwZGF0ZWRBdFNlY29uZHMiOjE3ODgzNTU5MDQsInVwZGF0ZWRBdE5hbm9zZWNvbmRzIjozMzAwMDAwMCwiYm9va2luZ0lkIjoiYm9va2luZ19hZG1pbl8xMWY1YmM5YTY5Zjc0ZmY5YWFkNjU5MDVmZjI5ZmE2ZSJ9';
    const idempotencyKey = buildCanonicalReadIdempotencyKey([
      'read:lesson_booking',
      'instructor_history',
      boundCanonicalReadIdempotencyCursor(cursor),
      'none',
    ]);
    await expect(
      handler({
        data: {
          scope: 'instructor_history',
          cursor,
          idempotencyKey,
        },
        auth: { uid: instructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'instructor_history',
      items: [],
      hasMore: false,
    });
  });
});

const liveAccountId = AccountIdSchema.parse('account_live_cabinet_01');
const testAccountId = AccountIdSchema.parse('account_test_actor_01');
const adminAccountId = AccountIdSchema.parse('account_live_admin_01');
const liveParticipantId = ParticipantIdSchema.parse('participant_live_cabinet_01');
const testParticipantId = ParticipantIdSchema.parse('participant_test_actor_01');
const liveManagementId = ParticipantManagementIdSchema.parse('management_live_cabinet_01');
const testManagementId = ParticipantManagementIdSchema.parse('management_test_actor_01');
const sessionA = TestSessionIdSchema.parse('test_read_scope_01');
const sessionB = TestSessionIdSchema.parse('test_read_scope_02');
const instructorIdForScope = InstructorIdSchema.parse('instructor_test_actor_01');
const scopeAudit = {
  createdByCommandId: 'command_test_actor_read',
  lastChangedByCommandId: 'command_test_actor_read',
  correlationId: 'correlation_test_actor_read',
};
const scopeAt = timestampFromDate(new Date('2026-09-21T00:00:00.000Z'));
const futureStart = timestampFromDate(new Date('2026-12-01T09:00:00.000Z'));
const futureEnd = timestampFromDate(new Date('2026-12-01T10:00:00.000Z'));

function scopeSession(id: typeof sessionA, status: 'active' | 'closed') {
  return {
    testSessionId: id,
    schemaVersion: 1,
    status,
    label: 'Test actor read fixture',
    createdByAccountId: adminAccountId,
    config: { startingBalanceKzt: 100000, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
  };
}

function scopeAccount(
  accountId: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
    ...extra,
  };
}

function scopeBooking(input: {
  readonly bookingId: string;
  readonly participantId: string;
  readonly payerAccountId: string;
  readonly scope?: { readonly dataScope: 'live' | 'test'; readonly testSessionId?: string };
}): Record<string, unknown> {
  const bookingId = BookingIdSchema.parse(input.bookingId);
  return {
    bookingId,
    ...(input.scope ?? {}),
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId: input.payerAccountId },
    },
    party: { kind: 'individual', participantIds: [input.participantId] },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse(`occurrence_${input.bookingId.replace(/^booking_/, '')}`),
      instructorId: instructorIdForScope,
      interval: { startsAt: futureStart, endsAt: futureEnd },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [input.participantId], frozenAt: futureStart },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: input.payerAccountId,
    revision: 1,
    createdAt: scopeAt,
    updatedAt: futureEnd,
    audit: scopeAudit,
  };
}

function createTestActorReadFirestore(input: {
  readonly sessionAStatus?: 'active' | 'closed';
  readonly assignTestActor?: boolean;
}): Firestore {
  const docs = new Map<string, Record<string, unknown>>();
  const put = (path: string, data: Record<string, unknown>) => docs.set(path, data);
  put(`users/${liveAccountId}`, scopeAccount(liveAccountId));
  put(
    `users/${testAccountId}`,
    scopeAccount(testAccountId, { dataScope: 'test' })
  );
  put(`users/${adminAccountId}`, scopeAccount(adminAccountId, { role: 'admin' }));
  put(`test_actors/${testAccountId}`, {
    accountId: testAccountId,
    participantIds: [testParticipantId],
    kind: 'test_parent',
    allowed: true,
    dataScope: 'test',
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
  });
  if (input.assignTestActor !== false) {
    put(`test_actor_assignments/${testAccountId}`, {
      accountId: testAccountId,
      activeTestSessionId: sessionA,
      revision: 1,
      updatedAt: scopeAt,
      audit: scopeAudit,
    });
  }
  put(`test_sessions/${sessionA}`, scopeSession(sessionA, input.sessionAStatus ?? 'active'));
  put(`test_sessions/${sessionB}`, scopeSession(sessionB, 'active'));
  put(`participant_management/${liveManagementId}`, {
    participantManagementId: liveManagementId,
    accountId: liveAccountId,
    participantId: liveParticipantId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
  });
  put(`participant_management/${testManagementId}`, {
    participantManagementId: testManagementId,
    accountId: testAccountId,
    participantId: testParticipantId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
  });
  put(`participants/${liveParticipantId}`, {
    participantId: liveParticipantId,
    displayName: 'Live Student',
    age: { kind: 'age_years', years: 30 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: liveManagementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
  });
  put(`participants/${testParticipantId}`, {
    participantId: testParticipantId,
    dataScope: 'test',
    testSessionId: sessionA,
    displayName: 'Test Student',
    age: { kind: 'age_years', years: 30 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: testManagementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: scopeAt,
    updatedAt: scopeAt,
    audit: scopeAudit,
  });
  put(`instructors/${instructorIdForScope}`, {
    id: instructorIdForScope,
    name: 'Scope Coach',
    pricePerHourKZT: 30000,
  });
  put(
    'bookings/booking_live_cabinet_hot',
    scopeBooking({
      bookingId: 'booking_live_cabinet_hot',
      participantId: liveParticipantId,
      payerAccountId: liveAccountId,
      scope: { dataScope: 'live' },
    })
  );
  put(
    'bookings/booking_test_actor_same',
    scopeBooking({
      bookingId: 'booking_test_actor_same',
      participantId: testParticipantId,
      payerAccountId: testAccountId,
      scope: { dataScope: 'test', testSessionId: sessionA },
    })
  );
  put(
    'bookings/booking_test_actor_other',
    scopeBooking({
      bookingId: 'booking_test_actor_other',
      participantId: testParticipantId,
      payerAccountId: testAccountId,
      scope: { dataScope: 'test', testSessionId: sessionB },
    })
  );

  const readField = (data: Record<string, unknown>, field: string): unknown => {
    let current: unknown = data;
    for (const part of field.split('.')) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };
  const query = (name: string, rows: Array<{ id: string; data: Record<string, unknown> }>, maximum?: number) => ({
    where: (field: string, op: string, value: unknown) =>
      query(
        name,
        rows.filter(({ data }) => {
          if (op === 'array-contains-any' && Array.isArray(value)) {
            const arrayField = readField(data, field) as unknown[] | undefined;
            return arrayField?.some((entry) => value.includes(entry)) ?? false;
          }
          if (op !== '==') throw new Error(`Unsupported fixture operator: ${op}`);
          return readField(data, field) === value;
        }),
        maximum
      ),
    orderBy: () => query(name, rows, maximum),
    startAfter: () => query(name, rows, maximum),
    limit: (value: number) => query(name, rows, value),
    get: async () => ({
      docs: rows.slice(0, maximum).map(({ id, data }) => ({
        id,
        exists: true,
        data: () => data,
        get: (field: string) => data[field],
      })),
      empty: rows.slice(0, maximum).length === 0,
      size: rows.slice(0, maximum).length,
    }),
  });
  const snapshot = async (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').at(-1) ?? path,
      exists: data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
    };
  };
  const rowsFor = (name: string) =>
    [...docs.entries()]
      .filter(([path]) => path.startsWith(`${name}/`) && path.split('/').length === 2)
      .map(([path, data]) => ({ id: path.slice(name.length + 1), data }));

  return {
    collection: (name: string) => ({
      ...query(name, rowsFor(name)),
      doc: (id: string) => ({ get: async () => snapshot(`${name}/${id}`) }),
    }),
    doc: (path: string) => ({
      get: async () => snapshot(path.startsWith('/') ? path.slice(1) : path),
    }),
    getAll: async (...refs: Array<{ get: () => Promise<unknown> }>) =>
      Promise.all(refs.map((ref) => ref.get())),
  } as unknown as Firestore;
}

function accountHot(uid: string) {
  return {
    data: {
      scope: 'account_hot',
      idempotencyKey: 'read:lesson_booking:account_hot:start:none:rs:live',
    },
    auth: { uid },
  } as CallableRequest<Record<string, unknown>>;
}

describe('queryLessonBookingReadModelsCallable TestActor account_hot', () => {
  it('lets a LIVE account read only LIVE bookings with the default request', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createTestActorReadFirestore({}));
    const result = await handler(accountHot(liveAccountId));
    expect(result.scope).toBe('account_hot');
    if (result.scope !== 'account_hot') return;
    expect(result.items.map((item) => item.bookingId)).toEqual(['booking_live_cabinet_hot']);
  });

  it('resolves an assigned TestActor to TEST without a client session id', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createTestActorReadFirestore({}));
    const result = await handler(accountHot(testAccountId));
    expect(result.scope).toBe('account_hot');
    if (result.scope !== 'account_hot') return;
    expect(result.items.map((item) => item.bookingId)).toEqual(['booking_test_actor_same']);
  });

  it('fails closed when a TestActor has no assignment', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(
      createTestActorReadFirestore({ assignTestActor: false })
    );
    await expect(handler(accountHot(testAccountId))).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'TEST_ACTOR_NO_SESSION' },
    });
  });

  it('fails closed when the assigned TestSession is closed', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(
      createTestActorReadFirestore({ sessionAStatus: 'closed' })
    );
    await expect(handler(accountHot(testAccountId))).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'TEST_SESSION_NOT_ACTIVE' },
    });
  });

  it('rejects a TestActor request for another session', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createTestActorReadFirestore({}));
    await expect(
      handler({
        data: { scope: 'account_hot', requestedTestSessionId: sessionB },
        auth: { uid: testAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({
      code: 'permission-denied',
      details: { code: 'TEST_ACTOR_REQUEST_FORBIDDEN' },
    });
  });

  it('keeps an ordinary Admin read on LIVE until Test context is requested', async () => {
    const handler = createQueryLessonBookingReadModelsHandler(createTestActorReadFirestore({}));
    await expect(
      handler({
        data: { scope: 'admin_detail', bookingId: 'booking_test_actor_same' },
        auth: { uid: adminAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'admin_detail',
      items: [],
      hasMore: false,
    });

    await expect(
      handler({
        data: {
          scope: 'admin_detail',
          bookingId: 'booking_test_actor_same',
          requestedTestSessionId: sessionA,
        },
        auth: { uid: adminAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toThrow(/payments\//);
  });
});
