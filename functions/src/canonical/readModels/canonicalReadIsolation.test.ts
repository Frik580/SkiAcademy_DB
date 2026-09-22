import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LIVE_CANONICAL_READ_SCOPE,
  TestSessionIdSchema,
  CourseEnrollmentIdSchema,
  createOpenAdminIssue,
  documentMatchesReadScope,
  testCanonicalReadScope,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalCourseDeliveryFixtures,
  canonicalPaymentWalletAuditFixtures,
} from '@ski-academy/shared-domain/testing';
import { queryCourseCatalogReadModels } from './courseCatalogReadModels';
import { queryAdminIssueReadModels } from './adminIssueReadModels';
import { queryAdminFinanceReadModels } from './adminFinanceReadModels';
import { queryAdminIdentityReadModels } from './adminIdentityReadModels';
import { queryAdminCourseEnrollmentReadModels } from './adminCourseEnrollmentReadModels';
import { queryLessonBookingReadModels } from './lessonBookingReadModels';
import {
  loadInstructorOccupancyItems,
  instructorOccupancyWindow,
} from './instructorOccupancyReadSupport';
import { queryInstructorReviewReadModels } from './instructorReviewReadModels';
import { queryParticipantProgressReadModels } from './participantProgressReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';
import { queryDocsMatchingReadScope } from './readModelScope';
import { queryTestSessionReadModels } from './testSessionReadModels';

const sessionA = TestSessionIdSchema.parse('test_isolation_sess_a01');
const sessionB = TestSessionIdSchema.parse('test_isolation_sess_b01');
const liveScope = LIVE_CANONICAL_READ_SCOPE;
const testA = testCanonicalReadScope(sessionA);
const testB = testCanonicalReadScope(sessionB);
const actor = {
  kind: 'administrator' as const,
  accountId: canonicalPaymentWalletAuditFixtures.wallet.accountId,
};

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

function withScope<T extends Record<string, unknown>>(
  record: T,
  scope: Record<string, unknown>
): T {
  return { ...record, ...scope };
}

function fakeFirestore(seed: Record<string, Record<string, unknown>>): Firestore {
  const snapshot = (entries: Array<[string, Record<string, unknown>]>) => ({
    empty: entries.length === 0,
    size: entries.length,
    docs: entries.map(([path, data]) => ({
      id: path.split('/').at(-1)!,
      exists: true,
      ref: { path, id: path.split('/').at(-1)! },
      data: () => data,
      get: (field: string) => nestedValue(data, field),
    })),
  });

  const collectionEntries = (path: string) =>
    Object.entries(seed).filter(([key]) => {
      if (!key.startsWith(`${path}/`)) return false;
      return key.slice(path.length + 1).split('/').length === 1;
    });

  const buildQuery = (entries: () => Array<[string, Record<string, unknown>]>) => {
    const chain: {
      where: (field: string, op: string, value: unknown) => typeof chain;
      orderBy: (...args: unknown[]) => typeof chain;
      startAfter: (...args: unknown[]) => typeof chain;
      limit: (count: number) => typeof chain;
      count: () => { get: () => Promise<{ data: () => { count: number } }> };
      get: () => Promise<ReturnType<typeof snapshot>>;
    } = {
      where: (field, op, value) =>
        buildQuery(() =>
          entries().filter(([, data]) => {
            const actual = nestedValue(data, field);
            if (op === 'in' && Array.isArray(value)) return value.includes(actual);
            if (op === 'array-contains' && Array.isArray(actual)) return actual.includes(value);
            if (typeof actual === 'number' && typeof value === 'number') {
              if (op === '>=') return actual >= value;
              if (op === '<=') return actual <= value;
              if (op === '>') return actual > value;
              if (op === '<') return actual < value;
            }
            return Object.is(actual, value);
          })
        ),
      orderBy: () => chain,
      startAfter: () => chain,
      limit: (count) => buildQuery(() => entries().slice(0, count)),
      count: () => ({
        get: async () => ({ data: () => ({ count: entries().length }) }),
      }),
      get: async () => snapshot(entries()),
    };
    return chain;
  };

  const collection = (path: string) => {
    const entries = () => collectionEntries(path);
    return {
      ...buildQuery(entries),
      doc: (id: string) => {
        const docPath = `${path}/${id}`;
        return {
          id,
          path: docPath,
          get: async () => {
            const data = seed[docPath];
            return {
              id,
              exists: data !== undefined,
              ref: { path: docPath, id },
              data: () => data,
              get: (field: string) => (data ? nestedValue(data, field) : undefined),
            };
          },
          collection: (sub: string) => collection(`${docPath}/${sub}`),
        };
      },
    };
  };

  return {
    collection,
    collectionGroup: (name: string) =>
      buildQuery(() =>
        Object.entries(seed).filter(([key]) => {
          const suffix = `/${name}/`;
          return (
            key.includes(suffix) &&
            key.slice(key.indexOf(suffix) + suffix.length).split('/').length === 1
          );
        })
      ),
    doc: (path: string) => ({
      id: path.split('/').at(-1)!,
      path,
      get: async () => {
        const data = seed[path];
        return {
          id: path.split('/').at(-1)!,
          exists: data !== undefined,
          ref: { path, id: path.split('/').at(-1)! },
          data: () => data,
          get: (field: string) => (data ? nestedValue(data, field) : undefined),
        };
      },
    }),
    getAll: async (...refs: Array<{ path?: string; get?: () => Promise<unknown> }>) =>
      Promise.all(
        refs.map((ref) =>
          ref.get
            ? ref.get()
            : Promise.resolve({
                id: (ref.path ?? '').split('/').at(-1),
                exists: Boolean(ref.path && seed[ref.path]),
                data: () => (ref.path ? seed[ref.path] : undefined),
                ref,
              })
        )
      ),
  } as unknown as Firestore;
}

