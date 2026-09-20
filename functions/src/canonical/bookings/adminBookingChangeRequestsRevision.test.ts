import { CorrelationIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions/inMemoryTransactionExecutor';
import {
  adminBookingChangeRequestsRevisionPath,
  commitAdminBookingChangeRequestsRevisionBump,
  mergeAdminBookingChangeRequestsRevisionIntoResult,
  planAdminBookingChangeRequestsRevisionBump,
  plannedMutationsAffectAdminBookingChangeRequests,
} from './adminBookingChangeRequestsRevision';

const correlationId = CorrelationIdSchema.parse(
  'correlation_admin_booking_change_requests_revision_01'
);

describe('adminBookingChangeRequestsRevision', () => {
  it('creates and bumps the revision document inside one transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-20T12:00:00.000Z'));

    const first = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminBookingChangeRequestsRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminBookingChangeRequestsRevisionBump(session, now)?.revision;
      },
    });

    expect(first).toBe(1);
    expect(executor.snapshot().docs.get(adminBookingChangeRequestsRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });

    const second = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminBookingChangeRequestsRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminBookingChangeRequestsRevisionBump(session, now)?.revision;
      },
    });

    expect(second).toBe(2);
    expect(
      executor.snapshot().docs.get(adminBookingChangeRequestsRevisionPath())?.data.revision
    ).toBe(2);
  });

  it('commits only once when planned multiple times in the same transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-20T12:05:00.000Z'));

    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminBookingChangeRequestsRevisionBump(session);
        await planAdminBookingChangeRequestsRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminBookingChangeRequestsRevisionBump(session, now)?.revision;
      },
    });

    expect(revision).toBe(1);
    expect(
      executor.snapshot().docs.get(adminBookingChangeRequestsRevisionPath())?.data.revision
    ).toBe(1);
  });

  it('detects booking change-request aggregate writes', () => {
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: 'booking_change_requests/cr_01' }])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: '/booking_change_requests/cr_01' }])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([
        { path: 'booking_change_requests/cr_01' },
        { path: 'bookings/booking_01' },
      ])
    ).toBe(true);
  });

  it('ignores booking, payment, attendance, and issue writes', () => {
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: 'bookings/booking_01' }])
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: 'payments/pay_01' }])
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: 'attendance/att_01' }])
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: 'admin_issues/issue_01' }])
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminBookingChangeRequests([{ path: 'users/account_01/wallet/state' }])
    ).toBe(false);
  });

  it('merges the revision into an existing command payload once', () => {
    const merged = mergeAdminBookingChangeRequestsRevisionIntoResult(
      {
        status: 'success',
        kind: 'create_booking_change_request',
        correlationId,
      },
      { revision: 4 }
    );
    expect(merged).toMatchObject({
      status: 'success',
      payload: { adminBookingChangeRequestsRevision: 4 },
    });
    expect(
      mergeAdminBookingChangeRequestsRevisionIntoResult(
        {
          status: 'success',
          kind: 'resolve_booking_change_request',
          correlationId,
          payload: { adminLessonBookingsRevision: 2 },
        },
        { revision: 4 }
      )
    ).toMatchObject({
      status: 'success',
      payload: { adminLessonBookingsRevision: 2, adminBookingChangeRequestsRevision: 4 },
    });
    expect(
      mergeAdminBookingChangeRequestsRevisionIntoResult(
        {
          status: 'error',
          kind: 'withdraw_booking_change_request',
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
