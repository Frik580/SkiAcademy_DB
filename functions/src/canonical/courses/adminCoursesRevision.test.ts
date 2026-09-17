import { CorrelationIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions/inMemoryTransactionExecutor';
import {
  adminCoursesRevisionPath,
  commitAdminCoursesRevisionBump,
  mergeAdminCoursesRevisionIntoResult,
  planAdminCoursesRevisionBump,
  plannedMutationsAffectAdminCourses,
} from './adminCoursesRevision';

const correlationId = CorrelationIdSchema.parse('correlation_admin_courses_revision_01');

describe('adminCoursesRevision', () => {
  it('creates and bumps the revision document inside one transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-17T12:00:00.000Z'));

    const first = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminCoursesRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminCoursesRevisionBump(session, now)?.revision;
      },
    });

    expect(first).toBe(1);
    expect(executor.snapshot().docs.get(adminCoursesRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });

    const second = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminCoursesRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminCoursesRevisionBump(session, now)?.revision;
      },
    });

    expect(second).toBe(2);
    expect(executor.snapshot().docs.get(adminCoursesRevisionPath())?.data.revision).toBe(2);
  });

  it('commits only once when planned multiple times in the same transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-17T12:05:00.000Z'));

    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminCoursesRevisionBump(session);
        await planAdminCoursesRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminCoursesRevisionBump(session, now)?.revision;
      },
    });

    expect(revision).toBe(1);
    expect(executor.snapshot().docs.get(adminCoursesRevisionPath())?.data.revision).toBe(1);
  });

  it('detects course, enrollment, catalog, and schedule mutations', () => {
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'courses/course_01' }, { path: 'payments/pay_01' }],
        'archive_course'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses([{ path: '/courses/course_01' }], 'reactivate_course')
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'courses/course_01' }],
        'change_course_capacity'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }, { path: 'payments/pay_01' }],
        'create_course_enrollments'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }],
        'request_course_enrollment_cancellation'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }],
        'confirm_guest_course_enrollment'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }],
        'link_guest_course_enrollment_to_account_as_administrator'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }],
        'expire_guest_reservation'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_catalog_content/course_01' }],
        'update_course_catalog_content'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'courses/course_01/days/day_01' }],
        'reschedule_course_day'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminCourses(
        [
          { path: 'course_enrollments/enrollment_01' },
          { path: 'courses/course_01' },
          { path: 'payments/pay_01' },
        ],
        'create_course_enrollments'
      )
    ).toBe(true);
  });

  it('ignores attendance, payment-only, profile, and planner occupancy writes', () => {
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }, { path: 'attendance/att_01' }],
        'record_course_day_attendance'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'course_enrollments/enrollment_01' }],
        'resolve_attendance_outcome'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'payments/pay_01' }, { path: 'users/account_01/wallet/state' }],
        'record_provider_payment_event'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'payments/pay_01' }],
        'pay_service_from_wallet_as_administrator'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'participants/participant_01' }],
        'update_participant_profile'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminCourses(
        [{ path: 'administrative_availability_blocks/block_01' }],
        'create_administrative_availability_block'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminCourses([{ path: 'bookings/booking_01' }], 'reschedule_booking')
    ).toBe(false);
  });

  it('merges the revision into an existing command payload once', () => {
    const merged = mergeAdminCoursesRevisionIntoResult(
      {
        status: 'success',
        kind: 'create_course_enrollments',
        correlationId,
        payload: { outcome: 'created' },
      },
      { revision: 4 }
    );
    expect(merged).toMatchObject({
      status: 'success',
      payload: { outcome: 'created', adminCoursesRevision: 4 },
    });
    expect(
      mergeAdminCoursesRevisionIntoResult(
        {
          status: 'error',
          kind: 'create_course_enrollments',
          correlationId,
          error: {
            code: 'validation',
            message: 'The request is invalid.',
            retryable: false,
            correlationId,
          },
        },
        { revision: 4 }
      )
    ).toMatchObject({ status: 'error' });
  });
});
