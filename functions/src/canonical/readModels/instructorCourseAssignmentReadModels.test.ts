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
