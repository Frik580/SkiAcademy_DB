import { act, renderHook } from '@testing-library/react';
import { BookingIdSchema, ParticipantIdSchema } from '@ski-academy/shared-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeMock(...args),
}));

import {
  captureAdminLessonBookingTarget,
  createAdminLessonBookingAttemptId,
  executeAdminLessonBookingAttempt,
  useAdminLessonBookingCommands,
  type AdminLessonBookingMutationAttempt,
} from '../../src/features/admin/lesson-bookings';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const target = {
  bookingId: BookingIdSchema.parse('booking_admin_command_01'),
  revision: 7,
};

describe('canonical Admin lesson booking commands', () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ status: 'success' });
  });

  it('captures the booking target and creates fresh user-action identities', () => {
    const captured = captureAdminLessonBookingTarget(target);
    const first = createAdminLessonBookingAttemptId('reschedule');
    const second = createAdminLessonBookingAttemptId('reschedule');
    expect(captured).toEqual(target);
    expect(first).not.toBe(second);
  });

  it('reuses one captured attempt identity when the caller retries', async () => {
    const attempt: AdminLessonBookingMutationAttempt = {
      kind: 'reschedule_booking',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('reschedule'),
      localDate: '2026-09-02',
      localTime: '10:30',
      durationMinutes: 60,
      timezone: 'Asia/Almaty',
      reasonExplanation: 'Customer requested a new slot',
    };
    await executeAdminLessonBookingAttempt('admin_account_01', attempt);
    await executeAdminLessonBookingAttempt('admin_account_01', attempt);

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[0]?.[1].idempotencyKey).toBe(attempt.idempotencyKey);
    expect(executeMock.mock.calls[1]?.[1].idempotencyKey).toBe(attempt.idempotencyKey);
    expect(executeMock.mock.calls[0]?.[1]).toMatchObject({
      kind: 'reschedule_booking',
      expectedRevision: 7,
      calendarInput: {
        localDate: '2026-09-02',
        localTime: '10:30',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    });
  });

  it('confirms a guest booking through the canonical command with the captured revision', async () => {
    await executeAdminLessonBookingAttempt('admin_account_01', {
      kind: 'confirm_guest_booking',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('confirm_guest'),
    });

    expect(executeMock).toHaveBeenCalledWith(
      'admin_account_01',
      expect.objectContaining({
        kind: 'confirm_guest_booking',
        intent: { bookingId: target.bookingId },
        expectedRevision: target.revision,
      })
    );
  });

  it('rejects a cancellation request without refund fields', async () => {
    await executeAdminLessonBookingAttempt('admin_account_01', {
      kind: 'resolve_booking_cancellation',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('cancel_reject'),
      paymentId: 'payment_admin_command_01',
      decision: 'reject',
      reasonExplanation: 'Lesson will still take place',
    });

    expect(executeMock).toHaveBeenCalledWith(
      'admin_account_01',
      expect.objectContaining({
        kind: 'resolve_booking_cancellation',
        intent: {
          bookingId: target.bookingId,
          decision: 'reject',
          reasonExplanation: 'Lesson will still take place',
        },
        expectedRevision: target.revision,
      })
    );
    expect(executeMock.mock.calls[0]?.[1].intent).not.toHaveProperty('refundAmount');
    expect(executeMock.mock.calls[0]?.[1].intent).not.toHaveProperty('expectedPaymentRevision');
  });

  it('reassigns an instructor through the canonical command without frontend price math', async () => {
    await executeAdminLessonBookingAttempt('admin_account_01', {
      kind: 'change_booking_instructor',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('reassign'),
      instructorId: 'instructor_admin_reassign_02',
      reasonExplanation: 'Original instructor unavailable',
    });

    const submission = executeMock.mock.calls[0]?.[1];
    expect(submission).toMatchObject({
      kind: 'change_booking_instructor',
      administratorContext: true,
      expectedRevision: target.revision,
      intent: {
        bookingId: target.bookingId,
        instructorId: 'instructor_admin_reassign_02',
        reasonExplanation: 'Original instructor unavailable',
      },
    });
    expect(submission.intent).not.toHaveProperty('fundingAmount');
    expect(submission.intent).not.toHaveProperty('price');
  });

  it('captures the Payment revision for financially relevant cancellation', async () => {
    await executeAdminLessonBookingAttempt('admin_account_01', {
      kind: 'resolve_booking_cancellation',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('cancel'),
      paymentId: 'payment_admin_command_01',
      paymentRevision: 4,
      decision: 'approve',
      refundAmount: 12_000,
      reasonExplanation: 'Approved canonical refund',
    });

    expect(executeMock).toHaveBeenCalledWith(
      'admin_account_01',
      expect.objectContaining({
        kind: 'resolve_booking_cancellation',
        intent: expect.objectContaining({
          expectedPaymentRevision: 4,
          refundAmount: 12_000,
        }),
        expectedRevision: target.revision,
      })
    );
  });

  it('uses participant-specific attendance commands and never complete_booking', async () => {
    const attempt: AdminLessonBookingMutationAttempt = {
      kind: 'record_booking_attendance',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('attendance'),
      serviceParticipantIds: [
        ParticipantIdSchema.parse('participant_admin_attendance_01'),
        ParticipantIdSchema.parse('participant_admin_attendance_02'),
      ],
      reasonExplanation: 'Instructor confirmed attendance',
    };
    await executeAdminLessonBookingAttempt('admin_account_01', attempt);

    expect(executeMock).toHaveBeenCalledTimes(2);
    const submissions = executeMock.mock.calls.map((call) => call[1]);
    expect(submissions.every((submission) => submission.kind === 'record_booking_attendance')).toBe(
      true
    );
    expect(submissions.some((submission) => submission.kind === 'complete_booking')).toBe(false);
    expect(submissions[0].idempotencyKey).not.toBe(submissions[1].idempotencyKey);
    expect(submissions.every((submission) => submission.expectedRevision === 7)).toBe(true);
  });

  it('sets administrator context and payer for create-on-behalf', async () => {
    await executeAdminLessonBookingAttempt('admin_account_01', {
      kind: 'create_confirmed_booking',
      bookingId: BookingIdSchema.parse('booking_admin_create_01'),
      idempotencyKey: createAdminLessonBookingAttemptId('create'),
      instructorId: 'instructor_admin_create_01',
      participantIds: ['participant_admin_create_01'],
      payerAccountId: 'account_admin_create_01',
      localDate: '2026-09-03',
      localTime: '09:00',
      durationMinutes: 90,
      timezone: 'Asia/Almaty',
      reasonExplanation: 'Telephone booking approved by administrator',
    });

    expect(executeMock).toHaveBeenCalledWith(
      'admin_account_01',
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        administratorContext: true,
        intent: expect.objectContaining({
          payerAccountId: 'account_admin_create_01',
        }),
      })
    );
  });

  it('refetches stale targets once and does not replay automatically', async () => {
    executeMock.mockRejectedValueOnce(
      new CanonicalCommandClientError('stale_version', {
        correlationId: 'correlation_admin_test_01',
        currentRevision: 8,
      })
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const attempt: AdminLessonBookingMutationAttempt = {
      kind: 'resolve_attendance_outcome',
      target,
      idempotencyKey: createAdminLessonBookingAttemptId('outcome'),
    };
    const { result } = renderHook(() =>
      useAdminLessonBookingCommands({
        adminAccountId: 'admin_account_01',
        refreshBooking: refresh,
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.runAttempt>> | undefined;
    await act(async () => {
      outcome = await result.current.runAttempt(attempt);
    });
    expect(outcome?.status).toBe('error');
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(target.bookingId);
  });
});
