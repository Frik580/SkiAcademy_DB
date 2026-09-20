import { CorrelationIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions/inMemoryTransactionExecutor';
import {
  adminPeopleRevisionPath,
  commitAdminPeopleRevisionBump,
  mergeAdminPeopleRevisionIntoResult,
  planAdminPeopleRevisionBump,
  plannedMutationsAffectAdminPeople,
} from './adminPeopleRevision';

const correlationId = CorrelationIdSchema.parse('correlation_admin_people_revision_01');

describe('adminPeopleRevision', () => {
  it('creates and bumps the revision document inside one transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-19T12:00:00.000Z'));

    const first = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminPeopleRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminPeopleRevisionBump(session, now)?.revision;
      },
    });

    expect(first).toBe(1);
    expect(executor.snapshot().docs.get(adminPeopleRevisionPath())?.data).toMatchObject({
      revision: 1,
      updatedAt: now,
    });

    const second = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminPeopleRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminPeopleRevisionBump(session, now)?.revision;
      },
    });

    expect(second).toBe(2);
    expect(executor.snapshot().docs.get(adminPeopleRevisionPath())?.data.revision).toBe(2);
  });

  it('commits only once when planned multiple times in the same transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const now = timestampFromDate(new Date('2026-09-19T12:05:00.000Z'));

    const revision = await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await planAdminPeopleRevisionBump(session);
        await planAdminPeopleRevisionBump(session);
        await session.transitionToWrites();
        return commitAdminPeopleRevisionBump(session, now)?.revision;
      },
    });

    expect(revision).toBe(1);
    expect(executor.snapshot().docs.get(adminPeopleRevisionPath())?.data.revision).toBe(1);
  });

  it('detects identity, role, instructor, and access projection writes', () => {
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'participants/participant_01' }])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([{ path: '/participants/participant_01' }])
    ).toBe(true);
    expect(plannedMutationsAffectAdminPeople([{ path: 'users/account_01' }])).toBe(true);
    expect(plannedMutationsAffectAdminPeople([{ path: '/users/account_01' }])).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'instructors/instructor_01' }])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([
        { path: 'users/account_01' },
        { path: 'instructors/instructor_01' },
      ])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'instructors/instructor_01' }])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'participant_management/management_01' }])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([
        { path: 'participant_management_active_owner/participant_01' },
      ])
    ).toBe(true);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'instructor_relationships/rel_01' }])
    ).toBe(true);
    expect(plannedMutationsAffectAdminPeople([{ path: 'participant_blocks/block_01' }])).toBe(
      true
    );
    expect(
      plannedMutationsAffectAdminPeople([
        { path: 'participants/participant_01' },
        { path: 'users/account_01' },
        { path: 'participant_management/management_01' },
      ])
    ).toBe(true);
  });

  it('ignores wallet, payment, booking, enrollment, and attendance writes', () => {
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'users/account_01/wallet/state' }])
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminPeople([{ path: '/users/account_01/wallet/state' }])
    ).toBe(false);
    expect(plannedMutationsAffectAdminPeople([{ path: 'payments/pay_01' }])).toBe(false);
    expect(plannedMutationsAffectAdminPeople([{ path: 'bookings/booking_01' }])).toBe(false);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'course_enrollments/enrollment_01' }])
    ).toBe(false);
    expect(plannedMutationsAffectAdminPeople([{ path: 'attendance/att_01' }])).toBe(false);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'participant_progress/participant_01' }])
    ).toBe(false);
    expect(
      plannedMutationsAffectAdminPeople([{ path: 'participant_achievements/participant_01' }])
    ).toBe(false);
  });

  it('merges the revision into an existing command payload once', () => {
    const merged = mergeAdminPeopleRevisionIntoResult(
      {
        status: 'success',
        kind: 'update_participant_profile',
        correlationId,
      },
      { revision: 4 }
    );
    expect(merged).toMatchObject({
      status: 'success',
      payload: { adminPeopleRevision: 4 },
    });
    expect(
      mergeAdminPeopleRevisionIntoResult(
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
      payload: { outcome: 'created', adminPeopleRevision: 4 },
    });
    expect(
      mergeAdminPeopleRevisionIntoResult(
        {
          status: 'error',
          kind: 'update_participant_profile',
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
