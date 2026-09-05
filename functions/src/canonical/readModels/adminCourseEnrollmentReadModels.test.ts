import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  CourseIdSchema,
  CourseSchema,
  ParticipantIdSchema,
  ParticipantSchema,
  PaymentIdSchema,
  PaymentSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canonicalCourseDeliveryFixtures,
  canonicalPaymentWalletAuditFixtures,
} from '@ski-academy/shared-domain/testing';
import { createQueryAdminCourseEnrollmentReadModelsHandler } from './queryAdminCourseEnrollmentReadModelsCallable';

const adminId = AccountIdSchema.parse('account_admin_course_enrollment_read_01');
const userId = AccountIdSchema.parse('account_user_course_enrollment_read_01');
const now = timestampFromDate(new Date('2026-08-01T00:00:00.000Z'));

function nestedValue(data: Record<string, unknown>, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      data
    );
}

function fakeFirestore(
  seed: Record<string, Record<string, unknown>>,
  reads?: Map<string, number>
): Firestore {
  const recordRead = (key: string) => reads?.set(key, (reads.get(key) ?? 0) + 1);
  const snapshot = (entries: Array<[string, Record<string, unknown>]>) => ({
    empty: entries.length === 0,
    docs: entries.map(([path, data]) => ({
      id: path.split('/').at(-1)!,
      data: () => data,
    })),
  });
  const collection = (path: string) => {
    const baseEntries = () =>
      Object.entries(seed).filter(([key]) => {
        if (!key.startsWith(`${path}/`)) return false;
        return key.slice(path.length + 1).split('/').length === 1;
      });
    const makeQuery = (
      filters: Array<{ field: string; op: string; value: unknown }> = [],
      orders: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
      cursor?: readonly unknown[],
      max?: number
    ): Record<string, unknown> => {
      const api = {
        where: (field: string, op: string, value: unknown) =>
          makeQuery([...filters, { field, op, value }], orders, cursor, max),
        orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
          makeQuery(filters, [...orders, { field, direction }], cursor, max),
        startAfter: (...values: unknown[]) => makeQuery(filters, orders, values, max),
        limit: (count: number) => makeQuery(filters, orders, cursor, count),
        get: async () => {
          recordRead(`query:${path}`);
          let entries = baseEntries().filter(([, data]) =>
            filters.every(({ field, op, value }) => {
              const actual = nestedValue(data, field);
              if (op === '==') return Object.is(actual, value);
              if (op === 'in') return (value as readonly unknown[]).includes(actual);
              return false;
            })
          );
          entries.sort((left, right) => {
            for (const order of orders) {
              const a = nestedValue(left[1], order.field) as number | string;
              const b = nestedValue(right[1], order.field) as number | string;
              if (a === b) continue;
              const compared = a < b ? -1 : 1;
              return order.direction === 'desc' ? -compared : compared;
            }
            return 0;
          });
          if (cursor) {
            const index = entries.findIndex(([, data]) =>
              orders.every((order, orderIndex) =>
                Object.is(nestedValue(data, order.field), cursor[orderIndex])
              )
            );
            if (index >= 0) entries = entries.slice(index + 1);
          }
          return snapshot(max === undefined ? entries : entries.slice(0, max));
        },
      };
      return api as unknown as Record<string, unknown>;
    };
    return {
      doc: (id: string) => ({
        get: async () => {
          recordRead(`doc:${path}/${id}`);
          const data = seed[`${path}/${id}`];
          return { exists: data !== undefined, data: () => data };
        },
      }),
      ...makeQuery(),
    };
  };
  return {
    collection,
    doc: (path: string) => ({
      get: async () => {
        recordRead(`doc:${path}`);
        const data = seed[path];
        return { exists: data !== undefined, data: () => data };
      },
    }),
  } as unknown as Firestore;
}

function account(accountId: typeof adminId, role: 'admin' | 'user') {
  return {
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: now,
      updatedAt: now,
      audit: {
        createdByCommandId: 'command_admin_course_enrollment_seed',
        lastChangedByCommandId: 'command_admin_course_enrollment_seed',
        correlationId: 'correlation_admin_course_enrollment_seed',
      },
    }),
    role,
    displayName: role === 'admin' ? 'Admin' : 'User',
  };
}

