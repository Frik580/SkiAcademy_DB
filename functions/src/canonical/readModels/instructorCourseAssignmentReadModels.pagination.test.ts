import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX,
  encodeInstructorCourseAssignmentReadModelCursor,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryInstructorCourseAssignmentReadModels } from './instructorCourseAssignmentReadModels';
import {
  isTestScopeCollection,
  missingTestScopeCollection,
} from '../testSessions/missingTestScopeCollection';

const instructorId = InstructorIdSchema.parse('instructor_pagination_roster');
const otherInstructorId = InstructorIdSchema.parse('instructor_pagination_other');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

function padCourseIndex(index: number): string {
  return String(index).padStart(3, '0');
}

function buildRosterCourse(index: number, lifecycle: 'active' | 'archived' = 'active') {
  const courseId = CourseIdSchema.parse(`course_pagination_${padCourseIndex(index)}`);
  const courseDayId = CourseDayIdSchema.parse(`course_day_pagination_${padCourseIndex(index)}`);
  return {
    courseId,
    courseDayId,
    course: {
      courseId,
      title: `Course ${padCourseIndex(index)}`,
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
        correlationId: 'correlation_pagination',
      },
    },
    courseDay: {
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
        correlationId: 'correlation_pagination',
      },
    },
  };
}

function createRosterPaginationFirestore(courseCount: number): Firestore {
  const records = Array.from({ length: courseCount }, (_, index) => buildRosterCourse(index + 1));
  const byCourseId = new Map(records.map((record) => [record.courseId, record]));
  const sortedDocs = [...records]
    .sort((left, right) => left.course.title.localeCompare(right.course.title))
    .map((record) => ({
      id: record.courseId,
      data: () => record.course,
      get: (field: string) => (field === 'title' ? record.course.title : undefined),
    }));

  const resolveStartIndex = (title?: string, documentId?: string): number => {
    if (!title || !documentId) {
      return 0;
    }
    const index = sortedDocs.findIndex(
      (document) => document.id === documentId && document.get('title') === title
    );
    return index < 0 ? sortedDocs.length : index + 1;
  };

  return {
    collection: (name: string) => {
      if (name === 'courses') {
        return {
          doc: (id: string) => ({
            get: async () => {
              const record = byCourseId.get(id as never);
              return record
                ? { exists: true, data: () => record.course }
                : { exists: false, data: () => undefined };
            },
          }),
          where: () => {
            let startIndex = 0;
            const chain = {
              where: () => chain,
              orderBy: () => chain,
              startAfter: (title: string, documentId: string) => {
                startIndex = resolveStartIndex(title, documentId);
                return chain;
              },
              limit: (size: number) => ({
                get: async () => {
                  const docs = sortedDocs.slice(startIndex, startIndex + size);
                  startIndex += docs.length;
                  return { docs };
                },
              }),
            };
            return chain;
          },
        };
      }
      const daysPathMatch = /^courses\/(.+)\/days$/.exec(name);
      if (daysPathMatch) {
        const record = byCourseId.get(daysPathMatch[1] as never);
        return {
          get: async () => ({
            docs: record ? [{ data: () => record.courseDay }] : [],
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
          limit: () => ({
            startAfter: () => chain.limit(0),
            get: async () => ({ docs: [] }),
          }),
        };
        return chain;
      },
    }),
  } as unknown as Firestore;
}

describe('queryInstructorCourseAssignmentReadModels pagination', () => {
  it('returns hasMore and reaches assignments beyond the legacy 50-course ceiling', async () => {
    const firestore = createRosterPaginationFirestore(55);
    const first = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20 },
      { instructorId }
    );
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeDefined();

    const second = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20, cursor: first.nextCursor },
      { instructorId }
    );
    expect(second.items).toHaveLength(20);
    expect(second.hasMore).toBe(true);

    const third = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20, cursor: second.nextCursor },
      { instructorId }
    );
    expect(third.items).toHaveLength(15);
    expect(third.hasMore).toBe(false);

    const allIds = [...first.items, ...second.items, ...third.items].map((item) => item.courseId);
    expect(new Set(allIds).size).toBe(55);
    expect(allIds).toContain(CourseIdSchema.parse('course_pagination_055'));
  });

  it('rejects cursor for another instructor', async () => {
    const firestore = createRosterPaginationFirestore(3);
    const first = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 1 },
      { instructorId }
    );
    const decoded = encodeInstructorCourseAssignmentReadModelCursor({
      instructorId: otherInstructorId,
      readScope: { dataScope: 'live' },
      roster: { exhausted: false },
      days: { exhausted: false },
      lastEmitted: {
        title: first.items[0]?.title ?? 'Course',
        courseId: first.items[0]?.courseId ?? CourseIdSchema.parse('course_pagination_001'),
      },
    });
    await expect(
      queryInstructorCourseAssignmentReadModels(
        firestore,
        { scope: 'instructor_assigned', pageSize: 1, cursor: decoded },
        { instructorId }
      )
    ).rejects.toThrow('invalid_cursor');
  });

  it('excludes archived roster courses without shrinking pagination capacity', async () => {
    const active = buildRosterCourse(1, 'active');
    const archived = buildRosterCourse(2, 'archived');
    const firestore = createRosterPaginationFirestore(0);
    const records = [active, archived];
    const byCourseId = new Map(records.map((record) => [record.courseId, record]));
    (firestore as { collection: Firestore['collection'] }).collection = (name: string) => {
      if (name === 'courses') {
        const rosterDocs = records
          .filter((record) => record.course.lifecycle === 'active')
          .map((record) => ({
            id: record.courseId,
            data: () => record.course,
            get: (field: string) => (field === 'title' ? record.course.title : undefined),
          }));
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: byCourseId.has(id as never),
              data: () => byCourseId.get(id as never)?.course,
            }),
          }),
          where: () => {
            let rosterIndex = 0;
            const chain = {
              where: () => chain,
              orderBy: () => chain,
              startAfter: (title: string, documentId: string) => {
                const index = rosterDocs.findIndex(
                  (document) => document.id === documentId && document.get('title') === title
                );
                rosterIndex = index < 0 ? rosterDocs.length : index + 1;
                return chain;
              },
              limit: () => ({
                get: async () => ({
                  docs: rosterDocs.slice(rosterIndex, rosterIndex + 1),
                }),
              }),
            };
            return chain;
          },
        };
      }
      if (name === `courses/${active.courseId}/days`) {
        return { get: async () => ({ docs: [{ data: () => active.courseDay }] }) };
      }
      if (name === `courses/${archived.courseId}/days`) {
        return { get: async () => ({ docs: [{ data: () => archived.courseDay }] }) };
      }
      if (isTestScopeCollection(name)) return missingTestScopeCollection();
      throw new Error(`Unexpected collection: ${name}`);
    };

    const result = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX },
      { instructorId }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.courseId).toBe(active.courseId);
    expect(result.hasMore).toBe(false);
  });
});
