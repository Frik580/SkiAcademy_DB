import { describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  CanonicalCommandError,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  TestSessionIdSchema,
  commandErrorResult,
  commandSuccessResult,
  timestampFromDate,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION,
  pendingCourseEnrollmentOutcomeWork,
} from './courseEnrollmentOutcomeWork';
import { sweepCourseEnrollmentOutcomes } from './courseEnrollmentOutcomeSweep';

const testSessionId = TestSessionIdSchema.parse('test_session_course_sweep_01');

function testSessionData(status: 'active' | 'resetting' | 'deleting') {
  const at = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
  const commandId = CommandIdSchema.parse('command_course_sweep_session_01');
  return {
    testSessionId,
    schemaVersion: 1,
    status,
    label: 'Course outcome sweep test',
    createdByAccountId: AccountIdSchema.parse('account_course_sweep_session_01'),
    config: { startingBalanceKzt: 0, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: commandId,
      lastChangedByCommandId: commandId,
      correlationId: 'correlation_course_sweep_session_01',
    },
  };
}

function fakeWorkFirestore(seed: Map<string, Record<string, unknown>>): Firestore {
  const document = (path: string, id: string) => ({
    id,
    path: `${path}/${id}`,
    get: async () => {
      const data = seed.get(`${path}/${id}`);
      return { exists: data !== undefined, id, data: () => data };
    },
  });
  const collection = (path: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let requestedLimit = Number.POSITIVE_INFINITY;
    const query = {
      doc: (id: string) => document(path, id),
      where: (field: string, op: string, value: unknown) => {
        filters.push([field, op, value]);
        return query;
      },
      orderBy: () => query,
      limit: (value: number) => {
        requestedLimit = value;
        return query;
      },
      get: async () => {
        const docs = [...seed.entries()]
          .filter(([key]) => key.startsWith(`${path}/`))
          .map(([key, data]) => ({
            id: key.slice(path.length + 1),
            exists: true,
            data: () => data,
          }))
          .filter((snapshot) =>
            filters.every(([field, op, value]) => {
              const parts = field.split('.');
              let actual: unknown = snapshot.data();
              for (const part of parts) actual = (actual as Record<string, unknown>)[part];
              return op === '==' ? actual === value : Number(actual) <= Number(value);
            })
          )
          .sort((left, right) => {
            const leftData = left.data() as { dueAt: { seconds: number }; enrollmentId: string };
            const rightData = right.data() as { dueAt: { seconds: number }; enrollmentId: string };
            return (
              leftData.dueAt.seconds - rightData.dueAt.seconds ||
              leftData.enrollmentId.localeCompare(rightData.enrollmentId)
            );
          })
          .slice(0, requestedLimit);
        return { docs, size: docs.length };
      },
    };
    return query;
  };
  return {
    collection,
    runTransaction: async (
      callback: (transaction: {
        get: (ref: { path: string; id: string }) => Promise<unknown>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) =>
      callback({
        get: async (ref) => {
          const data = seed.get(ref.path);
          return { exists: data !== undefined, id: ref.id, data: () => data };
        },
        set: (ref, data) => {
          seed.set(ref.path, data);
        },
      }),
  } as unknown as Firestore;
}

function workData(index: number, dueAt: Date): Record<string, unknown> {
  const { course, courseDays, confirmedEnrollment } = canonicalCourseDeliveryFixtures;
  const enrollment = CourseEnrollmentSchema.parse({
    ...confirmedEnrollment,
    enrollmentId: CourseEnrollmentIdSchema.parse(`course_enrollment_sweep_${index}`),
  });
  return pendingCourseEnrollmentOutcomeWork({
    enrollment,
    course,
    finalCourseDay: courseDays[1],
    workRevision: 1,
    updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
  }).dueAt.seconds === timestampFromDate(dueAt).seconds
    ? (pendingCourseEnrollmentOutcomeWork({
        enrollment,
        course,
        finalCourseDay: courseDays[1],
        workRevision: 1,
        updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
      }) as Record<string, unknown>)
    : {
        ...pendingCourseEnrollmentOutcomeWork({
          enrollment,
          course,
          finalCourseDay: courseDays[1],
          workRevision: 1,
          updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        }),
        dueAt: timestampFromDate(dueAt),
      };
}

describe('T32.9A.9C.B bounded CourseEnrollment outcome sweep', () => {
  it('processes active TEST-session work with the matching authoritative scope', async () => {
    const data = {
      ...workData(4, new Date('2026-02-01T00:00:00.000Z')),
      dataScope: 'test',
      testSessionId,
    };
    const enrollmentId = String(data.enrollmentId);
    const seed = new Map<string, Record<string, unknown>>([
      [`${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollmentId}`, data],
      [`test_sessions/${testSessionId}`, testSessionData('active')],
    ]);
    const execute = vi.fn(async (envelope): Promise<CommandResult<'resolve_attendance_outcome'>> =>
      commandSuccessResult('resolve_attendance_outcome', envelope.context.correlationId)
    );

    const result = await sweepCourseEnrollmentOutcomes(fakeWorkFirestore(seed), {
      now: new Date('2026-02-02T00:00:00.000Z'),
      execute,
    });

    expect(result.processed).toBe(1);
    expect(execute).toHaveBeenCalledWith(expect.anything(), { dataScope: 'test', testSessionId });
  });

  it.each(['resetting', 'deleting'] as const)(
    'skips TEST work while the session is %s',
    async (status) => {
      const data = {
        ...workData(5, new Date('2026-02-01T00:00:00.000Z')),
        dataScope: 'test',
        testSessionId,
      };
      const enrollmentId = String(data.enrollmentId);
      const key = `${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollmentId}`;
      const seed = new Map<string, Record<string, unknown>>([
        [key, data],
        [`test_sessions/${testSessionId}`, testSessionData(status)],
      ]);
      const execute = vi.fn();

      const result = await sweepCourseEnrollmentOutcomes(fakeWorkFirestore(seed), {
        now: new Date('2026-02-02T00:00:00.000Z'),
        execute,
      });

      expect(result.inactiveSessionSkipped).toBe(1);
      expect(execute).not.toHaveBeenCalled();
      expect(seed.get(key)).toMatchObject({ status: 'pending', dataScope: 'test', testSessionId });
    }
  );

  it('does not process work before dueAt', async () => {
    const data = workData(1, new Date('2026-03-01T00:00:00.000Z'));
    const enrollmentId = String(data.enrollmentId);
    const seed = new Map([[`${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollmentId}`, data]]);
    const execute = vi.fn();
    const result = await sweepCourseEnrollmentOutcomes(fakeWorkFirestore(seed), {
      now: new Date('2026-02-01T00:00:00.000Z'),
      execute,
    });
    expect(result.candidateDocsRead).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('processes due work once and closes it so a repeated run is a no-op', async () => {
    const data = workData(2, new Date('2026-02-01T00:00:00.000Z'));
    const enrollmentId = String(data.enrollmentId);
    const key = `${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollmentId}`;
    const seed = new Map([[key, data]]);
    const execute = vi.fn(async (envelope): Promise<CommandResult<'resolve_attendance_outcome'>> =>
      commandSuccessResult('resolve_attendance_outcome', envelope.context.correlationId)
    );
    const firestore = fakeWorkFirestore(seed);
    const first = await sweepCourseEnrollmentOutcomes(firestore, {
      now: new Date('2026-02-02T00:00:00.000Z'),
      execute,
    });
    const second = await sweepCourseEnrollmentOutcomes(firestore, {
      now: new Date('2026-02-02T00:05:00.000Z'),
      execute,
    });
    expect(first.processed).toBe(1);
    expect(second.candidateDocsRead).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(seed.get(key)).toMatchObject({
      status: 'complete',
      completedReason: 'deadline_processed',
    });
  });

  it('reads and processes at most the configured 25-candidate page', async () => {
    const seed = new Map<string, Record<string, unknown>>();
    for (let index = 0; index < 30; index += 1) {
      const data = workData(index + 10, new Date('2026-02-01T00:00:00.000Z'));
      seed.set(`${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${String(data.enrollmentId)}`, data);
    }
    const execute = vi.fn(async (envelope): Promise<CommandResult<'resolve_attendance_outcome'>> =>
      commandSuccessResult('resolve_attendance_outcome', envelope.context.correlationId)
    );
    const result = await sweepCourseEnrollmentOutcomes(fakeWorkFirestore(seed), {
      now: new Date('2026-02-02T00:00:00.000Z'),
      execute,
    });
    expect(result.candidateDocsRead).toBe(26);
    expect(result.processed).toBe(25);
    expect(result.truncated).toBe(true);
  });

  it('closes due work without a second transition when Attendance already completed the Enrollment', async () => {
    const data = workData(3, new Date('2026-02-01T00:00:00.000Z'));
    const enrollmentId = String(data.enrollmentId);
    const key = `${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollmentId}`;
    const seed = new Map([[key, data]]);
    const correlationId = CorrelationIdSchema.parse(
      'correlation_course_enrollment_outcome_race_01'
    );
    const execute = vi.fn(async (): Promise<CommandResult<'resolve_attendance_outcome'>> =>
      commandErrorResult(
        'resolve_attendance_outcome',
        correlationId,
        new CanonicalCommandError('invalid_transition', {
          correlationId,
          details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
        }).toTransport()
      )
    );
    const firestore = fakeWorkFirestore(seed);
    const first = await sweepCourseEnrollmentOutcomes(firestore, {
      now: new Date('2026-02-02T00:00:00.000Z'),
      execute,
    });
    const second = await sweepCourseEnrollmentOutcomes(firestore, {
      now: new Date('2026-02-02T00:05:00.000Z'),
      execute,
    });
    expect(first.lifecycleIneligible).toBe(1);
    expect(first.processed).toBe(0);
    expect(second.candidateDocsRead).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(seed.get(key)).toMatchObject({
      status: 'complete',
      completedReason: 'lifecycle_ineligible',
    });
  });
});