function participant(participantId: ReturnType<typeof ParticipantIdSchema.parse>, name: string) {
  return ParticipantSchema.parse({
    participantId,
    displayName: name,
    age: { kind: 'age_years', years: 16 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    audit: {
      createdByCommandId: 'command_admin_course_enrollment_seed',
      lastChangedByCommandId: 'command_admin_course_enrollment_seed',
      correlationId: 'correlation_admin_course_enrollment_seed',
    },
  });
}

function enrollment(input: {
  id: string;
  participantId: ReturnType<typeof ParticipantIdSchema.parse>;
  status: 'confirmed' | 'pending' | 'pending_cancellation' | 'cancelled';
  guest?: boolean;
  updatedOffset: number;
}) {
  const enrollmentId = CourseEnrollmentIdSchema.parse(input.id);
  const updatedAt = timestampFromDate(new Date(`2026-08-0${input.updatedOffset}T00:00:00.000Z`));
  const lifecycle =
    input.status === 'pending'
      ? {
          status: 'pending' as const,
          reservationExpiresAt: timestampFromDate(new Date('2026-11-15T00:00:00.000Z')),
        }
      : input.status === 'pending_cancellation'
        ? { status: 'pending_cancellation' as const, requestedAt: updatedAt }
        : input.status === 'cancelled'
          ? {
              status: 'cancelled' as const,
              cancelledAt: updatedAt,
              reasonCode: 'administrator_cancelled' as const,
            }
          : { status: 'confirmed' as const };
  return CourseEnrollmentSchema.parse({
    ...canonicalCourseDeliveryFixtures.confirmedEnrollment,
    enrollmentId,
    participantId: input.participantId,
    lifecycle,
    paymentId: PaymentIdSchema.parse(`payment_${input.id}`),
    attendanceSummary: undefined,
    ...(input.guest
      ? {
          payerAccountId: undefined,
          attribution: {
            bookingOrigin: 'guest',
            bookedBy: {
              kind: 'guest',
              guestSubjectId: `guest_subject_${input.id}`,
            },
          },
        }
      : { payerAccountId: adminId }),
    updatedAt,
  });
}

function paymentFor(record: ReturnType<typeof enrollment>) {
  return PaymentSchema.parse({
    ...canonicalPaymentWalletAuditFixtures.underpaidPayment,
    paymentId: record.paymentId,
    subjectType: 'course_enrollment',
    subjectId: record.enrollmentId,
    ...(record.payerAccountId ? { payerAccountId: record.payerAccountId } : {}),
  });
}

function seed() {
  const pendingParticipant = ParticipantIdSchema.parse('participant_admin_enrollment_pending');
  const confirmedParticipant = ParticipantIdSchema.parse('participant_admin_enrollment_confirmed');
  const historyParticipant = ParticipantIdSchema.parse('participant_admin_enrollment_history');
  const transferParticipant = ParticipantIdSchema.parse('participant_admin_enrollment_transfer');
  const pending = enrollment({
    id: 'course_enrollment_admin_pending',
    participantId: pendingParticipant,
    status: 'pending',
    guest: true,
    updatedOffset: 3,
  });
  const confirmed = enrollment({
    id: 'course_enrollment_admin_confirmed',
    participantId: confirmedParticipant,
    status: 'pending_cancellation',
    updatedOffset: 2,
  });
  const history = enrollment({
    id: 'course_enrollment_admin_history',
    participantId: historyParticipant,
    status: 'cancelled',
    updatedOffset: 1,
  });
  const transferable = enrollment({
    id: 'course_enrollment_admin_transfer',
    participantId: transferParticipant,
    status: 'confirmed',
    updatedOffset: 4,
  });
  const sourceCourse = CourseSchema.parse({
    ...canonicalCourseDeliveryFixtures.course,
    startAt: timestampFromDate(new Date('2026-12-01T04:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 2,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-12-02T08:00:00.000Z')),
      courseScheduleRevision: 2,
    },
  });
  const sourceDays = canonicalCourseDeliveryFixtures.courseDays.map((day, index) =>
    CourseDaySchema.parse({
      ...day,
      interval: {
        startsAt: timestampFromDate(new Date(`2026-12-0${index + 1}T04:00:00.000Z`)),
        endsAt: timestampFromDate(new Date(`2026-12-0${index + 1}T08:00:00.000Z`)),
      },
    })
  );
  const targetCourseId = CourseIdSchema.parse('course_admin_transfer_target');
  const targetDayId = CourseDayIdSchema.parse('course_day_admin_transfer_target');
  const targetCourse = CourseSchema.parse({
    ...sourceCourse,
    courseId: targetCourseId,
    title: 'Transfer Target',
    price: 30_000,
    capacity: { totalSeats: 4, availableSeats: 1 },
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-12-03T08:00:00.000Z')),
      courseScheduleRevision: 1,
    },
  });
  const targetDay = CourseDaySchema.parse({
    ...sourceDays[0],
    courseId: targetCourseId,
    courseDayId: targetDayId,
    interval: {
      startsAt: timestampFromDate(new Date('2026-12-03T04:00:00.000Z')),
      endsAt: timestampFromDate(new Date('2026-12-03T08:00:00.000Z')),
    },
  });
  return {
    [`users/${adminId}`]: account(adminId, 'admin'),
    [`users/${userId}`]: account(userId, 'user'),
    [`courses/${sourceCourse.courseId}`]: sourceCourse as unknown as Record<string, unknown>,
    [`courses/${targetCourse.courseId}`]: targetCourse as unknown as Record<string, unknown>,
    ...Object.fromEntries(
      sourceDays.map((day) => [
        `courses/${sourceCourse.courseId}/days/${day.courseDayId}`,
        day as unknown as Record<string, unknown>,
      ])
    ),
    [`courses/${targetCourse.courseId}/days/${targetDay.courseDayId}`]:
      targetDay as unknown as Record<string, unknown>,
    [`participants/${pendingParticipant}`]: participant(pendingParticipant, 'Pending Guest'),
    [`participants/${confirmedParticipant}`]: participant(
      confirmedParticipant,
      'Cancellation User'
    ),
    [`participants/${historyParticipant}`]: participant(historyParticipant, 'History User'),
    [`participants/${transferParticipant}`]: participant(transferParticipant, 'Transfer User'),
    [`course_enrollments/${pending.enrollmentId}`]: pending as unknown as Record<string, unknown>,
    [`course_enrollments/${confirmed.enrollmentId}`]: confirmed as unknown as Record<
      string,
      unknown
    >,
    [`course_enrollments/${history.enrollmentId}`]: history as unknown as Record<string, unknown>,
    [`course_enrollments/${transferable.enrollmentId}`]: transferable as unknown as Record<
      string,
      unknown
    >,
    [`payments/${pending.paymentId}`]: paymentFor(pending) as unknown as Record<string, unknown>,
    [`payments/${confirmed.paymentId}`]: paymentFor(confirmed) as unknown as Record<
      string,
      unknown
    >,
    [`payments/${history.paymentId}`]: paymentFor(history) as unknown as Record<string, unknown>,
    [`payments/${transferable.paymentId}`]: paymentFor(transferable) as unknown as Record<
      string,
      unknown
    >,
    [`admin_issues/${canonicalCourseDeliveryFixtures.openAdminIssue.issueId}`]: {
      ...canonicalCourseDeliveryFixtures.openAdminIssue,
      subjectRef: {
        subjectKind: 'course_enrollment',
        enrollmentId: transferable.enrollmentId,
      },
      participantId: transferable.participantId,
    } as unknown as Record<string, unknown>,
  };
}

