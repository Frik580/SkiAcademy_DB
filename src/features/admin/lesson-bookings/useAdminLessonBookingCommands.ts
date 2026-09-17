import { useCallback } from 'react';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  canonicalDeterministicHash,
  InstructorIdSchema,
  IanaTimeZoneSchema,
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
import { applyAdminFinanceCommandResult } from '../finance/adminFinanceLocalSync';
import { applyAdminIssueInboxCommandResult } from '../issues/adminIssueInboxLocalSync';
import { applyAdminLessonBookingsCommandResult } from './adminLessonBookingsLocalSync';
import type {
  AdminLessonBookingAttempt,
  AdminLessonBookingRefreshResult,
} from './lessonBookingAdminContracts';

async function assertCommandSucceeded<Kind extends CommandKind>(
  command: Promise<CommandResult<Kind>>
): Promise<CommandResult<Kind>> {
  const result = await command;
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
  applyAdminIssueInboxCommandResult(result);
  applyAdminLessonBookingsCommandResult(result);
  applyAdminFinanceCommandResult(result);
  return result;
}

export async function executeAdminLessonBookingAttempt(
  adminAccountId: string,
  attempt: AdminLessonBookingAttempt
): Promise<CommandResult> {
  if (attempt.kind === 'create_confirmed_booking') {
    return assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId: attempt.bookingId,
          instructorId: InstructorIdSchema.parse(attempt.instructorId),
          participantIds: attempt.participantIds.map((id) => ParticipantIdSchema.parse(id)),
          payerAccountId: AccountIdSchema.parse(attempt.payerAccountId),
          reasonExplanation: attempt.reasonExplanation,
          ...(attempt.difficulty !== undefined ? { difficulty: attempt.difficulty } : {}),
          ...(attempt.notes ? { notes: attempt.notes } : {}),
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
  }

  if (attempt.kind === 'record_provider_payment_event') {
    return assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          paymentId: PaymentIdSchema.parse(attempt.paymentId),
          amount: KztMinorUnitsSchema.parse(attempt.amount),
          sourceKind: 'cash',
          manualReference: `admin-cash:${canonicalDeterministicHash([
            'admin_guest_cash:v1',
            attempt.target.bookingId,
            attempt.idempotencyKey,
          ])}`,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision: AggregateRevisionSchema.parse(attempt.paymentRevision),
      })
    );
  }

  if (attempt.kind === 'pay_service_from_wallet_as_administrator') {
    return assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          subjectKind: 'booking',
          bookingId: BookingIdSchema.parse(attempt.target.bookingId),
        },
        idempotencyKey: attempt.idempotencyKey,
      })
    );
  }

  const expectedRevision = AggregateRevisionSchema.parse(attempt.target.revision);
  const bookingId = BookingIdSchema.parse(attempt.target.bookingId);

  if (attempt.kind === 'resolve_booking_cancellation') {
    return assertCommandSucceeded(
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
  }

  if (attempt.kind === 'reschedule_booking') {
    return assertCommandSucceeded(
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
  }

  if (attempt.kind === 'change_booking_instructor') {
    return assertCommandSucceeded(
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
  }

  if (attempt.kind === 'change_booking_duration') {
    return assertCommandSucceeded(
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
  }

  if (attempt.kind === 'finalize_booking_attendance') {
    return assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingId,
          attendance: attempt.attendance.map((entry) => ({
            participantId: ParticipantIdSchema.parse(entry.participantId),
            attendanceStatus: entry.attendanceStatus,
            ...(entry.expectedAttendanceRevision === undefined
              ? {}
              : {
                  expectedAttendanceRevision: AggregateRevisionSchema.parse(
                    entry.expectedAttendanceRevision
                  ),
                }),
          })),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        administratorContext: true,
      })
    );
  }

  if (attempt.kind === 'record_booking_attendance') {
    return assertCommandSucceeded(
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
  }

  if (attempt.kind === 'resolve_booking_change_request') {
    return assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          bookingChangeRequestId: BookingChangeRequestIdSchema.parse(
            attempt.bookingChangeRequestId
          ),
          resolution: attempt.resolution,
          ...(attempt.refundAmount === undefined
            ? {}
            : { refundAmount: KztMinorUnitsSchema.parse(attempt.refundAmount) }),
          ...(attempt.reasonExplanation ? { reasonExplanation: attempt.reasonExplanation } : {}),
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision: AggregateRevisionSchema.parse(attempt.requestRevision),
        ...(attempt.resolution === 'no_change' ? {} : { bookingRevision: expectedRevision }),
        ...(attempt.resolution === 'rescheduled'
          ? {
              calendarInput: {
                localDate: attempt.localDate!,
                localTime: attempt.localTime!,
                durationMinutes: attempt.durationMinutes!,
              },
              timezone: IanaTimeZoneSchema.parse(attempt.timezone),
            }
          : {}),
        administratorContext: true,
      })
    );
  }

  if (attempt.kind === 'link_guest_booking_to_account_as_administrator') {
    return assertCommandSucceeded(
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
  }

  throw new Error(
    `Unsupported admin lesson booking attempt: ${(attempt as { kind: string }).kind}`
  );
}

export type AdminLessonBookingAttemptResult =
  | { readonly status: 'success'; readonly refreshFailed?: boolean }
  | { readonly status: 'error'; readonly error: CanonicalCommandClientError };

export function useAdminLessonBookingCommands(input: {
  readonly adminAccountId: string;
  readonly refreshBooking: (bookingId: BookingId) => Promise<AdminLessonBookingRefreshResult>;
}) {
  const { adminAccountId, refreshBooking } = input;

  const runAttempt = useCallback(
    async (attempt: AdminLessonBookingAttempt): Promise<AdminLessonBookingAttemptResult> => {
      const bookingId =
        attempt.kind === 'create_confirmed_booking' ? attempt.bookingId : attempt.target.bookingId;
      const refreshCanonicalProjections = async (): Promise<AdminLessonBookingRefreshResult> => {
        try {
          const bookingRefresh = await refreshBooking(bookingId);
          if (bookingRefresh.status !== 'success') return { status: 'failure' };
          if (
            attempt.kind === 'resolve_booking_cancellation' ||
            attempt.kind === 'record_provider_payment_event' ||
            attempt.kind === 'pay_service_from_wallet_as_administrator'
          ) {
            await queryAdminFinanceReadModels({
              scope: 'admin_payment_detail',
              paymentId: PaymentIdSchema.parse(attempt.paymentId),
            });
          }
          return { status: 'success' };
        } catch {
          return { status: 'failure' };
        }
      };
      try {
        await executeAdminLessonBookingAttempt(adminAccountId, attempt);
      } catch (error) {
        const normalized =
          error instanceof CanonicalCommandClientError
            ? error
            : toCanonicalCommandClientError(error, 'correlation_admin_lesson_unknown');
        if (normalized.code === 'stale_version') {
          await refreshCanonicalProjections();
        }
        return { status: 'error', error: normalized };
      }
      const refreshResult = await refreshCanonicalProjections();
      if (refreshResult.status === 'success') {
        return { status: 'success' };
      }
      if (
        attempt.kind === 'record_provider_payment_event' ||
        attempt.kind === 'pay_service_from_wallet_as_administrator'
      ) {
        return { status: 'success', refreshFailed: true };
      }
      return {
        status: 'error',
        error: toCanonicalCommandClientError(
          new Error('canonical projections refresh failed'),
          'correlation_admin_lesson_refresh_unknown'
        ),
      };
    },
    [adminAccountId, refreshBooking]
  );

  return { runAttempt };
}
