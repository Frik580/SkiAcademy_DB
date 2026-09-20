import { CorrelationIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions/inMemoryTransactionExecutor';
import {
  adminPlannerRevisionPath,
  commitAdminPlannerRevisionBump,
  mergeAdminPlannerRevisionIntoResult,
  planAdminPlannerRevisionBump,
  plannedMutationsAffectAdminPlanner,
} from './adminPlannerRevision';

const correlationId = CorrelationIdSchema.parse('correlation_admin_planner_revision_01');

describe('adminPlannerRevision', () => {
  it('creates and bumps the revision document inside one transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-17T12:00:00.000Z'));

    const first = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminPlannerRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminPlannerRevisionBump(session, now)?.revision;
      },
    });

    expect(first).toBe(1);
    expect(executor.snapshot().docs.get(adminPlannerRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });

    const second = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminPlannerRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminPlannerRevisionBump(session, now)?.revision;
      },
    });

    expect(second).toBe(2);
    expect(executor.snapshot().docs.get(adminPlannerRevisionPath())?.data.revision).toBe(2);
  });

  it('commits only once when planned multiple times in the same transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-17T12:05:00.000Z'));

    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminPlannerRevisionBump(session);
        await planAdminPlannerRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminPlannerRevisionBump(session, now)?.revision;
      },
    });

    expect(revision).toBe(1);
    expect(executor.snapshot().docs.get(adminPlannerRevisionPath())?.data.revision).toBe(1);
  });

  it('detects planner occupancy mutations and ignores attendance, payments, and issues', () => {
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'bookings/booking_01' }, { path: 'resource_claims/claim_01' }],
        'reschedule_booking'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: '/bookings/booking_01' }],
        'create_confirmed_booking'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'bookings/booking_01' }],
        'resolve_booking_cancellation'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'bookings/booking_01' }],
        'change_booking_instructor'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'bookings/booking_01' }],
        'change_booking_duration'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'administrative_availability_blocks/block_01' }],
        'create_administrative_availability_block'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'courses/course_01/days/day_01' }],
        'reschedule_course_day'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [
          { path: 'bookings/booking_01' },
          { path: 'booking_change_requests/cr_01' },
          { path: 'resource_claims/claim_01' },
        ],
        'reschedule_booking'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner([{ path: 'courses/course_01' }], 'archive_course')
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'instructors/instructor_01' }],
        'delete_instructor_catalog_entry'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'attendance/att_01' }, { path: 'bookings/booking_01' }],
        'record_booking_attendance'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'bookings/booking_01' }],
        'finalize_booking_attendance'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminPlanner([{ path: 'bookings/booking_01' }], 'complete_booking')
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminPlanner(
        [{ path: 'payments/pay_01' }, { path: 'users/account_01/wallet/state' }],
        'record_provider_payment_event'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminPlanner([{ path: 'admin_issues/issue_01' }], 'record_booking_attendance')
    ).toBe(false);
  });

  it('merges the revision into an existing command payload once', () => {
    const merged = mergeAdminPlannerRevisionIntoResult(
      {
        status: 'success',
        kind: 'reschedule_booking',
        correlationId,
      },
      { revision: 4 }
    );
    expect(merged).toMatchObject({
      status: 'success',
      payload: { adminPlannerRevision: 4 },
    });
    expect(
      mergeAdminPlannerRevisionIntoResult(
        {
          status: 'error',
          kind: 'reschedule_booking',
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
