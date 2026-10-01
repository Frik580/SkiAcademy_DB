import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  PaymentIdSchema,
  TestSessionIdSchema,
  testCanonicalReadScope,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import { createQueryAdminCourseReadModelsHandler } from './queryAdminCourseReadModelsCallable';
import { queryAdminCourseReadModels } from './adminCourseReadModels';

const adminId = AccountIdSchema.parse('account_admin_course_read_01');
const userId = AccountIdSchema.parse('account_user_course_read_01');
const courseId = CourseIdSchema.parse('course_admin_read_01');
const dayId = CourseDayIdSchema.parse('course_day_admin_read_01');
const instructorId = InstructorIdSchema.parse('instructor_admin_read_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_course_read_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

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
  reads: string[] = []
): Firestore {
  const snapshot = (entries: Array<[string, Record<string, unknown>]>) => ({
    empty: entries.length === 0,
    docs: entries.map(([path, data]) => ({
      id: path.split('/').at(-1),
      data: () => data,
      get: (field: string) => nestedValue(data, field),
    })),
  });
  const compare = (left: unknown, right: unknown) =>
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right));
  const collection = (path: string) => {
    const entries = () =>
      Object.entries(seed).filter(([key]) => {
        if (!key.startsWith(`${path}/`)) return false;
        return key.slice(path.length + 1).split('/').length === 1;
      });
    const createQuery = () => {
      const filters: Array<{ field: string; op: string; value: unknown }> = [];
      const orderings: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
      let after: readonly unknown[] | undefined;
      let maximum: number | undefined;
      const query = {
        where: (field: string, op: string, value: unknown) => {
          filters.push({ field, op, value });
          return query;
        },
        orderBy: (field: unknown, direction: 'asc' | 'desc' = 'asc') => {
          orderings.push({ field: typeof field === 'string' ? field : '__name__', direction });
          return query;
        },
        startAfter: (...values: unknown[]) => {
          after = values;
          return query;
        },
        limit: (count: number) => {
          maximum = count;
          return query;
        },
        get: async () => {
          reads.push(`${path}:query`);
          if (maximum !== undefined) reads.push(`${path}:limit:${maximum}`);
          let result = entries().filter(([, data]) =>
            filters.every(({ field, op, value }) => {
              const actual = nestedValue(data, field);
              return op === 'in'
                ? (value as readonly unknown[]).includes(actual)
                : Object.is(actual, value);
            })
          );
          const tuple = ([entryPath, data]: [string, Record<string, unknown>]) =>
            orderings.map(({ field }) =>
              field === '__name__' ? entryPath.split('/').at(-1) : nestedValue(data, field)
            );
          result.sort((left, right) => {
            const leftTuple = tuple(left);
            const rightTuple = tuple(right);
            for (let index = 0; index < orderings.length; index += 1) {
              const compared = compare(leftTuple[index], rightTuple[index]);
              if (compared !== 0)
                return orderings[index]!.direction === 'asc' ? compared : -compared;
            }
            return 0;
          });
          if (after) {
            result = result.filter((entry) => {
              const values = tuple(entry);
              for (let index = 0; index < orderings.length; index += 1) {
                const compared = compare(values[index], after![index]);
                if (compared !== 0)
                  return orderings[index]!.direction === 'asc' ? compared > 0 : compared < 0;
              }
              return false;
            });
          }
          return snapshot(maximum === undefined ? result : result.slice(0, maximum));
        },
        count: () => ({
          get: async () => {
            reads.push(`${path}:count`);
            const count = entries().filter(([, data]) =>
              filters.every(({ field, op, value }) => {
                const actual = nestedValue(data, field);
                return op === 'in'
                  ? (value as readonly unknown[]).includes(actual)
                  : Object.is(actual, value);
              })
            ).length;
            return { data: () => ({ count }) };
          },
        }),
      };
      return query;
    };
    return {
      ...createQuery(),
      doc: (id: string) => ({
        get: async () => {
          reads.push(`${path}/${id}`);
          const data = seed[`${path}/${id}`];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    };
  };
  return {
    collection,
    doc: (path: string) => ({
      get: async () => {
        reads.push(path);
        const data = seed[path];
        return { exists: data !== undefined, data: () => data };
      },
    }),
  } as unknown as Firestore;
}

function seed() {
  const account = (accountId: typeof adminId, role: 'admin' | 'user') => ({
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    }),
    role,
  });
  const course = CourseSchema.parse({
    courseId,
    title: 'Read Model Course',
    lifecycle: 'active',
    price: 45_000,
    capacity: { totalSeats: 6, availableSeats: 5 },
    instructorRosterIds: [instructorId],
    startAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
      courseScheduleRevision: 3,
    },
    revision: 4,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  const day = CourseDaySchema.parse({
    courseId,
    courseDayId: dayId,
    dayOrder: 1,
    interval: {
      startsAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
      endsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 2,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  return {
    [`users/${adminId}`]: account(adminId, 'admin'),
    [`users/${userId}`]: account(userId, 'user'),
    [`courses/${courseId}`]: course as unknown as Record<string, unknown>,
    [`courses/${courseId}/days/${dayId}`]: day as unknown as Record<string, unknown>,
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Safe Coach',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`course_catalog_content/${courseId}`]: {
      courseId,
      duration: 'One day',
      description: 'Presentation content',
      dates: '1 December',
      bgImageUrl: 'https://example.com/course.webp',
    },
  };
}

function addCourse(
  data: Record<string, Record<string, unknown>>,
  id: string,
  title: string,
  lifecycle: 'active' | 'archived'
) {
  const parsedId = CourseIdSchema.parse(id);
  data[`courses/${parsedId}`] = CourseSchema.parse({
    ...(data[`courses/${courseId}`] as Record<string, unknown>),
    courseId: parsedId,
    title,
    lifecycle,
  }) as unknown as Record<string, unknown>;
  return parsedId;
}

describe('Admin Course read-model callable', () => {
  it('accepts transport-injected idempotencyKey from canonical read-model client', async () => {
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(seed()));
    await expect(
      handler({
        auth: { uid: adminId },
        data: {
          scope: 'admin_course_list',
          pageSize: 50,
          idempotencyKey: 'read:admin_course:admin_course_list:list',
        },
      } as never)
    ).resolves.toMatchObject({ scope: 'admin_course_list' });
  });

  it('returns list and detail projections only after server Admin authorization', async () => {
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(seed()));
    const list = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        idempotencyKey: 'read:admin_course:admin_course_list:list',
      },
    } as never);
    expect(list.scope).toBe('admin_course_list');
    if (list.scope === 'admin_course_list') {
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        courseId,
        revision: 4,
        scheduleRevision: 3,
        capacity: { occupiedConfirmedSeats: 1 },
        catalogContent: { status: 'present' },
        courseDays: [expect.objectContaining({ courseId })],
      });
    }
    const detail = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_detail',
        courseId,
        idempotencyKey: `read:admin_course:admin_course_detail:${courseId}`,
      },
    } as never);
    expect(detail.scope).toBe('admin_course_detail');
    if (detail.scope === 'admin_course_detail')
      expect(detail.item?.instructors[0]?.name).toBe('Safe Coach');
  });

  it('returns every CourseDay to Admin regardless of day instructor assignment', async () => {
    const data = seed();
    const secondInstructorId = InstructorIdSchema.parse('instructor_admin_read_02');
    const thirdInstructorId = InstructorIdSchema.parse('instructor_admin_read_03');
    const dayTwoId = CourseDayIdSchema.parse('course_day_admin_read_02');
    const dayThreeId = CourseDayIdSchema.parse('course_day_admin_read_03');
    const dayTwoStart = timestampFromDate(new Date('2026-12-02T04:00:00.000Z'));
    const dayTwoEnd = timestampFromDate(new Date('2026-12-02T10:00:00.000Z'));
    const dayThreeStart = timestampFromDate(new Date('2026-12-03T04:00:00.000Z'));
    const dayThreeEnd = timestampFromDate(new Date('2026-12-03T10:00:00.000Z'));
    data[`courses/${courseId}`] = CourseSchema.parse({
      ...(data[`courses/${courseId}`] as Record<string, unknown>),
      instructorRosterIds: [instructorId, secondInstructorId, thirdInstructorId],
      scheduleProjection: {
        courseDayCount: 3,
        finalCourseDayEndsAt: dayThreeEnd,
        courseScheduleRevision: 3,
      },
    }) as unknown as Record<string, unknown>;
    const extraDay = (
      courseDayId: typeof dayTwoId,
      dayOrder: number,
      assignedInstructorId: typeof instructorId,
      startsAt: typeof dayTwoStart,
      endsAt: typeof dayTwoEnd
    ) =>
      CourseDaySchema.parse({
        ...(data[`courses/${courseId}/days/${dayId}`] as Record<string, unknown>),
        courseDayId,
        dayOrder,
        interval: { startsAt, endsAt },
        actualInstructorIds: [assignedInstructorId],
      }) as unknown as Record<string, unknown>;
    data[`courses/${courseId}/days/${dayTwoId}`] = extraDay(
      dayTwoId,
      2,
      secondInstructorId,
      dayTwoStart,
      dayTwoEnd
    );
    data[`courses/${courseId}/days/${dayThreeId}`] = extraDay(
      dayThreeId,
      3,
      thirdInstructorId,
      dayThreeStart,
      dayThreeEnd
    );

    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));
    const detail = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_detail',
        courseId,
        idempotencyKey: `read:admin_course:admin_course_detail:${courseId}:mixed-days`,
      },
    } as never);

    expect(detail.scope).toBe('admin_course_detail');
    if (detail.scope !== 'admin_course_detail') return;
    expect(detail.item?.courseDays.map((day) => day.courseDayId)).toEqual([
      dayId,
      dayTwoId,
      dayThreeId,
    ]);
  });

  it('keeps exact CourseEnrollment totals without reading the course history', async () => {
    const data = seed();
    const reads: string[] = [];
    const enrollmentCount = 63;
    for (let index = 0; index < enrollmentCount; index += 1) {
      const enrollmentId = CourseEnrollmentIdSchema.parse(
        `course_enrollment_admin_count_${String(index).padStart(2, '0')}`
      );
      const lifecycle =
        index < 40
          ? { status: 'confirmed' as const }
          : index < 50
            ? {
                status: 'pending' as const,
                reservationExpiresAt: timestampFromDate(new Date('2026-11-15T00:00:00.000Z')),
              }
            : {
                status: 'cancelled' as const,
                cancelledAt: createdAt,
                reasonCode: 'administrator_cancelled' as const,
              };
      const enrollment = CourseEnrollmentSchema.parse({
        ...canonicalCourseDeliveryFixtures.confirmedEnrollment,
        enrollmentId,
        courseId,
        paymentId: PaymentIdSchema.parse(`payment_admin_count_${String(index).padStart(2, '0')}`),
        lifecycle,
        ...(index >= 40 && index < 50
          ? {
              attribution: {
                bookingOrigin: 'guest' as const,
                bookedBy: {
                  kind: 'guest' as const,
                  guestSubjectId: `guest_subject_admin_count_${String(index).padStart(2, '0')}`,
                },
              },
              payerAccountId: undefined,
            }
          : {}),
        updatedAt: createdAt,
      });
      data[`course_enrollments/${enrollmentId}`] = enrollment as unknown as Record<string, unknown>;
    }
    const testSessionId = TestSessionIdSchema.parse('test_admin_count_hidden_session_01');
    data['course_enrollments/course_enrollment_admin_count_hidden_test_active'] = {
      courseId,
      dataScope: 'test',
      testSessionId,
      lifecycle: { status: 'confirmed' },
    };
    data['course_enrollments/course_enrollment_admin_count_hidden_test_history'] = {
      courseId,
      dataScope: 'test',
      testSessionId,
      lifecycle: { status: 'cancelled' },
    };

    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data, reads));
    const detail = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_detail', courseId },
    } as never);

    expect(detail.scope).toBe('admin_course_detail');
    if (detail.scope !== 'admin_course_detail') return;
    expect(detail.item).toMatchObject({ activeEnrollmentCount: 50, totalEnrollmentCount: 63 });
    expect(detail.item?.authorizedActions.map((action) => action.kind)).not.toContain(
      'remove_course_day'
    );
    expect(reads).not.toContain('course_enrollments:query');
    expect(reads.filter((read) => read === 'course_enrollments:count')).toHaveLength(4);
    expect(reads.filter((read) => read === 'attendance:count')).toHaveLength(2);
  });

  it('keeps aggregate counts inside the requested Test Session scope', async () => {
    const data = seed();
    const testSessionId = TestSessionIdSchema.parse('test_admin_course_count_scope_01');
    const otherSessionId = TestSessionIdSchema.parse('test_admin_course_count_scope_02');
    data[`courses/${courseId}`] = {
      ...data[`courses/${courseId}`],
      dataScope: 'test',
      testSessionId,
    };
    data[`courses/${courseId}/days/${dayId}`] = {
      ...data[`courses/${courseId}/days/${dayId}`],
      dataScope: 'test',
      testSessionId,
    };
    const records = [
      { id: 'enrollment_scope_active', scope: testSessionId, status: 'confirmed' },
      { id: 'enrollment_scope_history', scope: testSessionId, status: 'cancelled' },
      { id: 'enrollment_scope_other', scope: otherSessionId, status: 'confirmed' },
      { id: 'enrollment_scope_live', scope: undefined, status: 'confirmed' },
    ];
    for (const record of records) {
      data[`course_enrollments/${record.id}`] = {
        courseId,
        lifecycle: { status: record.status },
        ...(record.scope
          ? { dataScope: 'test', testSessionId: record.scope }
          : { dataScope: 'live' }),
      };
    }

    const result = await queryAdminCourseReadModels(
      fakeFirestore(data),
      { kind: 'administrator', accountId: adminId },
      { scope: 'admin_course_detail', courseId },
      { readScope: testCanonicalReadScope(testSessionId) }
    );

    expect(result.scope).toBe('admin_course_detail');
    if (result.scope !== 'admin_course_detail') return;
    expect(result.item).toMatchObject({ activeEnrollmentCount: 1, totalEnrollmentCount: 2 });
  });

  it('keeps the list projection free of detail-grade joins', async () => {
    const reads: string[] = [];
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(seed(), reads));
    const result = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_list', pageSize: 50, readModelVersion: 2 },
    } as never);

    expect(result.scope).toBe('admin_course_list');
    // Compact v2 may read first/last CourseDay for scheduleSummary only — never full days,
    // enrollments, or attendance.
    expect(reads.filter((path) => path === `courses/${courseId}/days:query`)).toHaveLength(2);
    expect(reads).not.toContain('course_enrollments:query');
    expect(reads).not.toContain(`courses/${courseId}/attendance:query`);
    if (result.scope === 'admin_course_list') {
      expect(result.items[0]).not.toHaveProperty('courseDays');
      expect(result.items[0]).not.toHaveProperty('activeEnrollmentCount');
      expect(result.items[0]?.scheduleSummary).toMatchObject({
        courseDayCount: 1,
        timeZone: 'Asia/Almaty',
        startsAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
      });
      expect(result.items[0]?.instructors).toEqual([
        expect.objectContaining({ instructorId, name: 'Safe Coach' }),
      ]);
    }
  });

  it('keeps archived Courses out of the bounded active list', async () => {
    const data = seed();
    const archivedCourseId = CourseIdSchema.parse('course_admin_read_archived_01');
    data[`courses/${archivedCourseId}`] = CourseSchema.parse({
      ...(data[`courses/${courseId}`] as Record<string, unknown>),
      courseId: archivedCourseId,
      title: 'Archived Course',
      lifecycle: 'archived',
    }) as unknown as Record<string, unknown>;

    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));
    const result = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_list', pageSize: 50, readModelVersion: 2 },
    } as never);

    expect(result.scope).toBe('admin_course_list');
    if (result.scope === 'admin_course_list') {
      expect(result.items.map((item) => item.courseId)).toEqual([courseId]);
    }
  });

  it('paginates active and archived v2 scopes with stable title/document cursors', async () => {
    const data = seed();
    const activeA = addCourse(data, 'course_admin_read_active_a', 'Alpha Course', 'active');
    const activeB = addCourse(data, 'course_admin_read_active_b', 'Alpha Course', 'active');
    const archivedA = addCourse(data, 'course_admin_read_archived_a', 'Archived Alpha', 'archived');
    const archivedB = addCourse(data, 'course_admin_read_archived_b', 'Archived Beta', 'archived');
    const archivedC = addCourse(data, 'course_admin_read_archived_c', 'Archived Gamma', 'archived');
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));

    const firstActive = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        readModelVersion: 2,
        lifecycle: 'active',
        pageSize: 2,
      },
    } as never);
    expect(firstActive).toMatchObject({ scope: 'admin_course_list', hasMore: true });
    if (firstActive.scope !== 'admin_course_list') throw new Error('unexpected scope');
    expect(firstActive.items.map((item) => item.courseId)).toEqual([activeA, activeB]);
    const secondActive = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        readModelVersion: 2,
        lifecycle: 'active',
        pageSize: 2,
        cursor: firstActive.nextCursor,
      },
    } as never);
    if (secondActive.scope !== 'admin_course_list') throw new Error('unexpected scope');
    expect(secondActive.hasMore).toBe(false);
    expect(secondActive.items.map((item) => item.courseId)).toEqual([courseId]);
    expect(
      new Set([...firstActive.items, ...secondActive.items].map((item) => item.courseId)).size
    ).toBe(3);

    const firstArchived = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        readModelVersion: 2,
        lifecycle: 'archived',
        pageSize: 2,
      },
    } as never);
    if (firstArchived.scope !== 'admin_course_list') throw new Error('unexpected scope');
    expect(firstArchived.items.map((item) => item.courseId)).toEqual([archivedA, archivedB]);
    expect(firstArchived.hasMore).toBe(true);
    const secondArchived = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        readModelVersion: 2,
        lifecycle: 'archived',
        pageSize: 2,
        cursor: firstArchived.nextCursor,
      },
    } as never);
    if (secondArchived.scope !== 'admin_course_list') throw new Error('unexpected scope');
    expect(secondArchived.items.map((item) => item.courseId)).toEqual([archivedC]);
    expect(secondArchived.hasMore).toBe(false);
  });

  it('rejects a cursor from the wrong lifecycle scope', async () => {
    const data = seed();
    addCourse(data, 'course_admin_read_active_cursor', 'Cursor Course', 'active');
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));
    const active = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        readModelVersion: 2,
        lifecycle: 'active',
        pageSize: 1,
      },
    } as never);
    if (active.scope !== 'admin_course_list') throw new Error('unexpected scope');
    await expect(
      handler({
        auth: { uid: adminId },
        data: {
          scope: 'admin_course_list',
          readModelVersion: 2,
          lifecycle: 'archived',
          pageSize: 1,
          cursor: active.nextCursor,
        },
      } as never)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('keeps v1 compatibility for canonical Course documents without lifecycle', async () => {
    const data = seed();
    const legacyCanonicalCourse = data[`courses/${courseId}`] as Record<string, unknown>;
    delete legacyCanonicalCourse.lifecycle;

    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));
    const result = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_list', pageSize: 50 },
    } as never);

    expect(result.scope).toBe('admin_course_list');
    if (result.scope === 'admin_course_list') {
      expect(result.items.map((item) => item.courseId)).toEqual([courseId]);
      expect(result.items[0]?.lifecycle).toBe('active');
      expect(result).not.toHaveProperty('hasMore');
      expect(result).not.toHaveProperty('nextCursor');
    }
  });

  it('denies non-admin callers', async () => {
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(seed()));
    await expect(
      handler({ auth: { uid: userId }, data: { scope: 'admin_course_list' } } as never)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('keeps list readable when instructor presentation exceeds read-model bounds', async () => {
    const data = seed();
    data[`instructors/${instructorId}`] = {
      id: instructorId,
      name: 'X'.repeat(201),
      pricePerHourKZT: 12_000,
      isAvailable: true,
    };
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));
    const list = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        pageSize: 50,
        idempotencyKey: 'read:admin_course:admin_course_list:list',
      },
    } as never);
    expect(list.scope).toBe('admin_course_list');
    if (list.scope === 'admin_course_list') {
      expect(list.items).toHaveLength(1);
      expect(list.items[0]?.instructors).toEqual([]);
      expect(list.items[0]?.instructorRosterIds).toEqual([instructorId]);
    }
  });

  it('emits scheduleSummary from CourseDays even when catalog content dates are stale', async () => {
    const data = seed();
    // Stale presentation date (clone source) must not suppress operational scheduleSummary.
    data[`course_catalog_content/${courseId}`] = {
      courseId,
      duration: 'One day',
      description: 'Presentation content',
      dates: '1 March 2026',
      bgImageUrl: 'https://example.com/course.webp',
    };
    const day = data[`courses/${courseId}/days/${dayId}`] as Record<string, unknown>;
    const startsAt = timestampFromDate(new Date('2026-09-20T05:00:00.000Z'));
    const endsAt = timestampFromDate(new Date('2026-09-20T07:00:00.000Z'));
    day.interval = { startsAt, endsAt };
    const course = data[`courses/${courseId}`] as Record<string, unknown>;
    course.startAt = startsAt;
    (course.scheduleProjection as Record<string, unknown>).finalCourseDayEndsAt = endsAt;

    const reads: string[] = [];
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data, reads));
    const list = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_list', readModelVersion: 2 },
    } as never);
    expect(list.scope).toBe('admin_course_list');
    if (list.scope === 'admin_course_list') {
      expect(list.items[0]?.catalogContent.content?.dates).toBe('1 March 2026');
      expect(list.items[0]?.scheduleSummary).toMatchObject({
        courseDayCount: 1,
        timeZone: 'Asia/Almaty',
        startsAt,
        lastDayStartsAt: startsAt,
      });
      expect(list.items[0]).not.toHaveProperty('courseDays');
    }
    expect(reads.filter((path) => path === `courses/${courseId}/days:query`)).toHaveLength(2);
  });

  it('uses first/last CourseDay for scheduleSummary when catalog content is missing', async () => {
    const data = seed();
    delete data[`course_catalog_content/${courseId}`];
    const reads: string[] = [];
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data, reads));
    const list = await handler({
      auth: { uid: adminId },
      data: { scope: 'admin_course_list', readModelVersion: 2 },
    } as never);
    expect(list.scope).toBe('admin_course_list');
    if (list.scope === 'admin_course_list') {
      expect(list.items[0]?.scheduleSummary).toMatchObject({
        courseDayCount: 1,
        timeZone: 'Asia/Almaty',
      });
    }
    expect(reads.filter((path) => path === `courses/${courseId}/days:query`)).toHaveLength(2);
  });

  it('accepts legacy catalog content without embedded courseId using document identity', async () => {
    const data = seed();
    data[`course_catalog_content/${courseId}`] = {
      duration: 'One day',
      description: 'Presentation content',
      dates: '1 December',
      bgImageUrl: 'https://example.com/course.webp',
    };
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(data));
    const list = await handler({
      auth: { uid: adminId },
      data: {
        scope: 'admin_course_list',
        idempotencyKey: 'read:admin_course:admin_course_list:list',
      },
    } as never);
    if (list.scope === 'admin_course_list') {
      expect(list.items[0]?.catalogContent).toMatchObject({
        status: 'present',
        content: { courseId, description: 'Presentation content' },
      });
    }
  });
});
