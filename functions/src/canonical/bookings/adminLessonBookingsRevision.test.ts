import { CorrelationIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions/inMemoryTransactionExecutor';
import {
  adminLessonBookingsRevisionPath,
  commitAdminLessonBookingsRevisionBump,
  mergeAdminLessonBookingsRevisionIntoResult,
  planAdminLessonBookingsRevisionBump,
  plannedMutationsAffectAdminLessonBookings,
} from './adminLessonBookingsRevision';

const correlationId = CorrelationIdSchema.parse('correlation_admin_lesson_bookings_revision_01');

describe('adminLessonBookingsRevision', () => {
  it('creates and bumps the revision document inside one transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-16T12:00:00.000Z'));

    const first = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminLessonBookingsRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminLessonBookingsRevisionBump(session, now)?.revision;
      },
    });

    expect(first).toBe(1);
    expect(executor.snapshot().docs.get(adminLessonBookingsRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });

    const second = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminLessonBookingsRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminLessonBookingsRevisionBump(session, now)?.revision;
      },
    });

    expect(second).toBe(2);
    expect(executor.snapshot().docs.get(adminLessonBookingsRevisionPath())?.data.revision).toBe(2);
  });

  it('commits only once when planned multiple times in the same transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-16T12:05:00.000Z'));

    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminLessonBookingsRevisionBump(session);
        await planAdminLessonBookingsRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminLessonBookingsRevisionBump(session, now)?.revision;
      },
    });

    expect(revision).toBe(1);
    expect(executor.snapshot().docs.get(adminLessonBookingsRevisionPath())?.data.revision).toBe(1);
  });

  it('detects booking aggregate mutations and ignores attendance, payments, and issues', () => {
    expect(
      plannedMutationsAffectAdminLessonBookings([
        { path: 'bookings/booking_01' },
        { path: 'payments/pay_01' },
      ])
    ).toBe(true);
    expect(plannedMutationsAffectAdminLessonBookings([{ path: '/bookings/booking_01' }])).toBe(
      true
    );
    expect(
      plannedMutationsAffectAdminLessonBookings([
        { path: 'attendance/att_01' },
        { path: 'payments/pay_01' },
        { path: 'admin_issues/issue_01' },
      ])
    ).toBe(false);
    expect(plannedMutationsAffectAdminLessonBookings([{ path: 'booking_change_requests/cr_01' }])).toBe(
      false
    );
  });

  it('merges the revision into an existing command payload once', () => {
    const merged = mergeAdminLessonBookingsRevisionIntoResult(
      {
        status: 'success',
        kind: 'request_booking_cancellation',
        correlationId,
        payload: { lifecycleStatus: 'cancelled' },
      },
      { revision: 4 }
    );
    expect(merged).toMatchObject({
      status: 'success',
      payload: { lifecycleStatus: 'cancelled', adminLessonBookingsRevision: 4 },
    });
    expect(
      mergeAdminLessonBookingsRevisionIntoResult(
        {
          status: 'error',
          kind: 'request_booking_cancellation',
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
