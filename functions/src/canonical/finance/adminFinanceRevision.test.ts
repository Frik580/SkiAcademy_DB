import { CorrelationIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions/inMemoryTransactionExecutor';
import {
  adminFinanceRevisionPath,
  commitAdminFinanceRevisionBump,
  mergeAdminFinanceRevisionIntoResult,
  planAdminFinanceRevisionBump,
  plannedMutationsAffectAdminFinance,
} from './adminFinanceRevision';

const correlationId = CorrelationIdSchema.parse('correlation_admin_finance_revision_01');

describe('adminFinanceRevision', () => {
  it('creates and bumps the revision document inside one transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-17T12:00:00.000Z'));

    const first = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminFinanceRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminFinanceRevisionBump(session, now)?.revision;
      },
    });

    expect(first).toBe(1);
    expect(executor.snapshot().docs.get(adminFinanceRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });

    const second = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminFinanceRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminFinanceRevisionBump(session, now)?.revision;
      },
    });

    expect(second).toBe(2);
    expect(executor.snapshot().docs.get(adminFinanceRevisionPath())?.data.revision).toBe(2);
  });

  it('commits only once when planned multiple times in the same transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-17T12:05:00.000Z'));

    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminFinanceRevisionBump(session);
        await planAdminFinanceRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminFinanceRevisionBump(session, now)?.revision;
      },
    });

    expect(revision).toBe(1);
    expect(executor.snapshot().docs.get(adminFinanceRevisionPath())?.data.revision).toBe(1);
  });

  it('detects payment, wallet, and monetary-event projection writes', () => {
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'payments/pay_01' }],
        'record_provider_payment_event'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: '/payments/pay_01' }],
        'record_provider_payment_event'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'users/account_01/wallet/state' }],
        'record_manual_wallet_funding'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: '/users/account_01/wallet/state' }],
        'record_manual_wallet_funding'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'monetary_events/event_01' }],
        'record_financial_correction'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [
          { path: 'payments/pay_01' },
          { path: 'users/account_01/wallet/state' },
          { path: 'monetary_events/event_01' },
        ],
        'pay_service_from_wallet_as_administrator'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'payments/pay_01' }, { path: 'bookings/booking_01' }],
        'resolve_booking_cancellation'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'users/account_01/wallet/state' }],
        'record_audit_correction'
      )
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'payments/pay_01' }],
        'create_course_enrollments'
      )
    ).toBe(true);
  });

  it('ignores booking-only, attendance, profile, and internal receipt writes', () => {
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'bookings/booking_01' }],
        'reschedule_booking'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'bookings/booking_01' }, { path: 'resource_claims/claim_01' }],
        'reschedule_booking'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'payments/pay_01' }, { path: 'attendance/att_01' }],
        'record_booking_attendance'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'payments/pay_01' }],
        'finalize_booking_attendance'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'course_enrollments/enrollment_01' }, { path: 'attendance/att_01' }],
        'record_course_day_attendance'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'payments/pay_01' }],
        'resolve_attendance_outcome'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'participants/participant_01' }],
        'update_participant_profile'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'provider_event_receipts/receipt_01' }],
        'record_provider_payment_event'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'administrative_availability_blocks/block_01' }],
        'create_administrative_availability_block'
      )
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminFinance(
        [{ path: 'courses/course_01' }],
        'archive_course'
      )
    ).toBe(false);
  });

  it('merges the revision into an existing command payload once', () => {
    const merged = mergeAdminFinanceRevisionIntoResult(
      {
        status: 'success',
        kind: 'record_manual_wallet_funding',
        correlationId,
      },
      { revision: 4 }
    );
    expect(merged).toMatchObject({
      status: 'success',
      payload: { adminFinanceRevision: 4 },
    });
    expect(
      mergeAdminFinanceRevisionIntoResult(
        {
          status: 'success',
          kind: 'create_course_enrollments',
          correlationId,
          payload: { outcome: 'created' },
        },
        { revision: 4 }
      )
    ).toMatchObject({
      status: 'success',
      payload: { outcome: 'created', adminFinanceRevision: 4 },
    });
    expect(
      mergeAdminFinanceRevisionIntoResult(
        {
          status: 'error',
          kind: 'record_manual_wallet_funding',
          correlationId,
          error: {
            code: 'insufficient_funds',
            message: 'The wallet has insufficient funds.',
            retryable: false,
            correlationId,
          },
        },
        { revision: 4 }
      )
    ).toMatchObject({ status: 'error' });
  });
});
