import { describe, expect, it } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryInstructorCourseAssignmentReadModelsHandler } from './queryInstructorCourseAssignmentReadModelsCallable';

const rosterInstructorAccountId = AccountIdSchema.parse('account_assignment_read_roster_instructor');
const courseDayInstructorAccountId = AccountIdSchema.parse('account_assignment_read_day_instructor');
const strangerAccountId = AccountIdSchema.parse('account_assignment_read_stranger');
const rosterInstructorId = InstructorIdSchema.parse('instructor_assignment_read_roster');
const courseDayInstructorId = InstructorIdSchema.parse('instructor_assignment_read_day_only');
const strangerInstructorId = InstructorIdSchema.parse('instructor_assignment_read_stranger');
const courseId = CourseIdSchema.parse('course_assignment_read_fixture');
const legacyCourseId = CourseIdSchema.parse('course_assignment_read_legacy_fixture');
const courseDayId = CourseDayIdSchema.parse('course_day_assignment_read_fixture');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

type InstructorFixture = {
  readonly accountId:
    | typeof rosterInstructorAccountId
    | typeof courseDayInstructorAccountId
    | typeof strangerAccountId;
  readonly instructorId:
    | typeof rosterInstructorId
    | typeof courseDayInstructorId
    | typeof strangerInstructorId;
};

function createFirestore(instructor: InstructorFixture): Firestore {
  const courseDayDoc = {
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt: dayStart, endsAt: dayEnd },
    timeZone: 'Asia/Almaty',
    actualInstructorIds:
      instructor.instructorId === courseDayInstructorId
        ? [courseDayInstructorId]
        : [rosterInstructorId],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_assignment_read_fixture',
    },
  };

  const canonicalCourse = {
    courseId,
    title: 'Assignment Read Fixture',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [rosterInstructorId],
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
      correlationId: 'correlation_assignment_read_fixture',
    },
  };

  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({
                instructorId: instructor.instructorId,
                isInstructor: true,
              }),
            }),
          }),
        };
      }
      if (name === 'courses') {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: id === courseId || id === legacyCourseId,
              data: () => {
                if (id === courseId) {
                  return canonicalCourse;
                }
                if (id === legacyCourseId) {
                  return {
                    id: legacyCourseId,
                    title: 'Legacy Hidden Course',
                    instructorIds: [instructor.instructorId],
                  };
                }
                return undefined;
              },
            }),
          }),
          where: (field: string, operator: string, value: unknown) => ({
            limit: () => ({
              get: async () => ({
                docs:
                  field === 'instructorRosterIds' &&
                  operator === 'array-contains' &&
                  value === rosterInstructorId
                    ? [{ data: () => canonicalCourse }]
                    : [],
              }),
            }),
          }),
        };
      }
      if (name === `courses/${courseId}/days`) {
        return {
          get: async () => ({
            docs: [{ data: () => courseDayDoc }],
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
    collectionGroup: (name: string) => {
      if (name !== 'days') {
        throw new Error(`Unexpected collection group: ${name}`);
      }
      return {
        where: (field: string, operator: string, value: unknown) => ({
          limit: () => ({
            get: async () => ({
              docs:
                field === 'actualInstructorIds' &&
                operator === 'array-contains' &&
                value === courseDayInstructorId
                  ? [{ data: () => courseDayDoc }]
                  : [],
            }),
          }),
        }),
      };
    },
  } as unknown as Firestore;
}

const assignmentPayload = {
  scope: 'instructor_assigned' as const,
};

describe('instructor course assignment read model callables', () => {
  it('discovers course for roster instructor', async () => {
    const handler = createQueryInstructorCourseAssignmentReadModelsHandler(
      createFirestore({ accountId: rosterInstructorAccountId, instructorId: rosterInstructorId })
    );

    await expect(
      handler({
        data: assignmentPayload,
        auth: { uid: rosterInstructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toMatchObject({
      scope: 'instructor_assigned',
      items: [
        expect.objectContaining({
          courseId,
          title: 'Assignment Read Fixture',
          assignedCourseDayIds: [courseDayId],
        }),
      ],
    });
  });

  it('discovers course for course-day-only instructor', async () => {
    const handler = createQueryInstructorCourseAssignmentReadModelsHandler(
      createFirestore({
        accountId: courseDayInstructorAccountId,
        instructorId: courseDayInstructorId,
      })
    );

    await expect(
      handler({
        data: assignmentPayload,
        auth: { uid: courseDayInstructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toMatchObject({
      scope: 'instructor_assigned',
      items: [
        expect.objectContaining({
          courseId,
          assignedCourseDayIds: [courseDayId],
        }),
      ],
    });
  });

  it('returns empty discovery for stranger instructor', async () => {
    const handler = createQueryInstructorCourseAssignmentReadModelsHandler(
      createFirestore({ accountId: strangerAccountId, instructorId: strangerInstructorId })
    );

    await expect(
      handler({
        data: assignmentPayload,
        auth: { uid: strangerAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'instructor_assigned',
      items: [],
    });
  });

  it('does not reintroduce legacy instructorIds-only courses', async () => {
    const firestore = createFirestore({
      accountId: rosterInstructorAccountId,
      instructorId: rosterInstructorId,
    });
    const handler = createQueryInstructorCourseAssignmentReadModelsHandler(firestore);

    const result = await handler({
      data: assignmentPayload,
      auth: { uid: rosterInstructorAccountId },
    } as CallableRequest<Record<string, unknown>>);

    expect(result.items.some((item) => item.courseId === legacyCourseId)).toBe(false);
  });
});
