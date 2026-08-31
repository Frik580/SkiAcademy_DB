import { useCallback } from 'react';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  type BookingId,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../../lib/canonical/canonicalCommandClient';
import { queryAdminFinanceReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import {
  CanonicalCommandClientError,
  mapCanonicalCommandResultError,
  toCanonicalCommandClientError,
} from '../../../lib/canonical/mapCanonicalCommandError';
import type { AdminLessonBookingAttempt } from './lessonBookingAdminContracts';

async function assertCommandSucceeded<Kind extends CommandKind>(
  command: Promise<CommandResult<Kind>>
): Promise<void> {
  const result = await command;
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
}

export async function executeAdminLessonBookingAttempt(
  adminAccountId: string,
  attempt: AdminLessonBookingAttempt
): Promise<void> {
  if (attempt.kind === 'create_confirmed_booking') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId: attempt.bookingId,
          instructorId: InstructorIdSchema.parse(attempt.instructorId),
          participantIds: attempt.participantIds.map((id) => ParticipantIdSchema.parse(id)),
          payerAccountId: AccountIdSchema.parse(attempt.payerAccountId),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        calendarInput: {
          localDate: attempt.localDate,
          localTime: attempt.localTime,
          durationMinutes: attempt.durationMinutes,
        },
        timezone: attempt.timezone,
        administratorContext: true,
      })
    );
    return;
  }

  const expectedRevision = AggregateRevisionSchema.parse(attempt.target.revision);
  const bookingId = BookingIdSchema.parse(attempt.target.bookingId);

  if (attempt.kind === 'confirm_guest_booking') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: { bookingId },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
      })
    );
    return;
  }

  if (attempt.kind === 'resolve_booking_cancellation') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          decision: attempt.decision,
          ...(attempt.decision === 'approve' || attempt.decision === 'direct_cancel'
            ? {
                refundAmount: KztMinorUnitsSchema.parse(attempt.refundAmount),
                expectedPaymentRevision: AggregateRevisionSchema.parse(attempt.paymentRevision),
              }
            : {}),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
      })
    );
    return;
  }

  if (attempt.kind === 'reschedule_booking') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        calendarInput: {
          localDate: attempt.localDate,
          localTime: attempt.localTime,
          durationMinutes: attempt.durationMinutes,
        },
        timezone: attempt.timezone,
        administratorContext: true,
      })
    );
    return;
  }

  if (attempt.kind === 'change_booking_instructor') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          instructorId: InstructorIdSchema.parse(attempt.instructorId),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        administratorContext: true,
      })
    );
    return;
  }

  if (attempt.kind === 'change_booking_duration') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          durationMinutes: attempt.durationMinutes,
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        administratorContext: true,
      })
    );
    return;
  }

  if (attempt.kind === 'record_booking_attendance') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          participantId: ParticipantIdSchema.parse(attempt.participantId),
          attendanceStatus: attempt.attendanceStatus,
          ...(attempt.expectedAttendanceRevision === undefined
            ? {}
            : {
                expectedAttendanceRevision: AggregateRevisionSchema.parse(
                  attempt.expectedAttendanceRevision
                ),
              }),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        administratorContext: true,
      })
    );
    return;
  }

  if (attempt.kind === 'link_guest_booking_to_account_as_administrator') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          targetAccountId: AccountIdSchema.parse(attempt.targetAccountId),
          targetParticipantId: ParticipantIdSchema.parse(attempt.targetParticipantId),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
      })
    );
    return;
  }

  await assertCommandSucceeded(
    executeAuthenticatedCanonicalCommand(adminAccountId, {
      kind: 'resolve_attendance_outcome',
      intent: { subjectKind: 'booking', subjectId: bookingId },
      idempotencyKey: attempt.idempotencyKey,
      expectedRevision,
      administratorContext: true,
    })
  );
}

export type AdminLessonBookingAttemptResult =
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly error: CanonicalCommandClientError };

export function useAdminLessonBookingCommands(input: {
  readonly adminAccountId: string;
  readonly refreshBooking: (bookingId: BookingId) => Promise<void>;
}) {
  const { adminAccountId, refreshBooking } = input;

  const runAttempt = useCallback(
    async (attempt: AdminLessonBookingAttempt): Promise<AdminLessonBookingAttemptResult> => {
      const bookingId =
        attempt.kind === 'create_confirmed_booking' ? attempt.bookingId : attempt.target.bookingId;
      const refreshCanonicalProjections = async () => {
        await Promise.all([
          refreshBooking(bookingId),
          attempt.kind === 'resolve_booking_cancellation'
            ? queryAdminFinanceReadModels({
                scope: 'admin_payment_detail',
                paymentId: PaymentIdSchema.parse(attempt.paymentId),
              }).then(() => undefined)
            : Promise.resolve(),
        ]);
      };
      try {
        await executeAdminLessonBookingAttempt(adminAccountId, attempt);
      } catch (error) {
        const normalized =
          error instanceof CanonicalCommandClientError
            ? error
            : toCanonicalCommandClientError(error, 'correlation_admin_lesson_unknown');
        if (normalized.code === 'stale_version') {
          try {
            await refreshCanonicalProjections();
          } catch {
            // Preserve the authoritative stale-version outcome; the read hook exposes retry.
          }
        }
        return { status: 'error', error: normalized };
      }
      try {
        await refreshCanonicalProjections();
        return { status: 'success' };
      } catch (error) {
        return {
          status: 'error',
          error:
            error instanceof CanonicalCommandClientError
              ? error
              : toCanonicalCommandClientError(error, 'correlation_admin_lesson_refresh_unknown'),
        };
      }
    },
    [adminAccountId, refreshBooking]
  );

  return { runAttempt };
}
