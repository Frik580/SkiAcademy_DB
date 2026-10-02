import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryInstructorCourseAssignmentReadModels } from './instructorCourseAssignmentReadModels';
import {
  isTestScopeCollection,
  missingTestScopeCollection,
} from '../testSessions/missingTestScopeCollection';

const instructorId = InstructorIdSchema.parse('instructor_assignment_mixed');
const activeCourseId = CourseIdSchema.parse('course_assignment_mixed_active');
const archivedCourseId = CourseIdSchema.parse('course_assignment_mixed_archived');
const activeCourseDayId = CourseDayIdSchema.parse('course_day_assignment_mixed_active');
const archivedCourseDayId = CourseDayIdSchema.parse('course_day_assignment_mixed_archived');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

function buildCourse(
  courseId: typeof activeCourseId | typeof archivedCourseId,
  lifecycle: 'active' | 'archived',
  title: string
) {
  return {
    courseId,
    title,
    lifecycle,
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [instructorId],
    startAt: dayStart,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: dayEnd,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_assignment_mixed',
    },
  };
}

function buildCourseDay(
  courseId: typeof activeCourseId | typeof archivedCourseId,
  courseDayId: typeof activeCourseDayId | typeof archivedCourseDayId
) {
  return {
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt: dayStart, endsAt: dayEnd },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_assignment_mixed',
    },
  };
}

function createMixedFirestore(): Firestore {
  const activeCourse = buildCourse(activeCourseId, 'active', 'Active Mixed Course');
  const archivedCourse = buildCourse(archivedCourseId, 'archived', 'Archived Mixed Course');
  const activeCourseDay = buildCourseDay(activeCourseId, activeCourseDayId);
  const archivedCourseDay = buildCourseDay(archivedCourseId, archivedCourseDayId);

  return {
    doc: (path: string) => ({ path }),
    collection: (name: string) => {
      if (name === 'courses') {
        const rosterDocs = [{ id: activeCourseId, data: () => activeCourse }];
        const createQuery = () => {
          let rosterIndex = 0;
          const chain = {
            where: () => chain,
            orderBy: () => chain,
            startAfter: (title: string, documentId: string) => {
              const index = rosterDocs.findIndex(
                (entry) => entry.id === documentId && entry.data().title === title
              );
              rosterIndex = index < 0 ? rosterDocs.length : index + 1;
              return chain;
            },
            limit: () => ({
              get: async () => ({
                docs: rosterDocs.slice(rosterIndex, rosterIndex + 1).map((entry) => ({
                  id: entry.id,
                  data: entry.data,
                  get: (field: string) =>
                    field === 'title' ? entry.data().title : undefined,
                })),
              }),
            }),
          };
          return chain;
        };
        return {
          doc: (id: string) => ({
            get: async () => {
              if (id === activeCourseId) {
                return { exists: true, data: () => activeCourse };
              }
              if (id === archivedCourseId) {
                return { exists: true, data: () => archivedCourse };
              }
              return { exists: false, data: () => undefined };
            },
          }),
          where: () => createQuery(),
        };
      }
      if (name === `courses/${activeCourseId}/days`) {
        return {
          get: async () => ({
            docs: [{ data: () => activeCourseDay }],
          }),
        };
      }
      if (name === `courses/${archivedCourseId}/days`) {
        return {
          get: async () => ({
            docs: [{ data: () => archivedCourseDay }],
          }),
        };
      }
      if (isTestScopeCollection(name)) return missingTestScopeCollection();
      throw new Error(`Unexpected collection: ${name}`);
    },
    collectionGroup: () => ({
      where: () => {
        const chain = {
          orderBy: () => chain,
          startAfter: () => chain,
          limit: () => ({
            get: async () => ({ docs: [] }),
          }),
        };
        return chain;
      },
    }),
  } as unknown as Firestore;
}

