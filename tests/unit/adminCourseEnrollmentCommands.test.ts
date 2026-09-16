import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeMock(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminFinanceReadModels: vi.fn().mockResolvedValue({ scope: 'admin_payment_detail' }),
}));

import {
  captureAdminCourseEnrollmentTarget,
  createAdminCourseEnrollmentAttemptId,
  executeAdminCourseEnrollmentAttempt,
} from '../../src/features/admin/course-enrollments';
import type { AdminCourseEnrollmentDetailReadModel } from '@ski-academy/shared-domain';

const target = {
  enrollmentId: 'course_enrollment_admin_payment_01',
  revision: 4,
  courseId: 'course_admin_payment_01',
  paymentId: 'payment_admin_course_01',
};

describe('canonical Admin course enrollment payment commands', () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ status: 'success' });
  });

  it('records Admin cash against the CourseEnrollment Payment revision', async () => {
    const idempotencyKey = createAdminCourseEnrollmentAttemptId('record_guest_payment');
    await executeAdminCourseEnrollmentAttempt('admin_account_01', {
      kind: 'record_provider_payment_event',
      target,
      idempotencyKey,
      paymentRevision: 6,
      amount: 15_000,
    });

    expect(executeMock).toHaveBeenCalledWith(
      'admin_account_01',
      expect.objectContaining({
        kind: 'record_provider_payment_event',
        idempotencyKey,
        expectedRevision: 6,
        intent: expect.objectContaining({
          paymentId: 'payment_admin_course_01',
          amount: 15_000,
          sourceKind: 'cash',
          manualReference: expect.stringMatching(/^admin-cash:/),
        }),
      })
    );
  });

  it('replays the same capture identity without minting a second command key', async () => {
    const attempt = {
      kind: 'record_provider_payment_event' as const,
      target,
      idempotencyKey: createAdminCourseEnrollmentAttemptId('record_guest_payment'),
      paymentRevision: 6,
      amount: 15_000,
    };
    await executeAdminCourseEnrollmentAttempt('admin_account_01', attempt);
    await executeAdminCourseEnrollmentAttempt('admin_account_01', attempt);
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[0]?.[1].idempotencyKey).toBe(attempt.idempotencyKey);
    expect(executeMock.mock.calls[1]?.[1].idempotencyKey).toBe(attempt.idempotencyKey);
  });

  it('pays a linked unpaid enrollment from the canonical wallet without a client amount', async () => {
    const idempotencyKey = createAdminCourseEnrollmentAttemptId(
      'pay_service_from_wallet_as_administrator'
    );
    await executeAdminCourseEnrollmentAttempt('admin_account_01', {
      kind: 'pay_service_from_wallet_as_administrator',
      target,
      idempotencyKey,
      paymentRevision: 6,
    });

    expect(executeMock).toHaveBeenCalledWith(
      'admin_account_01',
      expect.objectContaining({
        kind: 'pay_service_from_wallet_as_administrator',
        idempotencyKey,
        intent: {
          subjectKind: 'course_enrollment',
          enrollmentId: target.enrollmentId,
        },
      })
    );
    expect(executeMock.mock.calls[0]?.[1]).not.toHaveProperty('expectedRevision');
    expect(executeMock.mock.calls[0]?.[1].intent).not.toHaveProperty('amount');
  });

  it('captures enrollment identity independently of a selected roster row', () => {
    const captured = captureAdminCourseEnrollmentTarget({
      enrollmentId: target.enrollmentId,
      revision: target.revision,
      course: { courseId: target.courseId },
      paymentId: target.paymentId,
    } as unknown as AdminCourseEnrollmentDetailReadModel);
    expect(captured).toEqual(target);
  });
});
