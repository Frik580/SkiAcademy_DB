'use strict';

const domain = require('@ski-academy/shared-domain');
const { hash } = require('./inventory.cjs');
const ADAPTERS = Object.freeze({
  courseCapacity: 1,
  adminRuntime: 1,
  lessonRevenue: 1,
  storage: 1,
  legacy: 1,
  stagingLiveFixtures: 1,
});
const RUNTIME_IDS = [
  'admin_people',
  'admin_courses',
  'admin_finance',
  'admin_planner',
  'admin_lesson_bookings',
  'admin_issue_inbox',
  'admin_booking_change_requests',
];
const ACTIVE_SEATS = new Set(['pending', 'confirmed', 'pending_cancellation']);

// One source-verified historical schema (src/types/user.ts). Other legacy
// collections and unscoped/USD variants remain unsupported, never guessed.
function knownLegacyLedger(row, selection) {
  if (!row.path.startsWith('wallet_ledger/')) return false;
  const data = row.data;
  const fields = [
    'id',
    'userId',
    'amount',
    'balanceAfter',
    'currency',
    'type',
    'subjectName',
    'bookingId',
    'courseId',
    'createdAt',
    'dataScope',
    'testSessionId',
  ];
  return (
    Object.keys(data).every((k) => fields.includes(k)) &&
    data.id === row.path.split('/')[1] &&
    data.dataScope === 'test' &&
    selection.testSessionIds.includes(data.testSessionId) &&
    selection.accountIds.includes(data.userId) &&
    data.currency === 'KZT' &&
    Number.isSafeInteger(data.amount) &&
    Number.isSafeInteger(data.balanceAfter) &&
    data.balanceAfter >= 0 &&
    [
      'top_up',
      'starter_credit',
      'lesson_payment',
      'course_payment',
      'refund',
      'admin_adjustment',
      'guest_payment',
    ].includes(data.type) &&
    typeof data.createdAt === 'string' &&
    !Number.isNaN(Date.parse(data.createdAt))
  );
}

function derivedAction(row, path, set, reason, phase) {
  const data = row?.data ?? {};
  return {
    path,
    kind: row ? 'patch' : 'create',
    beforeHash: row?.hash ?? null,
    afterHash: hash({ ...data, ...set }),
    set,
    remove: [],
    reason,
    phase,
  };
}

/** All source inventory is bounded and manifest-bound. Do not run the existing
 * full revenue reconciler here: it has an independent lock and unmanifested writes. */
