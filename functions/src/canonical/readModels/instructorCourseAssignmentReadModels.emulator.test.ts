import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  TestSessionIdSchema,
  testCanonicalReadScope,
  timestampFromDate,
  type CanonicalReadScope,
  type CourseDayId,
  type CourseId,
  type InstructorId,
} from '@ski-academy/shared-domain';
import { queryInstructorCourseAssignmentReadModels } from './instructorCourseAssignmentReadModels';

const PROJECT_ID = 'ski-academy-instructor-assignment-pagination';
const instructorId = InstructorIdSchema.parse('instructor_assignment_pagination');
const otherInstructorId = InstructorIdSchema.parse('instructor_assignment_pagination_other');
const testSessionId = TestSessionIdSchema.parse('test_session_assignment_pagination');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-06-01T05:00:00.000Z'));

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;

let app: App;
let firestore: Firestore;

type ScopeStamp =
  | { readonly dataScope: 'live' }
  | { readonly dataScope: 'test'; readonly testSessionId: typeof testSessionId };

function liveStamp(): ScopeStamp {
  return { dataScope: 'live' };
}

function startsAt(seconds: number, nanoseconds = 0) {
  return { seconds, nanoseconds };
}

function courseRecord(input: {
  readonly courseId: CourseId;
  readonly title: string;
  readonly rosterIds: readonly InstructorId[];
  readonly lifecycle?: 'active' | 'archived';
  readonly scope?: ScopeStamp;
}) {
  return {
    courseId: input.courseId,
    title: input.title,
    lifecycle: input.lifecycle ?? 'active',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [...input.rosterIds],
    startAt: startsAt(1_700_000_000),
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
      correlationId: 'correlation_assignment_pagination',
    },
    ...(input.scope ?? liveStamp()),
  };
}

function dayRecord(input: {
  readonly courseId: CourseId;
  readonly courseDayId: CourseDayId;
  readonly instructorIds: readonly InstructorId[];
  readonly seconds: number;
  readonly nanoseconds?: number;
  readonly dayOrder?: number;
  readonly scope?: ScopeStamp;
}) {
  return {
    courseId: input.courseId,
    courseDayId: input.courseDayId,
    dayOrder: input.dayOrder ?? 1,
    interval: {
      startsAt: startsAt(input.seconds, input.nanoseconds ?? 0),
      endsAt: startsAt(input.seconds + 7_200, input.nanoseconds ?? 0),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [...input.instructorIds],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_assignment_pagination',
    },
    ...(input.scope ?? liveStamp()),
  };
}

async function clearCourses(database: Firestore) {
  const courses = await database.collection('courses').get();
  for (const course of courses.docs) {
    const days = await course.ref.collection('days').get();
    const batch = database.batch();
    days.docs.forEach((day) => batch.delete(day.ref));
    batch.delete(course.ref);
    await batch.commit();
  }
}

async function writePairs(
  database: Firestore,
  pairs: readonly (readonly [string, Record<string, unknown>])[]
) {
  for (let offset = 0; offset < pairs.length; offset += 400) {
    const batch = database.batch();
    for (const [path, data] of pairs.slice(offset, offset + 400)) {
      batch.set(database.doc(path), data);
    }
    await batch.commit();
  }
}

async function readAllCourseIds(input: {
  readonly pageSize: number;
  readonly readScope?: CanonicalReadScope;
  readonly actorId?: InstructorId;
  readonly maxPages?: number;
}): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  const maxPages = input.maxPages ?? 8;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await queryInstructorCourseAssignmentReadModels(
      firestore,
      {
        scope: 'instructor_assigned',
        pageSize: input.pageSize,
        ...(cursor ? { cursor } : {}),
      },
      {
        instructorId: input.actorId ?? instructorId,
        ...(input.readScope ? { readScope: input.readScope } : {}),
      }
    );
    if (cursor) {
      expect(page.nextCursor).not.toBe(cursor);
    }
    ids.push(...page.items.map((item) => item.courseId));
    if (!page.hasMore) {
      return ids;
    }
    expect(page.nextCursor).toBeDefined();
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not finish');
}