function scopedIds(kind: string, suffix: string) {
  return `${kind}_isolation_${suffix}`;
}

describe('canonical LIVE/TEST read isolation', () => {
  it('keeps public catalog LIVE-only and hides published TEST clones', async () => {
    const course = canonicalCourseDeliveryFixtures.course;
    const days = canonicalCourseDeliveryFixtures.courseDays;
    const variants = [
      { id: scopedIds('course', 'legacy01'), scope: {} },
      { id: scopedIds('course', 'live0001'), scope: { dataScope: 'live' } },
      {
        id: scopedIds('course', 'testa001'),
        scope: { dataScope: 'test', testSessionId: sessionA },
      },
      {
        id: scopedIds('course', 'testb001'),
        scope: { dataScope: 'test', testSessionId: sessionB },
      },
    ] as const;
    const seed: Record<string, Record<string, unknown>> = {};
    for (const variant of variants) {
      const courseId = variant.id as typeof course.courseId;
      seed[`courses/${courseId}`] = withScope(
        { ...course, courseId, title: variant.id },
        variant.scope
      );
      days.forEach((day, index) => {
        const dayId = `${variant.id}_d${index + 1}` as typeof day.courseDayId;
        seed[`courses/${courseId}/days/${dayId}`] = withScope(
          { ...day, courseId, courseDayId: dayId },
          variant.scope
        );
      });
    }

    const live = await queryCourseCatalogReadModels(
      fakeFirestore(seed),
      { scope: 'public' },
      {
        readScope: liveScope,
      }
    );
    expect(live.items.map((item) => item.courseId).sort()).toEqual(
      [scopedIds('course', 'legacy01'), scopedIds('course', 'live0001')].sort()
    );

    const session = await queryCourseCatalogReadModels(
      fakeFirestore(seed),
      { scope: 'public' },
      { readScope: testA }
    );
    expect(session.items.map((item) => item.courseId)).toEqual([scopedIds('course', 'testa001')]);
  });

  it('does not merge LIVE and TEST occupancy in the planner window', async () => {
    const booking = canonicalBookingCollaborationFixtures.individualBooking;
    const window = instructorOccupancyWindow('2026-06-15', booking.occurrence.timeZone, 1);
    const startsAt = {
      ...booking.occurrence.interval.startsAt,
      seconds: window.startsAt.seconds + 3600,
    };
    const endsAt = { ...booking.occurrence.interval.endsAt, seconds: startsAt.seconds + 3600 };
    const stamp = (id: string, scope: Record<string, unknown>) =>
      withScope(
        {
          ...booking,
          bookingId: id,
          occurrence: {
            ...booking.occurrence,
            interval: { startsAt, endsAt },
          },
        },
        scope
      );

    const instructorId = booking.occurrence.instructorId;
    const block = (id: string, scope: Record<string, unknown>) =>
      withScope(
        {
          blockId: id,
          instructorId,
          kind: 'unavailable',
          interval: { startsAt, endsAt },
          timeZone: booking.occurrence.timeZone,
          lifecycle: 'active',
          scheduleRevision: 1,
          revision: 1,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        },
        scope
      );
    const day = canonicalCourseDeliveryFixtures.courseDays[0]!;
    const course = canonicalCourseDeliveryFixtures.course;
    const stampDay = (courseId: string, dayId: string, scope: Record<string, unknown>) =>
      withScope(
        {
          ...day,
          courseId,
          courseDayId: dayId,
          interval: { startsAt, endsAt },
          actualInstructorIds: [instructorId],
        },
        scope
      );
    const stampCourse = (courseId: string, scope: Record<string, unknown>) =>
      withScope({ ...course, courseId, title: courseId, lifecycle: 'active' }, scope);

    const seed = {
      [`bookings/${scopedIds('booking', 'legacy01')}`]: stamp(scopedIds('booking', 'legacy01'), {}),
      [`bookings/${scopedIds('booking', 'live0001')}`]: stamp(scopedIds('booking', 'live0001'), {
        dataScope: 'live',
      }),
      [`bookings/${scopedIds('booking', 'testa001')}`]: stamp(scopedIds('booking', 'testa001'), {
        dataScope: 'test',
        testSessionId: sessionA,
      }),
      [`bookings/${scopedIds('booking', 'testb001')}`]: stamp(scopedIds('booking', 'testb001'), {
        dataScope: 'test',
        testSessionId: sessionB,
      }),
      [`administrative_availability_blocks/${scopedIds('block', 'legacy01')}`]: block(
        scopedIds('block', 'legacy01'),
        {}
      ),
      [`administrative_availability_blocks/${scopedIds('block', 'live0001')}`]: block(
        scopedIds('block', 'live0001'),
        { dataScope: 'live' }
      ),
      [`administrative_availability_blocks/${scopedIds('block', 'testa001')}`]: block(
        scopedIds('block', 'testa001'),
        { dataScope: 'test', testSessionId: sessionA }
      ),
      [`administrative_availability_blocks/${scopedIds('block', 'testb001')}`]: block(
        scopedIds('block', 'testb001'),
        { dataScope: 'test', testSessionId: sessionB }
      ),
      [`courses/${scopedIds('course', 'legacy01')}`]: stampCourse(
        scopedIds('course', 'legacy01'),
        {}
      ),
      [`courses/${scopedIds('course', 'live0001')}`]: stampCourse(scopedIds('course', 'live0001'), {
        dataScope: 'live',
      }),
      [`courses/${scopedIds('course', 'testa001')}`]: stampCourse(scopedIds('course', 'testa001'), {
        dataScope: 'test',
        testSessionId: sessionA,
      }),
      [`courses/${scopedIds('course', 'testb001')}`]: stampCourse(scopedIds('course', 'testb001'), {
        dataScope: 'test',
        testSessionId: sessionB,
      }),
      [`courses/${scopedIds('course', 'legacy01')}/days/${scopedIds('day', 'legacy01')}`]: stampDay(
        scopedIds('course', 'legacy01'),
        scopedIds('day', 'legacy01'),
        {}
      ),
      [`courses/${scopedIds('course', 'live0001')}/days/${scopedIds('day', 'live0001')}`]: stampDay(
        scopedIds('course', 'live0001'),
        scopedIds('day', 'live0001'),
        { dataScope: 'live' }
      ),
      [`courses/${scopedIds('course', 'testa001')}/days/${scopedIds('day', 'testa001')}`]: stampDay(
        scopedIds('course', 'testa001'),
        scopedIds('day', 'testa001'),
        { dataScope: 'test', testSessionId: sessionA }
      ),
      [`courses/${scopedIds('course', 'testb001')}/days/${scopedIds('day', 'testb001')}`]: stampDay(
        scopedIds('course', 'testb001'),
        scopedIds('day', 'testb001'),
        { dataScope: 'test', testSessionId: sessionB }
      ),
    };

    const live = await loadInstructorOccupancyItems(fakeFirestore(seed), {
      window,
      bookingScope: 'admin_planner_visualization',
      readScope: liveScope,
    });
    const liveByKind = Object.fromEntries(
      ['lesson_booking', 'availability_block', 'course_day'].map((kind) => [
        kind,
        live.occupancy
          .filter((item) => item.occupancyKind === kind)
          .map((item) => item.occupancyId)
          .sort(),
      ])
    );
    expect(liveByKind.lesson_booking).toEqual(
      [scopedIds('booking', 'legacy01'), scopedIds('booking', 'live0001')].sort()
    );
    expect(liveByKind.availability_block).toEqual(
      [scopedIds('block', 'legacy01'), scopedIds('block', 'live0001')].sort()
    );
    expect(liveByKind.course_day).toEqual(
      [
        `${scopedIds('day', 'legacy01')}:${instructorId}`,
        `${scopedIds('day', 'live0001')}:${instructorId}`,
      ].sort()
    );

    const session = await loadInstructorOccupancyItems(fakeFirestore(seed), {
      window,
      bookingScope: 'admin_planner_visualization',
      readScope: testA,
    });
    expect(session.occupancy.map((item) => [item.occupancyKind, item.occupancyId])).toEqual([
      ['lesson_booking', scopedIds('booking', 'testa001')],
      ['availability_block', scopedIds('block', 'testa001')],
      ['course_day', `${scopedIds('day', 'testa001')}:${instructorId}`],
    ]);
  });

  it('hides TEST finance events from LIVE overview and TEST B from session A', async () => {
    const base = canonicalPaymentWalletAuditFixtures.monetaryEvent;
    const event = (id: string, scope: Record<string, unknown>) =>
      withScope(
        {
          ...base,
          eventId: id,
          paymentEffect: { settledAmountDelta: 10_000 },
        },
        scope
      );
    const seed = {
      [`monetary_events/${scopedIds('event', 'legacy01')}`]: event(
        scopedIds('event', 'legacy01'),
        {}
      ),
      [`monetary_events/${scopedIds('event', 'live0001')}`]: event(scopedIds('event', 'live0001'), {
        dataScope: 'live',
      }),
      [`monetary_events/${scopedIds('event', 'testa001')}`]: event(scopedIds('event', 'testa001'), {
        dataScope: 'test',
        testSessionId: sessionA,
      }),
      [`monetary_events/${scopedIds('event', 'testb001')}`]: event(scopedIds('event', 'testb001'), {
        dataScope: 'test',
        testSessionId: sessionB,
      }),
    };

    const live = await queryAdminFinanceReadModels(
      fakeFirestore(seed),
      actor,
      {
        scope: 'admin_financial_overview',
        period: 'month',
        localDate: '2026-01-15',
        timeZone: 'UTC',
      },
      { readScope: liveScope }
    );
    expect(live.scope).toBe('admin_financial_overview');
    if (live.scope === 'admin_financial_overview') {
      expect(live.item.settledRevenueKzt).toBe(20_000);
    }

    const session = await queryAdminFinanceReadModels(
      fakeFirestore(seed),
      actor,
      {
        scope: 'admin_financial_overview',
        period: 'month',
        localDate: '2026-01-15',
        timeZone: 'UTC',
      },
      { readScope: testA }
    );
    expect(session.scope).toBe('admin_financial_overview');
    if (session.scope === 'admin_financial_overview') {
      expect(session.item.settledRevenueKzt).toBe(10_000);
    }
  });

  it('treats cross-scope payment and booking known-ID reads as missing', async () => {
    const payment = canonicalPaymentWalletAuditFixtures.payment;
    const testPaymentId = scopedIds('payment', 'testa001');
    const livePaymentId = scopedIds('payment', 'live0001');
    const booking = canonicalBookingCollaborationFixtures.individualBooking;
    const testBookingId = scopedIds('booking', 'testa001');
    const seed = {
      [`payments/${testPaymentId}`]: withScope(
        { ...payment, paymentId: testPaymentId },
        { dataScope: 'test', testSessionId: sessionA }
      ),
      [`payments/${livePaymentId}`]: withScope(
        { ...payment, paymentId: livePaymentId },
        { dataScope: 'live' }
      ),
      [`bookings/${testBookingId}`]: withScope(
        { ...booking, bookingId: testBookingId },
        { dataScope: 'test', testSessionId: sessionA }
      ),
      [`bookings/${booking.bookingId}`]: withScope({ ...booking }, { dataScope: 'live' }),
    };
    const firestore = fakeFirestore(seed);

    const livePayment = await queryAdminFinanceReadModels(
      firestore,
      actor,
      { scope: 'admin_payment_detail', paymentId: testPaymentId as typeof payment.paymentId },
      { readScope: liveScope }
    );
    expect(livePayment.scope).toBe('admin_payment_detail');
    if (livePayment.scope === 'admin_payment_detail') {
      expect(livePayment.item).toBeUndefined();
    }

    const otherSessionPayment = await queryAdminFinanceReadModels(
      firestore,
      actor,
      { scope: 'admin_payment_detail', paymentId: livePaymentId as typeof payment.paymentId },
      { readScope: testA }
    );
    expect(otherSessionPayment.scope).toBe('admin_payment_detail');
    if (otherSessionPayment.scope === 'admin_payment_detail') {
      expect(otherSessionPayment.item).toBeUndefined();
    }

    const liveContext = createReadModelRequestContext(firestore, { readScope: liveScope });
    const hidden = await liveContext.booking(testBookingId as typeof booking.bookingId);
    expect(hidden.exists).toBe(false);
    expect(documentMatchesReadScope(testA, seed[`bookings/${testBookingId}`])).toBe(true);

    const testContext = createReadModelRequestContext(firestore, { readScope: testB });
    const otherSession = await testContext.booking(testBookingId as typeof booking.bookingId);
    expect(otherSession.exists).toBe(false);
  });

  it('keeps Issue Center LIVE-only and session-equal for TEST', async () => {
    const issueFixture = canonicalCourseDeliveryFixtures.openAdminIssue;
    const variants = [
      { suffix: 'legacy01', scope: {} },
      { suffix: 'live0001', scope: { dataScope: 'live' } },
      { suffix: 'testa001', scope: { dataScope: 'test', testSessionId: sessionA } },
      { suffix: 'testb001', scope: { dataScope: 'test', testSessionId: sessionB } },
    ];
    const seed: Record<string, Record<string, unknown>> = {
      [`users/${actor.accountId}`]: {
        accountId: actor.accountId,
        lifecycle: { status: 'active' },
        role: 'admin',
      },
    };
    const bySuffix = new Map<string, string>();
    for (const variant of variants) {
      const issue = createOpenAdminIssue({
        identity: {
          strategyVersion: 'issue:v1',
          kind: 'missing_attendance',
          subjectKind: 'course_enrollment',
          subjectId: CourseEnrollmentIdSchema.parse(
            `course_enrollment_isolation_${variant.suffix}`
          ),
          participantId: canonicalCourseDeliveryFixtures.confirmedEnrollment.participantId,
          courseDayId: canonicalCourseDeliveryFixtures.courseDays[1]!.courseDayId,
        },
        now: canonicalCourseDeliveryFixtures.course.updatedAt,
        correlationId: `correlation_isolation_issue_${variant.suffix}`,
        commandId: `command_isolation_issue_${variant.suffix}`,
      });
      bySuffix.set(variant.suffix, issue.issueId);
      seed[`admin_issues/${issue.issueId}`] = withScope({ ...issue }, variant.scope);
    }
    const firestore = fakeFirestore(seed);

    const live = await queryAdminIssueReadModels(
      firestore,
      actor,
      { scope: 'admin_open' },
      { readScope: liveScope }
    );
    expect(live.scope).toBe('admin_open');
    if (live.scope === 'admin_open') {
      expect(live.items.map((item) => item.issueId).sort()).toEqual(
        [bySuffix.get('legacy01'), bySuffix.get('live0001')].sort()
      );
    }

    const session = await queryAdminIssueReadModels(
      firestore,
      actor,
      { scope: 'admin_open' },
      { readScope: testA }
    );
    expect(session.scope).toBe('admin_open');
    if (session.scope === 'admin_open') {
      expect(session.items.map((item) => item.issueId)).toEqual([bySuffix.get('testa001')]);
    }

    const liveDetail = await queryAdminIssueReadModels(
      firestore,
      actor,
      {
        scope: 'admin_detail',
        issueId: bySuffix.get('testa001') as typeof issueFixture.issueId,
      },
      { readScope: liveScope }
    );
    expect(liveDetail.scope).toBe('admin_detail');
    if (liveDetail.scope === 'admin_detail') {
      expect(liveDetail.item).toBeUndefined();
    }
  });

  it('excludes explicit TEST identities from People and ignores email', async () => {
    const accountId = actor.accountId;
    const liveId = scopedIds('account', 'live0001');
    const testId = scopedIds('account', 'testa001');
    const emailLiveId = scopedIds('account', 'email001');
    const seed = {
      [`users/${accountId}`]: {
        accountId,
        lifecycle: { status: 'active' },
        role: 'admin',
        displayName: 'Owner',
      },
      [`users/${liveId}`]: {
        accountId: liveId,
        lifecycle: { status: 'active' },
        role: 'user',
        displayName: 'Live Customer',
        dataScope: 'live',
      },
      [`users/${emailLiveId}`]: {
        accountId: emailLiveId,
        lifecycle: { status: 'active' },
        role: 'user',
        displayName: 'Email Fixture',
        email: 'ksusha@test.ru',
      },
      [`users/${testId}`]: {
        accountId: testId,
        lifecycle: { status: 'active' },
        role: 'user',
        displayName: 'Test Actor',
        dataScope: 'test',
        email: 'customer@example.com',
      },
    };

    const live = await queryAdminIdentityReadModels(
      fakeFirestore(seed),
      actor,
      { scope: 'admin_account_list', pageSize: 50 },
      { readScope: liveScope }
    );
    expect(live.scope).toBe('admin_account_list');
    if (live.scope === 'admin_account_list') {
      expect(live.items.map((item) => item.accountId).sort()).toEqual(
        [accountId, liveId, emailLiveId].sort()
      );
    }
  });

  it('does not let TEST rating summaries contaminate LIVE public reviews', async () => {
    const liveInstructor = scopedIds('instructor', 'live0001');
    const testInstructor = scopedIds('instructor', 'testa001');
    const audit = canonicalCourseDeliveryFixtures.course.audit;
    const at = canonicalCourseDeliveryFixtures.course.updatedAt;
    const summary = {
      rating: 5,
      reviewsCount: 1,
      ratingSum: 5,
      ratingCounts: [0, 0, 0, 0, 1],
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit,
    };
    const seed = {
      [`instructors/${liveInstructor}`]: {
        id: liveInstructor,
        name: 'Live Coach',
        isAvailable: true,
        pricePerHourKZT: 12_000,
        dataScope: 'live',
      },
      [`instructors/${testInstructor}`]: {
        id: testInstructor,
        name: 'Test Coach',
        isAvailable: true,
        pricePerHourKZT: 12_000,
        dataScope: 'test',
        testSessionId: sessionA,
      },
      [`instructor_rating_summaries/${liveInstructor}`]: {
        ...summary,
        instructorId: liveInstructor,
        dataScope: 'live',
      },
      [`instructor_rating_summaries/${testInstructor}`]: {
        ...summary,
        instructorId: testInstructor,
        rating: 1,
        ratingSum: 1,
        ratingCounts: [1, 0, 0, 0, 0],
        dataScope: 'test',
        testSessionId: sessionA,
      },
    };

    const live = await queryInstructorReviewReadModels(
      fakeFirestore(seed),
      {
        scope: 'public_summaries',
        instructorIds: [liveInstructor, testInstructor] as [string, string],
      },
      { readScope: liveScope }
    );
    expect(live.scope).toBe('public_summaries');
    if (live.scope === 'public_summaries') {
      expect(live.summaries.map((item) => item.instructorId)).toEqual([liveInstructor]);
      expect(live.summaries[0]?.rating).toBe(5);
    }
  });

  function reviewInstructor(instructorId: string, scope: Record<string, unknown> = {}) {
    return {
      id: instructorId,
      name: 'Review Coach',
      isAvailable: true,
      pricePerHourKZT: 12_000,
      ...scope,
    };
  }

  function instructorReviewDocument(
    reviewId: string,
    instructorId: string,
    scope: Record<string, unknown>,
    rating: number = 5
  ) {
    const at = canonicalCourseDeliveryFixtures.course.createdAt;
    return {
      reviewId,
      bookingId: scopedIds('booking', 'review001'),
      managingAccountId: actor.accountId,
      instructorId,
      rating,
      attendanceEvidenceParticipantIds: [scopedIds('participant', 'review01')],
      authorDisplayName: 'Visible Reviewer',
      revision: 1,
      createdAt: at,
      audit: {
        createdByCommandId: 'command_isolation_review',
        correlationId: 'correlation_isolation_review',
      },
      ...scope,
    };
  }

  async function readInstructorReviews(
    seed: Record<string, Record<string, unknown>>,
    instructorId: string,
    readScope: typeof liveScope | typeof testA | typeof testB
  ) {
    return queryInstructorReviewReadModels(
      fakeFirestore(seed),
      { scope: 'instructor_reviews', instructorId: instructorId as never, pageSize: 10 },
      { readScope }
    );
  }

  it('returns a visible valid LIVE instructor review', async () => {
    const instructorId = scopedIds('instructor', 'revlive1');
    const reviewId = scopedIds('review', 'revlive01');
    const result = await readInstructorReviews(
      {
        [`instructors/${instructorId}`]: reviewInstructor(instructorId, { dataScope: 'live' }),
        [`instructor_reviews/${reviewId}`]: instructorReviewDocument(reviewId, instructorId, {
          dataScope: 'live',
        }),
      },
      instructorId,
      liveScope
    );
    expect(result.scope).toBe('instructor_reviews');
    if (result.scope === 'instructor_reviews') {
      expect(result.reviews.map((review) => review.reviewId)).toEqual([reviewId]);
      expect(result.reviews[0]?.rating).toBe(5);
    }
  });

  it('fails strict canonical validation for a visible malformed LIVE review', async () => {
    const instructorId = scopedIds('instructor', 'revbad01');
    const reviewId = scopedIds('review', 'revbad001');
    await expect(
      readInstructorReviews(
        {
          [`instructors/${instructorId}`]: reviewInstructor(instructorId, { dataScope: 'live' }),
          [`instructor_reviews/${reviewId}`]: instructorReviewDocument(
            reviewId,
            instructorId,
            { dataScope: 'live' },
            99
          ),
        },
        instructorId,
        liveScope
      )
    ).rejects.toThrow(`Canonical instructor review ${reviewId} is invalid.`);
  });

  it('returns a legacy missing-scope LIVE review during the compatibility window', async () => {
    const instructorId = scopedIds('instructor', 'revleg01');
    const reviewId = scopedIds('review', 'revleg001');
    const result = await readInstructorReviews(
      {
        [`instructors/${instructorId}`]: reviewInstructor(instructorId),
        [`instructor_reviews/${reviewId}`]: instructorReviewDocument(reviewId, instructorId, {}),
      },
      instructorId,
      liveScope
    );
    expect(result.scope).toBe('instructor_reviews');
    if (result.scope === 'instructor_reviews') {
      expect(result.reviews.map((review) => review.reviewId)).toEqual([reviewId]);
    }
  });

  it('hides a cross-scope TEST review from a LIVE read', async () => {
    const instructorId = scopedIds('instructor', 'revxsc01');
    const reviewId = scopedIds('review', 'revxsc001');
    const result = await readInstructorReviews(
      {
        [`instructors/${instructorId}`]: reviewInstructor(instructorId, { dataScope: 'live' }),
        [`instructor_reviews/${reviewId}`]: instructorReviewDocument(reviewId, instructorId, {
          dataScope: 'test',
          testSessionId: sessionA,
        }),
      },
      instructorId,
      liveScope
    );
    expect(result.scope).toBe('instructor_reviews');
    if (result.scope === 'instructor_reviews') {
      expect(result.reviews).toEqual([]);
    }
  });

  it('hides a valid TestSession B review from TestSession A', async () => {
    const instructorId = scopedIds('instructor', 'revsesa1');
    const reviewId = scopedIds('review', 'revsesb01');
    const result = await readInstructorReviews(
      {
        [`instructors/${instructorId}`]: reviewInstructor(instructorId, {
          dataScope: 'test',
          testSessionId: sessionA,
        }),
        [`instructor_reviews/${reviewId}`]: instructorReviewDocument(reviewId, instructorId, {
          dataScope: 'test',
          testSessionId: sessionB,
        }),
      },
      instructorId,
      testA
    );
    expect(result.scope).toBe('instructor_reviews');
    if (result.scope === 'instructor_reviews') {
      expect(result.reviews).toEqual([]);
    }
  });

  it('does not reveal a malformed TestSession B review to TestSession A', async () => {
    const instructorId = scopedIds('instructor', 'revleak1');
    const visibleReviewId = scopedIds('review', 'revleaka1');
    const foreignReviewId = scopedIds('review', 'revleakb1');
    const result = await readInstructorReviews(
      {
        [`instructors/${instructorId}`]: reviewInstructor(instructorId, {
          dataScope: 'test',
          testSessionId: sessionA,
        }),
        [`instructor_reviews/${visibleReviewId}`]: instructorReviewDocument(
          visibleReviewId,
          instructorId,
          { dataScope: 'test', testSessionId: sessionA }
        ),
        [`instructor_reviews/${foreignReviewId}`]: instructorReviewDocument(
          foreignReviewId,
          instructorId,
          { dataScope: 'test', testSessionId: sessionB },
          99
        ),
      },
      instructorId,
      testA
    );
    expect(result.scope).toBe('instructor_reviews');
    if (result.scope === 'instructor_reviews') {
      expect(result.reviews.map((review) => review.reviewId)).toEqual([visibleReviewId]);
    }
  });

  it('fails strict canonical validation for a malformed review in the matching TestSession', async () => {
    const instructorId = scopedIds('instructor', 'revtbad1');
    const reviewId = scopedIds('review', 'revtbad01');
    await expect(
      readInstructorReviews(
        {
          [`instructors/${instructorId}`]: reviewInstructor(instructorId, {
            dataScope: 'test',
            testSessionId: sessionA,
          }),
          [`instructor_reviews/${reviewId}`]: instructorReviewDocument(
            reviewId,
            instructorId,
            { dataScope: 'test', testSessionId: sessionA },
            99
          ),
        },
        instructorId,
        testA
      )
    ).rejects.toThrow(`Canonical instructor review ${reviewId} is invalid.`);
  });

  it('returns TEST session inventory counts without embedding unbounded IDs', async () => {
    const createdBy = actor.accountId;
    const at = canonicalCourseDeliveryFixtures.course.createdAt;
    const seed = {
      [`test_sessions/${sessionA}`]: {
        testSessionId: sessionA,
        schemaVersion: 1,
        status: 'resetting',
        label: 'Isolation session',
        createdByAccountId: createdBy,
        config: { startingBalanceKzt: 0, clonedCourseIds: [] },
        inventoryRevision: 1,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'command_isolation_session',
          lastChangedByCommandId: 'command_isolation_session',
          correlationId: 'correlation_isolation_session',
        },
      },
      [`bookings/${scopedIds('booking', 'testa001')}`]: {
        bookingId: scopedIds('booking', 'testa001'),
        testSessionId: sessionA,
        dataScope: 'test',
      },
      [`bookings/${scopedIds('booking', 'testb001')}`]: {
        bookingId: scopedIds('booking', 'testb001'),
        testSessionId: sessionB,
        dataScope: 'test',
      },
      [`test_actor_assignments/${createdBy}`]: {
        accountId: createdBy,
        activeTestSessionId: sessionA,
      },
    };

    const result = await queryTestSessionReadModels(fakeFirestore(seed), {
      scope: 'test_session_inventory',
      testSessionId: sessionA,
    });
    expect(result.scope).toBe('test_session_inventory');
    if (result.scope === 'test_session_inventory') {
      expect(result.item?.status).toBe('resetting');
      expect(result.item?.startingBalanceKzt).toBe(0);
      expect(result.item?.counts.bookings).toBe(1);
      expect(result.item?.counts.assignedActors).toBe(1);
      expect(result.item?.assignedAccountIds).toEqual([createdBy]);
    }
  });

  it('lists only LIVE courses as TestSession clone templates', async () => {
    const course = canonicalCourseDeliveryFixtures.course;
    const seed = {
      [`courses/${scopedIds('course', 'legacy01')}`]: withScope(
        { ...course, courseId: scopedIds('course', 'legacy01'), title: 'Legacy' },
        {}
      ),
      [`courses/${scopedIds('course', 'testa001')}`]: withScope(
        { ...course, courseId: scopedIds('course', 'testa001'), title: 'Clone' },
        { dataScope: 'test', testSessionId: sessionA }
      ),
    };
    const result = await queryTestSessionReadModels(fakeFirestore(seed), {
      scope: 'live_course_templates',
      pageSize: 20,
    });
    expect(result.scope).toBe('live_course_templates');
    if (result.scope === 'live_course_templates') {
      expect(result.items.map((item) => item.courseId)).toEqual([scopedIds('course', 'legacy01')]);
    }
  });

  it('keeps Admin Lessons known-ID lookup LIVE-only and session-equal', async () => {
    const booking = canonicalBookingCollaborationFixtures.individualBooking;
    const liveId = scopedIds('booking', 'live0001');
    const testAId = scopedIds('booking', 'testa001');
    const testBId = scopedIds('booking', 'testb001');
    const firestore = fakeFirestore({
      [`bookings/${liveId}`]: withScope({ ...booking, bookingId: liveId }, { dataScope: 'live' }),
      [`bookings/${testAId}`]: withScope(
        { ...booking, bookingId: testAId },
        { dataScope: 'test', testSessionId: sessionA }
      ),
      [`bookings/${testBId}`]: withScope(
        { ...booking, bookingId: testBId },
        { dataScope: 'test', testSessionId: sessionB }
      ),
    });

    const liveOfTest = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_detail', bookingId: testAId as typeof booking.bookingId },
      { administratorActor: actor, readScope: liveScope }
    );
    expect(liveOfTest.items).toEqual([]);

    const testAOfLive = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_detail', bookingId: liveId as typeof booking.bookingId },
      { administratorActor: actor, readScope: testA }
    );
    expect(testAOfLive.items).toEqual([]);

    const testAOfB = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_detail', bookingId: testBId as typeof booking.bookingId },
      { administratorActor: actor, readScope: testA }
    );
    expect(testAOfB.items).toEqual([]);

    const allowed = await createReadModelRequestContext(firestore, { readScope: testA }).booking(
      testAId as typeof booking.bookingId
    );
    expect(allowed.exists).toBe(true);
  });

  it('keeps Admin Lessons lists LIVE-only and session-equal', async () => {
    const booking = canonicalBookingCollaborationFixtures.individualBooking;
    const liveId = scopedIds('booking', 'live0001');
    const legacyId = scopedIds('booking', 'legacy01');
    const testAId = scopedIds('booking', 'testa001');
    const testBId = scopedIds('booking', 'testb001');
    const firestore = fakeFirestore({
      [`bookings/${legacyId}`]: withScope({ ...booking, bookingId: legacyId }, {}),
      [`bookings/${liveId}`]: withScope({ ...booking, bookingId: liveId }, { dataScope: 'live' }),
      [`bookings/${testAId}`]: withScope(
        { ...booking, bookingId: testAId },
        { dataScope: 'test', testSessionId: sessionA }
      ),
      [`bookings/${testBId}`]: withScope(
        { ...booking, bookingId: testBId },
        { dataScope: 'test', testSessionId: sessionB }
      ),
    });
    const snapshot = await firestore.collection('bookings').get();

    expect(
      queryDocsMatchingReadScope(snapshot.docs, liveScope)
        .map((document) => document.id)
        .sort()
    ).toEqual([legacyId, liveId].sort());
    expect(queryDocsMatchingReadScope(snapshot.docs, testA).map((document) => document.id)).toEqual(
      [testAId]
    );
    expect(queryDocsMatchingReadScope(snapshot.docs, testB).map((document) => document.id)).toEqual(
      [testBId]
    );
  });

  it('keeps enrollment lists and details scoped without leaking TEST clones', async () => {
    const enrollment = canonicalCourseDeliveryFixtures.confirmedEnrollment;
    const course = canonicalCourseDeliveryFixtures.course;
    const variants = [
      { suffix: 'legacy01', scope: {} },
      { suffix: 'live0001', scope: { dataScope: 'live' } },
      { suffix: 'testa001', scope: { dataScope: 'test', testSessionId: sessionA } },
      { suffix: 'testb001', scope: { dataScope: 'test', testSessionId: sessionB } },
    ] as const;
    const seed: Record<string, Record<string, unknown>> = {
      [`users/${actor.accountId}`]: {
        accountId: actor.accountId,
        lifecycle: { status: 'active' },
        role: 'admin',
      },
      [`participants/${enrollment.participantId}`]: {
        participantId: enrollment.participantId,
        displayName: 'Enrollment Isolation',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: 'management_isolation_enroll01' },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        audit: course.audit,
      },
    };
    for (const variant of variants) {
      const courseId = scopedIds('course', variant.suffix);
      const enrollmentId = scopedIds('enrollment', variant.suffix);
      seed[`courses/${courseId}`] = withScope({ ...course, courseId }, variant.scope);
      seed[`course_enrollments/${enrollmentId}`] = withScope(
        { ...enrollment, enrollmentId, courseId, originalCourseId: courseId },
        variant.scope
      );
    }
    const firestore = fakeFirestore(seed);

    const live = await queryAdminCourseEnrollmentReadModels(
      firestore,
      actor,
      { scope: 'admin_course_roster', pageSize: 50 },
      { readScope: liveScope }
    );
    expect(live.scope).toBe('admin_course_roster');
    if (live.scope === 'admin_course_roster') {
      expect(live.items.map((item) => item.enrollmentId).sort()).toEqual(
        [scopedIds('enrollment', 'legacy01'), scopedIds('enrollment', 'live0001')].sort()
      );
    }

    const session = await queryAdminCourseEnrollmentReadModels(
      firestore,
      actor,
      { scope: 'admin_course_roster', pageSize: 50 },
      { readScope: testA }
    );
    expect(session.scope).toBe('admin_course_roster');
    if (session.scope === 'admin_course_roster') {
      expect(session.items.map((item) => item.enrollmentId)).toEqual([
        scopedIds('enrollment', 'testa001'),
      ]);
    }

    const liveDetail = await queryAdminCourseEnrollmentReadModels(
      firestore,
      actor,
      {
        scope: 'admin_enrollment_detail',
        enrollmentId: scopedIds('enrollment', 'testa001') as typeof enrollment.enrollmentId,
      },
      { readScope: liveScope }
    );
    expect(liveDetail.scope).toBe('admin_enrollment_detail');
    if (liveDetail.scope === 'admin_enrollment_detail') {
      expect(liveDetail.item).toBeUndefined();
    }

    const crossSession = await queryAdminCourseEnrollmentReadModels(
      firestore,
      actor,
      {
        scope: 'admin_enrollment_detail',
        enrollmentId: scopedIds('enrollment', 'live0001') as typeof enrollment.enrollmentId,
      },
      { readScope: testA }
    );
    expect(crossSession.scope).toBe('admin_enrollment_detail');
    if (crossSession.scope === 'admin_enrollment_detail') {
      expect(crossSession.item).toBeUndefined();
    }
  });

  it('hides stale previous-session progress and TEST wallets from LIVE/current TEST', async () => {
    const participantId = canonicalCourseDeliveryFixtures.confirmedEnrollment.participantId;
    const accountId = actor.accountId;
    const managementId = 'management_isolation_progress01';
    const at = canonicalCourseDeliveryFixtures.course.updatedAt;
    const audit = canonicalCourseDeliveryFixtures.course.audit;
    const progress = {
      participantId,
      level: 3,
      skillScores: { carving: 12 },
      skillComments: {},
      revision: 2,
      createdAt: at,
      updatedAt: at,
      audit,
      dataScope: 'test',
      testSessionId: sessionB,
    };
    const wallet = canonicalPaymentWalletAuditFixtures.wallet;
    const seed = {
      [`users/${accountId}`]: {
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      },
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Isolation Child',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      },
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      },
      [`participant_progress/${participantId}`]: progress,
      [`users/${wallet.accountId}/wallet/state`]: withScope(
        { ...wallet },
        { dataScope: 'test', testSessionId: sessionB }
      ),
    };
    const firestore = fakeFirestore(seed);

    const liveProgress = await queryParticipantProgressReadModels(
      firestore,
      { scope: 'managed', participantIds: [participantId] },
      { accountId, readScope: liveScope }
    );
    expect(liveProgress.items[0]).toMatchObject({ participantId, revision: 0, level: 1 });

    const sessionAProgress = await queryParticipantProgressReadModels(
      firestore,
      { scope: 'managed', participantIds: [participantId] },
      { accountId, readScope: testA }
    );
    expect(sessionAProgress.items[0]).toMatchObject({ participantId, revision: 0, level: 1 });

    const sessionBProgress = await queryParticipantProgressReadModels(
      firestore,
      { scope: 'managed', participantIds: [participantId] },
      { accountId, readScope: testB }
    );
    expect(sessionBProgress.items[0]).toMatchObject({ participantId, revision: 2, level: 3 });

    const liveWallet = await queryAdminFinanceReadModels(
      firestore,
      actor,
      { scope: 'admin_wallet', accountId: wallet.accountId },
      { readScope: liveScope }
    );
    expect(liveWallet.scope).toBe('admin_wallet');
    if (liveWallet.scope === 'admin_wallet') {
      expect(liveWallet.item.exists).toBe(false);
      expect(liveWallet.item.balance).toBe(0);
    }

    const testAWallet = await queryAdminFinanceReadModels(
      firestore,
      actor,
      { scope: 'admin_wallet', accountId: wallet.accountId },
      { readScope: testA }
    );
    expect(testAWallet.scope).toBe('admin_wallet');
    if (testAWallet.scope === 'admin_wallet') {
      expect(testAWallet.item.exists).toBe(false);
      expect(testAWallet.item.balance).toBe(0);
    }

    const testBWallet = await queryAdminFinanceReadModels(
      firestore,
      actor,
      { scope: 'admin_wallet', accountId: wallet.accountId },
      { readScope: testB }
    );
    expect(testBWallet.scope).toBe('admin_wallet');
    if (testBWallet.scope === 'admin_wallet') {
      expect(testBWallet.item.exists).toBe(true);
      expect(testBWallet.item.balance).toBe(wallet.balance);
    }

    const secretPayerId = scopedIds('account', 'testpay01');
    const secretSeed = {
      ...seed,
      [`users/${secretPayerId}`]: {
        accountId: secretPayerId,
        lifecycle: { status: 'active' },
        displayName: 'Secret Test Payer',
        email: 'hidden-payer@example.com',
        dataScope: 'test',
        testSessionId: sessionB,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      },
      [`users/${secretPayerId}/wallet/state`]: withScope(
        { ...wallet, accountId: secretPayerId },
        { dataScope: 'test', testSessionId: sessionB }
      ),
    };
    const liveSecret = await queryAdminFinanceReadModels(
      fakeFirestore(secretSeed),
      actor,
      { scope: 'admin_wallet', accountId: secretPayerId as typeof wallet.accountId },
      { readScope: liveScope }
    );
    expect(liveSecret.scope).toBe('admin_wallet');
    if (liveSecret.scope === 'admin_wallet') {
      expect(liveSecret.item.exists).toBe(false);
      expect(liveSecret.item.accountIdentity.displayName).toBe(secretPayerId);
      expect(liveSecret.item.accountIdentity.email).toBeUndefined();
    }
  });

  it('lists Test Actors from the registry without email classification', async () => {
    const at = canonicalCourseDeliveryFixtures.course.createdAt;
    const audit = {
      createdByCommandId: 'command_isolation_actor',
      lastChangedByCommandId: 'command_isolation_actor',
      correlationId: 'correlation_isolation_actor',
    };
    const accountId = scopedIds('account', 'testa001');
    const participantId = scopedIds('participant', 'testa001');
    const seed = {
      [`test_actors/${accountId}`]: {
        accountId,
        participantIds: [participantId],
        kind: 'test_parent',
        allowed: true,
        dataScope: 'test',
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      },
      [`users/${accountId}`]: {
        accountId,
        lifecycle: { status: 'active' },
        displayName: 'Persistent Test Parent',
        email: 'customer@example.com',
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      },
      [`test_actor_assignments/${accountId}`]: {
        accountId,
        activeTestSessionId: sessionA,
      },
    };

    const result = await queryTestSessionReadModels(fakeFirestore(seed), {
      scope: 'test_actor_directory',
      pageSize: 20,
    });
    expect(result.scope).toBe('test_actor_directory');
    if (result.scope === 'test_actor_directory') {
      expect(result.items).toEqual([
        {
          accountId,
          kind: 'test_parent',
          allowed: true,
          participantIds: [participantId],
          activeTestSessionId: sessionA,
          displayName: 'Persistent Test Parent',
        },
      ]);
    }
  });
});