function projectionActions(snapshot, actions, now, blockers) {
  const byPath = new Map(snapshot.rows.map((r) => [r.path, r]));
  const deleted = new Set(actions.filter((a) => a.kind === 'delete').map((a) => a.path));
  const affectedCourses = new Set(
    snapshot.rows
      .filter((r) => deleted.has(r.path) && r.path.startsWith('course_enrollments/'))
      .map((r) => r.data.courseId)
  );
  const result = [];
  for (const id of affectedCourses) {
    const path = `courses/${id}`;
    const row = byPath.get(path);
    try {
      const course = domain.CourseSchema.parse(domain.normalizeFirestoreDocument(row?.data));
      if (course.courseId !== id) throw Error('course identity mismatch');
      if (domain.isCourseCapacityFrozen({ now, courseStartAt: course.startAt }))
        throw Error('frozen capacity: owner decision requires separate approval');
      let occupied = 0;
      const participants = new Set();
      for (const source of snapshot.rows.filter(
        (r) => r.path.startsWith('course_enrollments/') && r.data.courseId === id
      )) {
        const enrollment = domain.CourseEnrollmentSchema.parse(
          domain.normalizeFirestoreDocument(source.data)
        );
        if (enrollment.enrollmentId !== source.path.split('/')[1])
          throw Error('Enrollment identity/path mismatch');
        domain.assertSameCanonicalScope(
          domain.parsePersistedCanonicalScope(course),
          domain.parsePersistedCanonicalScope(enrollment)
        );
        if (!deleted.has(source.path) && ACTIVE_SEATS.has(enrollment.lifecycle.status)) {
          if (participants.has(enrollment.participantId))
            throw Error('duplicate remaining Participant enrollment');
          participants.add(enrollment.participantId);
          occupied++;
        }
      }
      if (occupied > course.capacity.totalSeats)
        throw Error('remaining occupancy exceeds totalSeats');
      result.push(
        derivedAction(
          row,
          path,
          {
            capacity: { ...course.capacity, availableSeats: course.capacity.totalSeats - occupied },
            revision: course.revision + 1,
            updatedAt: now,
          },
          'rebuild pre-start capacity from remaining canonical Enrollment; catalog preserved',
          2
        )
      );
      result[result.length - 1].notAfter = course.startAt;
    } catch (error) {
      blockers.push(`Course capacity rebuild blocked: ${path}: ${error.message}`);
    }
  }

  // Recompute every affected summary from remaining *canonical* sources, not by
  // subtracting a guessed cached amount. Include stale summaries with zero sources.
  const affectedSummaries = new Set();
  const desired = new Map();
  for (const row of snapshot.rows) {
    if (/^instructor_lesson_revenue\/[^/]+\/instructors\/[^/]+$/.test(row.path))
      affectedSummaries.add(row.path);
    if (row.path.startsWith('instructor_lesson_revenue_contributions/')) {
      if (typeof row.data.summaryPath !== 'string') {
        blockers.push(`Invalid revenue contribution: ${row.path}`);
        continue;
      }
      affectedSummaries.add(row.data.summaryPath);
      if (deleted.has(`bookings/${row.path.split('/')[1]}`) && !deleted.has(row.path))
        blockers.push(`Unselected revenue contribution: ${row.path}`);
      if (!deleted.has(row.path) && !byPath.has(`bookings/${row.path.split('/')[1]}`))
        blockers.push(`Orphan revenue contribution: ${row.path}`);
    }
  }
  if (
    [...deleted].some((p) =>
      /^(bookings|payments|instructor_lesson_revenue_contributions)\//.test(p)
    )
  ) {
    const {
      completedLessonRevenueContribution,
    } = require('../../lib/canonical/readModels/instructorLessonRevenueProjection.js');
    for (const row of snapshot.rows.filter(
      (r) =>
        r.path.startsWith('bookings/') && r.path.split('/').length === 2 && !deleted.has(r.path)
    )) {
      try {
        const payment = byPath.get(`payments/${row.data.paymentId}`);
        const value = completedLessonRevenueContribution(
          row.path.split('/')[1],
          row.data,
          payment && !deleted.has(payment.path) ? payment.data : undefined
        );
        if (!value || value.unavailableCount !== 0)
          throw Error('canonical revenue source unavailable');
        affectedSummaries.add(value.summaryPath);
        const sum = desired.get(value.summaryPath) ?? { retainedAmount: 0, unavailableCount: 0 };
        sum.retainedAmount += value.retainedAmount;
        desired.set(value.summaryPath, sum);
        const contributionPath = `instructor_lesson_revenue_contributions/${row.path.split('/')[1]}`;
        const contribution = byPath.get(contributionPath);
        if (!contribution || hash(contribution.data) !== hash(value))
          result.push(
            derivedAction(
              contribution,
              contributionPath,
              value,
              'rebuild contribution from remaining canonical Booking/Payment',
              3
            )
          );
      } catch (error) {
        blockers.push(`Revenue rebuild blocked: ${row.path}: ${error.message}`);
      }
    }
    for (const path of affectedSummaries) {
      if (
        !/^instructor_lesson_revenue\/(live|test_[A-Za-z0-9_-]+)\/instructors\/[A-Za-z0-9_-]+$/.test(
          path
        )
      ) {
        blockers.push(`Invalid revenue summary path: ${path}`);
        continue;
      }
      const row = byPath.get(path);
      try {
        if (row) domain.InstructorLessonRevenueSummarySchema.parse(row.data);
        const summary = domain.InstructorLessonRevenueSummarySchema.parse({
          ...(desired.get(path) ?? { retainedAmount: 0, unavailableCount: 0 }),
          revision: (row?.data.revision ?? 0) + 1,
        });
        result.push(
          derivedAction(
            row,
            path,
            summary,
            'rebuild instructor revenue sum from retained canonical sources',
            3
          )
        );
      } catch {
        blockers.push(`Invalid revenue summary: ${path}`);
      }
    }
    const state = byPath.get('instructor_lesson_revenue/state');
    if (
      state &&
      (Object.keys(state.data).some((k) => k !== 'ready') || typeof state.data.ready !== 'boolean')
    )
      blockers.push('Unknown revenue readiness state');
    else if (!state || state.data.ready !== true)
      result.push(
        derivedAction(
          state,
          'instructor_lesson_revenue/state',
          { ready: true },
          'publish readiness after complete manifest-bound revenue rebuild',
          4
        )
      );
  }
  if (deleted.size) {
    for (const id of RUNTIME_IDS) {
      const path = `admin_runtime/${id}`;
      const row = byPath.get(path);
      if (
        row &&
        !domain.AdminPlannerRevisionDocumentSchema.safeParse(
          domain.normalizeFirestoreDocument(row.data)
        ).success
      ) {
        blockers.push(`Unknown admin runtime shape: ${path}`);
        continue;
      }
      const revision = (row?.data.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) {
        blockers.push(`Runtime revision overflow: ${path}`);
        continue;
      }
      result.push(
        derivedAction(
          row,
          path,
          { revision, updatedAt: now },
          'invalidate shared admin read caches using canonical monotonic revision',
          4
        )
      );
    }
  }
  return result;
}

function assertCourseWindows(manifest, nowMs = Date.now()) {
  for (const action of manifest.actions.filter((a) => a.phase === 2)) {
    const start = action.notAfter;
    if (
      !start ||
      !Number.isSafeInteger(start.seconds) ||
      nowMs >= start.seconds * 1000 + start.nanoseconds / 1000000
    )
      throw Error(
        'BLOCKED: Course capacity frozen during apply/resume; recovery requires separate decision'
      );
  }
}

module.exports = {
  ADAPTERS,
  RUNTIME_IDS,
  projectionActions,
  knownLegacyLedger,
  assertCourseWindows,
};