describeEmulator('instructor course assignment pagination emulator', () => {
  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    await clearCourses(firestore);
  });

  it('pages 73 dual-source assignments without duplicates or omissions', async () => {
    const pairs: (readonly [string, Record<string, unknown>])[] = [];
    for (let index = 1; index <= 73; index += 1) {
      const suffix = String(index).padStart(3, '0');
      const courseId = CourseIdSchema.parse(`course_assign_page_${suffix}`);
      const courseDayId = CourseDayIdSchema.parse(`course_day_assign_page_${suffix}`);
      pairs.push(
        [
          `courses/${courseId}`,
          courseRecord({
            courseId,
            title: `Course ${suffix}`,
            rosterIds: [instructorId],
          }),
        ],
        [
          `courses/${courseId}/days/${courseDayId}`,
          dayRecord({
            courseId,
            courseDayId,
            instructorIds: [instructorId],
            seconds: 1_700_100_000 - index,
          }),
        ]
      );
    }
    await writePairs(firestore, pairs);

    const first = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20 },
      { instructorId }
    );
    const second = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20, cursor: first.nextCursor },
      { instructorId }
    );
    const third = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20, cursor: second.nextCursor },
      { instructorId }
    );
    const fourth = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 20, cursor: third.nextCursor },
      { instructorId }
    );

    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(20);
    expect(third.items).toHaveLength(20);
    expect(fourth.items).toHaveLength(13);
    expect(fourth.hasMore).toBe(false);
    expect(second.nextCursor).not.toBe(first.nextCursor);
    expect(third.nextCursor).not.toBe(second.nextCursor);
    const ids = [...first.items, ...second.items, ...third.items, ...fourth.items].map(
      (item) => item.courseId
    );
    expect(new Set(ids).size).toBe(73);
    expect(ids).toEqual([...ids].sort((left, right) => left.localeCompare(right)));
  }, 60_000);

  it('keeps same-timestamp days under different parents on a stable page boundary', async () => {
    const sharedDayId = CourseDayIdSchema.parse('course_day_shared');
    const otherDayId = CourseDayIdSchema.parse('course_day_other');
    const parents = [
      ['course_parent_a', 'Alpha', sharedDayId],
      ['course_parent_b', 'Beta', sharedDayId],
      ['course_parent_c', 'Gamma', otherDayId],
    ] as const;
    const pairs: (readonly [string, Record<string, unknown>])[] = [];
    for (const [rawCourseId, title, courseDayId] of parents) {
      const courseId = CourseIdSchema.parse(rawCourseId);
      pairs.push(
        [
          `courses/${courseId}`,
          courseRecord({ courseId, title, rosterIds: [otherInstructorId] }),
        ],
        [
          `courses/${courseId}/days/${courseDayId}`,
          dayRecord({
            courseId,
            courseDayId,
            instructorIds: [instructorId],
            seconds: 1_700_000_100,
            nanoseconds: 25,
          }),
        ]
      );
    }
    await writePairs(firestore, pairs);

    const ids = await readAllCourseIds({ pageSize: 1, maxPages: 5 });
    expect(ids).toEqual(['course_parent_a', 'course_parent_b', 'course_parent_c']);
  });

  it('finds roster-only, day-only, and dual-source courses once, including extra days', async () => {
    const rosterOnlyId = CourseIdSchema.parse('course_roster_only');
    const dayOnlyId = CourseIdSchema.parse('course_day_only');
    const dualId = CourseIdSchema.parse('course_dual_source');
    const rosterDayId = CourseDayIdSchema.parse('course_day_roster_only');
    const dayOnlyDayId = CourseDayIdSchema.parse('course_day_day_only');
    const dualDayOneId = CourseDayIdSchema.parse('course_day_dual_one');
    const dualDayTwoId = CourseDayIdSchema.parse('course_day_dual_two');
    const dualDayThreeId = CourseDayIdSchema.parse('course_day_dual_three');
    await writePairs(firestore, [
      [
        `courses/${rosterOnlyId}`,
        courseRecord({
          courseId: rosterOnlyId,
          title: 'Roster Only',
          rosterIds: [instructorId],
        }),
      ],
      [
        `courses/${rosterOnlyId}/days/${rosterDayId}`,
        dayRecord({
          courseId: rosterOnlyId,
          courseDayId: rosterDayId,
          instructorIds: [otherInstructorId],
          seconds: 1_700_000_010,
        }),
      ],
      [
        `courses/${dayOnlyId}`,
        courseRecord({
          courseId: dayOnlyId,
          title: 'Day Only',
          rosterIds: [otherInstructorId],
        }),
      ],
      [
        `courses/${dayOnlyId}/days/${dayOnlyDayId}`,
        dayRecord({
          courseId: dayOnlyId,
          courseDayId: dayOnlyDayId,
          instructorIds: [instructorId],
          seconds: 1_700_000_020,
        }),
      ],
      [
        `courses/${dualId}`,
        courseRecord({
          courseId: dualId,
          title: 'Dual Source',
          rosterIds: [instructorId],
        }),
      ],
      [
        `courses/${dualId}/days/${dualDayOneId}`,
        dayRecord({
          courseId: dualId,
          courseDayId: dualDayOneId,
          instructorIds: [instructorId],
          seconds: 1_700_000_030,
          dayOrder: 1,
        }),
      ],
      [
        `courses/${dualId}/days/${dualDayTwoId}`,
        dayRecord({
          courseId: dualId,
          courseDayId: dualDayTwoId,
          instructorIds: [instructorId],
          seconds: 1_700_000_040,
          dayOrder: 2,
        }),
      ],
      [
        `courses/${dualId}/days/${dualDayThreeId}`,
        dayRecord({
          courseId: dualId,
          courseDayId: dualDayThreeId,
          instructorIds: [instructorId],
          seconds: 1_700_000_050,
          dayOrder: 3,
        }),
      ],
    ]);

    const ids = await readAllCourseIds({ pageSize: 1, maxPages: 6 });
    expect(ids).toEqual(['course_day_only', 'course_dual_source', 'course_roster_only']);
  });

  it('continues past archived courses interleaved with active assignments', async () => {
    const rows = [
      ['course_archived_b', 'B Archived', 'archived', 1_700_000_001],
      ['course_active_a', 'A Active', 'active', 1_700_000_002],
      ['course_archived_d', 'D Archived', 'archived', 1_700_000_003],
      ['course_active_c', 'C Active', 'active', 1_700_000_004],
      ['course_active_e', 'E Active', 'active', 1_700_000_005],
    ] as const;
    const pairs: (readonly [string, Record<string, unknown>])[] = [];
    for (const [rawCourseId, title, lifecycle, seconds] of rows) {
      const courseId = CourseIdSchema.parse(rawCourseId);
      const courseDayId = CourseDayIdSchema.parse(`course_day_${rawCourseId}`);
      pairs.push(
        [
          `courses/${courseId}`,
          courseRecord({
            courseId,
            title,
            lifecycle,
            rosterIds: [otherInstructorId],
          }),
        ],
        [
          `courses/${courseId}/days/${courseDayId}`,
          dayRecord({
            courseId,
            courseDayId,
            instructorIds: [instructorId],
            seconds,
          }),
        ]
      );
    }
    await writePairs(firestore, pairs);

    const ids = await readAllCourseIds({ pageSize: 1, maxPages: 6 });
    expect(ids).toEqual(['course_active_a', 'course_active_c', 'course_active_e']);
  });

  it('isolates LIVE and TEST assignments and rejects cross-scope cursors', async () => {
    const liveOneId = CourseIdSchema.parse('course_scope_live_one');
    const liveTwoId = CourseIdSchema.parse('course_scope_live_two');
    const testCourseId = CourseIdSchema.parse('course_scope_test_one');
    const testStamp: ScopeStamp = { dataScope: 'test', testSessionId };
    const pairs: (readonly [string, Record<string, unknown>])[] = [];
    for (const [courseId, title, scope] of [
      [liveOneId, 'Live One', liveStamp()],
      [liveTwoId, 'Live Two', liveStamp()],
      [testCourseId, 'Test One', testStamp],
    ] as const) {
      const courseDayId = CourseDayIdSchema.parse(`course_day_${courseId}`);
      pairs.push(
        [
          `courses/${courseId}`,
          courseRecord({ courseId, title, rosterIds: [instructorId], scope }),
        ],
        [
          `courses/${courseId}/days/${courseDayId}`,
          dayRecord({
            courseId,
            courseDayId,
            instructorIds: [instructorId],
            seconds: 1_700_000_200,
            scope,
          }),
        ]
      );
    }
    await writePairs(firestore, pairs);

    const liveIds = await readAllCourseIds({ pageSize: 10 });
    expect(liveIds).toEqual(['course_scope_live_one', 'course_scope_live_two']);

    const testIds = await readAllCourseIds({
      pageSize: 10,
      readScope: testCanonicalReadScope(testSessionId),
    });
    expect(testIds).toEqual(['course_scope_test_one']);

    const livePage = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned', pageSize: 1 },
      { instructorId }
    );
    await expect(
      queryInstructorCourseAssignmentReadModels(
        firestore,
        { scope: 'instructor_assigned', pageSize: 1, cursor: livePage.nextCursor },
        { instructorId, readScope: testCanonicalReadScope(testSessionId) }
      )
    ).rejects.toThrow('invalid_cursor');
  });

  it('rejects malformed, cross-instructor, and non-course cursors', async () => {
    const courseId = CourseIdSchema.parse('course_cursor_reject');
    const courseDayId = CourseDayIdSchema.parse('course_day_cursor_reject');
    await writePairs(firestore, [
      [
        `courses/${courseId}`,
        courseRecord({ courseId, title: 'Reject Cursor', rosterIds: [instructorId] }),
      ],
      [
        `courses/${courseId}/days/${courseDayId}`,
        dayRecord({
          courseId,
          courseDayId,
          instructorIds: [instructorId],
          seconds: 1_700_000_300,
        }),
      ],
    ]);
    const rawCursor = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const liveBase = {
      instructorId,
      readScope: { dataScope: 'live' as const },
      roster: { exhausted: false },
    };

    await expect(
      queryInstructorCourseAssignmentReadModels(
        firestore,
        { scope: 'instructor_assigned', cursor: '%%%' },
        { instructorId }
      )
    ).rejects.toThrow('invalid_cursor');
    await expect(
      queryInstructorCourseAssignmentReadModels(
        firestore,
        {
          scope: 'instructor_assigned',
          cursor: rawCursor({
            ...liveBase,
            instructorId: otherInstructorId,
            days: { exhausted: true },
          }),
        },
        { instructorId }
      )
    ).rejects.toThrow('invalid_cursor');
    for (const documentPath of ['users/account_1', 'payments/payment_1', 'courses/course_cursor_reject/days']) {
      await expect(
        queryInstructorCourseAssignmentReadModels(
          firestore,
          {
            scope: 'instructor_assigned',
            cursor: rawCursor({
              ...liveBase,
              days: {
                exhausted: false,
                startsAtSeconds: 1,
                startsAtNanoseconds: 0,
                documentPath,
              },
            }),
          },
          { instructorId }
        )
      ).rejects.toThrow('invalid_cursor');
    }

    const visible = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned' },
      { instructorId }
    );
    expect(visible.items.map((item) => item.courseId)).toEqual([courseId]);
  });
});