describe('Admin CourseEnrollment read-model callable', () => {
  it('loads shared Course, payer Account, and CourseDays once per request', async () => {
    const reads = new Map<string, number>();
    const handler = createQueryAdminCourseEnrollmentReadModelsHandler(
      fakeFirestore(seed(), reads)
    );

    const roster = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_roster' },
    } as never);
    expect(roster.scope).toBe('admin_course_roster');
    expect(reads.get(`doc:courses/${canonicalCourseDeliveryFixtures.course.courseId}`)).toBe(1);
    expect(reads.get(`doc:users/${adminId}`)).toBe(1);

    reads.clear();
    await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_enrollment_detail',
        enrollmentId: CourseEnrollmentIdSchema.parse('course_enrollment_admin_transfer'),
      },
    } as never);
    expect(
      reads.get(`query:courses/${canonicalCourseDeliveryFixtures.course.courseId}/days`)
    ).toBe(1);
    expect(reads.get(`doc:users/${adminId}`)).toBe(1);
  });

  it('returns canonical roster/detail with server actions and finance/capacity linkage', async () => {
    const handler = createQueryAdminCourseEnrollmentReadModelsHandler(fakeFirestore(seed()));
    const roster = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_roster' },
    } as never);
    expect(roster.scope).toBe('admin_course_roster');
    if (roster.scope !== 'admin_course_roster') return;
    expect(roster.items).toHaveLength(3);
    expect(roster.items.every((item) => !('bookingId' in item))).toBe(true);
    expect(roster.items.every((item) => item.course.courseId !== undefined)).toBe(true);

    const cancellation = roster.items.find(
      (item) => item.lifecycleStatus === 'pending_cancellation'
    )!;
    const detail = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_enrollment_detail',
        enrollmentId: cancellation.enrollmentId,
      },
    } as never);
    expect(detail).toMatchObject({
      scope: 'admin_enrollment_detail',
      item: {
        authorizedActions: { canResolveCancellation: true },
        capacity: { seatHeldByEnrollment: true },
        payment: { paymentId: cancellation.payment!.paymentId, price: expect.any(Number) },
      },
    });

    const transferable = roster.items.find((item) => item.lifecycleStatus === 'confirmed')!;
    const transferDetail = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_enrollment_detail', enrollmentId: transferable.enrollmentId },
    } as never);
    expect(transferDetail).toMatchObject({
      scope: 'admin_enrollment_detail',
      item: {
        authorizedActions: { canTransfer: true, canReconcile: false },
        transfer: {
          targetOptions: [
            {
              courseId: 'course_admin_transfer_target',
              title: 'Transfer Target',
              availableSeats: 1,
              price: 30_000,
            },
          ],
        },
      },
    });
  });

  it('separates pending guests and terminal history with stable cursor pagination', async () => {
    const handler = createQueryAdminCourseEnrollmentReadModelsHandler(fakeFirestore(seed()));
    const pending = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_pending_guest' },
    } as never);
    expect(pending).toMatchObject({
      scope: 'admin_pending_guest',
      items: [
        {
          guestState: 'pending_unlinked',
          authorizedActions: {
            canApproveGuest: false,
            canCancelUnpaidGuest: false,
            canLinkGuest: true,
          },
        },
      ],
    });

    const first = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_roster', pageSize: 1 },
    } as never);
    expect(first.scope).toBe('admin_course_roster');
    if (first.scope !== 'admin_course_roster') return;
    expect(first.hasMore).toBe(true);
    const second = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_roster', pageSize: 1, cursor: first.nextCursor },
    } as never);
    expect(second.scope).toBe('admin_course_roster');
    if (second.scope === 'admin_course_roster') {
      expect(second.items[0]?.enrollmentId).not.toBe(first.items[0]?.enrollmentId);
    }

    const history = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_history' },
    } as never);
    expect(history).toMatchObject({
      scope: 'admin_history',
      items: [{ lifecycleStatus: 'cancelled' }],
    });
  });

  it('denies non-admin roster and detail reads', async () => {
    const handler = createQueryAdminCourseEnrollmentReadModelsHandler(fakeFirestore(seed()));
    await expect(
      handler({ auth: { uid: userId }, data: { scope: 'admin_course_roster' } } as never)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
