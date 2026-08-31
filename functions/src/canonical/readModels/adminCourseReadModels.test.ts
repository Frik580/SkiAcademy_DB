import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryAdminCourseReadModelsHandler } from './queryAdminCourseReadModelsCallable';

const adminId = AccountIdSchema.parse('account_admin_course_read_01');
const userId = AccountIdSchema.parse('account_user_course_read_01');
const courseId = CourseIdSchema.parse('course_admin_read_01');
const dayId = CourseDayIdSchema.parse('course_day_admin_read_01');
const instructorId = InstructorIdSchema.parse('instructor_admin_read_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_course_read_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function nestedValue(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((current, key) =>
    current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined,
  data);
}

function fakeFirestore(seed: Record<string, Record<string, unknown>>): Firestore {
  const snapshot = (entries: Array<[string, Record<string, unknown>]>) => ({
    empty: entries.length === 0,
    docs: entries.map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data })),
  });
  const collection = (path: string) => {
    const entries = () => Object.entries(seed).filter(([key]) => {
      if (!key.startsWith(`${path}/`)) return false;
      return key.slice(path.length + 1).split('/').length === 1;
    });
    return {
      doc: (id: string) => ({
        get: async () => {
          const data = seed[`${path}/${id}`];
          return { exists: data !== undefined, data: () => data };
        },
      }),
      get: async () => snapshot(entries()),
      limit: (count: number) => ({ get: async () => snapshot(entries().slice(0, count)) }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => snapshot(entries().filter(([, data]) => Object.is(nestedValue(data, field), value))),
      }),
    };
  };
  return {
    collection,
    doc: (path: string) => ({
      get: async () => {
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
      audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId },
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
    audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId },
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
    audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId },
  });
  return {
    [`users/${adminId}`]: account(adminId, 'admin'),
    [`users/${userId}`]: account(userId, 'user'),
    [`courses/${courseId}`]: course as unknown as Record<string, unknown>,
    [`courses/${courseId}/days/${dayId}`]: day as unknown as Record<string, unknown>,
    [`instructors/${instructorId}`]: { id: instructorId, name: 'Safe Coach', pricePerHourKZT: 12_000, isAvailable: true },
    [`course_catalog_content/${courseId}`]: {
      courseId,
      duration: 'One day',
      description: 'Presentation content',
      dates: '1 December',
      bgImageUrl: 'https://example.com/course.webp',
    },
  };
}

describe('Admin Course read-model callable', () => {
  it('returns list and detail projections only after server Admin authorization', async () => {
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(seed()));
    const list = await handler({ auth: { uid: adminId }, data: { scope: 'admin_course_list' } } as never);
    expect(list.scope).toBe('admin_course_list');
    if (list.scope === 'admin_course_list') {
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        courseId,
        revision: 4,
        scheduleRevision: 3,
        capacity: { occupiedConfirmedSeats: 1 },
        catalogContent: { status: 'present' },
      });
    }
    const detail = await handler({ auth: { uid: adminId }, data: { scope: 'admin_course_detail', courseId } } as never);
    expect(detail.scope).toBe('admin_course_detail');
    if (detail.scope === 'admin_course_detail') expect(detail.item?.instructors[0]?.name).toBe('Safe Coach');
  });

  it('denies non-admin callers', async () => {
    const handler = createQueryAdminCourseReadModelsHandler(fakeFirestore(seed()));
    await expect(handler({ auth: { uid: userId }, data: { scope: 'admin_course_list' } } as never)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