describe('queryInstructorCourseAssignmentReadModels lifecycle filtering', () => {
  it('returns only active courses when roster discovery includes archived courses', async () => {
    const result = await queryInstructorCourseAssignmentReadModels(
      createMixedFirestore(),
      { scope: 'instructor_assigned' },
      { instructorId }
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        courseId: activeCourseId,
        title: 'Active Mixed Course',
      }),
    ]);
    expect(result.items.some((item) => item.courseId === archivedCourseId)).toBe(false);
    expect(result.hasMore).toBe(false);
  });
});

describe('queryInstructorCourseAssignmentReadModels day scope', () => {
  const stagingAdminId = InstructorIdSchema.parse('instructor_staging_admin');
  const arseniiId = InstructorIdSchema.parse('instructor_arsenii');
  const instructorCId = InstructorIdSchema.parse('instructor_unassigned_c');
  const rosterOnlyId = InstructorIdSchema.parse('instructor_roster_only');
  const carvingCourseId = CourseIdSchema.parse('course_carving_essentials');
  const archivedCarvingCourseId = CourseIdSchema.parse('course_carving_archived');
  const dayOneId = CourseDayIdSchema.parse('course_day_carving_01');
  const dayTwoId = CourseDayIdSchema.parse('course_day_carving_02');
  const dayThreeId = CourseDayIdSchema.parse('course_day_carving_03');
  const archivedDayId = CourseDayIdSchema.parse('course_day_carving_archived');
  const dayOneStart = timestampFromDate(new Date('2027-01-01T06:00:00.000Z'));
  const dayOneEnd = timestampFromDate(new Date('2027-01-01T11:00:00.000Z'));
  const dayTwoStart = timestampFromDate(new Date('2027-01-02T04:00:00.000Z'));
  const dayTwoEnd = timestampFromDate(new Date('2027-01-02T10:00:00.000Z'));
  const dayThreeStart = timestampFromDate(new Date('2027-01-03T04:00:00.000Z'));
  const dayThreeEnd = timestampFromDate(new Date('2027-01-03T10:00:00.000Z'));

  function courseDocument(
    courseId: typeof carvingCourseId,
    lifecycle: 'active' | 'archived',
    title: string
  ) {
    return {
      courseId,
      title,
      lifecycle,
      price: 50_000,
      capacity: { totalSeats: 8, availableSeats: 8 },
      instructorRosterIds: [stagingAdminId, arseniiId, rosterOnlyId],
      startAt: dayOneStart,
      scheduleProjection: {
        courseDayCount: 3,
        finalCourseDayEndsAt: dayThreeEnd,
        courseScheduleRevision: 1,
      },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId: 'correlation_carving_assignment',
      },
    };
  }

  function dayDocument(
    courseId: typeof carvingCourseId,
    courseDayId: typeof dayOneId,
    dayOrder: number,
    instructorId: typeof stagingAdminId,
    startsAt: typeof dayOneStart,
    endsAt: typeof dayOneEnd
  ) {
    return {
      courseId,
      courseDayId,
      dayOrder,
      interval: { startsAt, endsAt },
      timeZone: 'Asia/Almaty',
      actualInstructorIds: [instructorId],
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId: 'correlation_carving_assignment',
      },
    };
  }

  function createCarvingFirestore(): Firestore {
    const courses = [
      courseDocument(carvingCourseId, 'active', 'Carving Essentials'),
      courseDocument(archivedCarvingCourseId, 'archived', 'Archived Carving'),
    ];
    const days = {
      [carvingCourseId]: [
        dayDocument(carvingCourseId, dayThreeId, 3, arseniiId, dayThreeStart, dayThreeEnd),
        dayDocument(carvingCourseId, dayOneId, 1, stagingAdminId, dayOneStart, dayOneEnd),
        dayDocument(carvingCourseId, dayTwoId, 2, stagingAdminId, dayTwoStart, dayTwoEnd),
      ],
      [archivedCarvingCourseId]: [
        dayDocument(
          archivedCarvingCourseId,
          archivedDayId,
          1,
          stagingAdminId,
          dayOneStart,
          dayOneEnd
        ),
      ],
    };

    return {
      doc: (path: string) => ({ path }),
      collection: (name: string) => {
        if (name === 'courses') {
          const filters: Array<{ field: string; value: unknown }> = [];
          let startAfterId: string | undefined;
          const chain = {
            where: (field: string, _op: string, value: unknown) => {
              filters.push({ field, value });
              return chain;
            },
            orderBy: () => chain,
            startAfter: (_title: string, documentId: string) => {
              startAfterId = documentId;
              return chain;
            },
            limit: () => ({
              get: async () => {
                const matched = courses.filter((course) =>
                  filters.every((filter) => {
                    if (filter.field === 'instructorRosterIds') {
                      return course.instructorRosterIds.includes(filter.value as never);
                    }
                    if (filter.field === 'lifecycle') {
                      return course.lifecycle === filter.value;
                    }
                    return true;
                  })
                );
                const startIndex = startAfterId
                  ? matched.findIndex((course) => course.courseId === startAfterId) + 1
                  : 0;
                return {
                  docs: matched.slice(startIndex, startIndex + 1).map((course) => ({
                    id: course.courseId,
                    data: () => course,
                    get: (field: string) => (field === 'title' ? course.title : undefined),
                  })),
                };
              },
            }),
          };
          return {
            doc: (id: string) => ({
              get: async () => {
                const course = courses.find((item) => item.courseId === id);
                return { exists: Boolean(course), data: () => course };
              },
            }),
            where: (field: string, op: string, value: unknown) => chain.where(field, op, value),
          };
        }
        const courseDays = days[name.replace(/^courses\/(.+)\/days$/, '$1') as keyof typeof days];
        if (name.startsWith('courses/') && name.endsWith('/days') && courseDays) {
          return { get: async () => ({ docs: courseDays.map((day) => ({ data: () => day })) }) };
        }
        if (isTestScopeCollection(name)) return missingTestScopeCollection();
        throw new Error(`Unexpected collection: ${name}`);
      },
      collectionGroup: () => ({
        where: () => {
          const groupChain = {
            orderBy: () => groupChain,
            startAfter: () => groupChain,
            limit: () => ({ get: async () => ({ docs: [] }) }),
          };
          return groupChain;
        },
      }),
    } as unknown as Firestore;
  }

  async function assignedDays(instructorId: typeof stagingAdminId) {
    const result = await queryInstructorCourseAssignmentReadModels(
      createCarvingFirestore(),
      { scope: 'instructor_assigned' },
      { instructorId }
    );
    return result.items.map((item) => ({
      courseId: item.courseId,
      assignedCourseDayIds: item.assignedCourseDayIds,
      scheduleDayIds: item.courseSchedule.courseDays.map((day) => day.courseDayId),
    }));
  }

  it('returns only the CourseDays assigned to each instructor', async () => {
    await expect(assignedDays(stagingAdminId)).resolves.toEqual([
      {
        courseId: carvingCourseId,
        assignedCourseDayIds: [dayOneId, dayTwoId],
        scheduleDayIds: [dayOneId, dayTwoId, dayThreeId],
      },
    ]);
    await expect(assignedDays(arseniiId)).resolves.toEqual([
      {
        courseId: carvingCourseId,
        assignedCourseDayIds: [dayThreeId],
        scheduleDayIds: [dayOneId, dayTwoId, dayThreeId],
      },
    ]);
    await expect(assignedDays(instructorCId)).resolves.toEqual([]);
    await expect(assignedDays(rosterOnlyId)).resolves.toEqual([
      {
        courseId: carvingCourseId,
        assignedCourseDayIds: [],
        scheduleDayIds: [dayOneId, dayTwoId, dayThreeId],
      },
    ]);
  });
});
