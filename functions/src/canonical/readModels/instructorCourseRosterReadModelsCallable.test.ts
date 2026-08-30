import { describe, expect, it } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryCourseAttendanceReadModelsHandler } from './queryCourseAttendanceReadModelsCallable';
import { createQueryCourseEnrollmentReadModelsHandler } from './queryCourseEnrollmentReadModelsCallable';

const rosterInstructorAccountId = AccountIdSchema.parse('account_roster_read_roster_instructor');
const courseDayInstructorAccountId = AccountIdSchema.parse('account_roster_read_day_instructor');
const strangerAccountId = AccountIdSchema.parse('account_roster_read_stranger');
const rosterInstructorId = InstructorIdSchema.parse('instructor_roster_read_roster');
const courseDayInstructorId = InstructorIdSchema.parse('instructor_roster_read_day_only');
const strangerInstructorId = InstructorIdSchema.parse('instructor_roster_read_stranger');
const courseId = CourseIdSchema.parse('course_roster_read_fixture');
const courseDayId = CourseDayIdSchema.parse('course_day_roster_read_fixture');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_roster_read_fixture');
const participantId = ParticipantIdSchema.parse('participant_roster_read_fixture');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

type InstructorFixture = {
  readonly accountId: typeof rosterInstructorAccountId;
  readonly instructorId: typeof rosterInstructorId;
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
      correlationId: 'correlation_roster_read_fixture',
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
              exists: id === courseId,
              data: () =>
                id === courseId
                  ? {
                      courseId,
                      title: 'Roster Read Fixture',
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
                        correlationId: 'correlation_roster_read_fixture',
                      },
                    }
                  : undefined,
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
      if (name === 'course_enrollments') {
        return {
          where: () => ({
            limit: () => ({
              get: async () => ({
                docs: [
                  {
                    data: () => ({
                      enrollmentId,
                      participantId,
                      courseId,
                      originalCourseId: courseId,
                      attribution: {
                        bookingOrigin: 'admin',
                        bookedBy: { kind: 'account', accountId: rosterInstructorAccountId },
                      },
                      lifecycle: { status: 'confirmed' },
                      revision: 1,
                      createdAt: decidedAt,
                      updatedAt: decidedAt,
                      audit: {
                        createdByCommandId: 'seed',
                        lastChangedByCommandId: 'seed',
                        correlationId: 'correlation_roster_read_fixture',
                      },
                    }),
                  },
                ],
              }),
            }),
          }),
        };
      }
      if (name === 'participants') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({
                participantId,
                displayName: 'Roster Participant',
              }),
            }),
          }),
        };
      }
      if (name === 'attendance') {
        return {
          doc: () => ({
            get: async () => ({ exists: false, data: () => undefined }),
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

const rosterPayload = {
  scope: 'instructor_roster' as const,
  courseId,
};

describe('instructor roster read model callables', () => {
  it('allows roster instructor to query enrollment roster', async () => {
    const handler = createQueryCourseEnrollmentReadModelsHandler(
      createFirestore({ accountId: rosterInstructorAccountId, instructorId: rosterInstructorId })
    );

    await expect(
      handler({
        data: rosterPayload,
        auth: { uid: rosterInstructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toMatchObject({
      scope: 'instructor_roster',
    });
  });

  it('allows course-day-only instructor to query enrollment roster', async () => {
    const handler = createQueryCourseEnrollmentReadModelsHandler(
      createFirestore({
        accountId: courseDayInstructorAccountId,
        instructorId: courseDayInstructorId,
      })
    );

    await expect(
      handler({
        data: rosterPayload,
        auth: { uid: courseDayInstructorAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toMatchObject({
      scope: 'instructor_roster',
    });
  });

  it('denies stranger instructor on enrollment roster callable', async () => {
    const handler = createQueryCourseEnrollmentReadModelsHandler(
      createFirestore({ accountId: strangerAccountId, instructorId: strangerInstructorId })
    );

    await expect(
      handler({
        data: rosterPayload,
        auth: { uid: strangerAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies stranger instructor on attendance roster callable', async () => {
    const handler = createQueryCourseAttendanceReadModelsHandler(
      createFirestore({ accountId: strangerAccountId, instructorId: strangerInstructorId })
    );

    await expect(
      handler({
        data: rosterPayload,
        auth: { uid: strangerAccountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
