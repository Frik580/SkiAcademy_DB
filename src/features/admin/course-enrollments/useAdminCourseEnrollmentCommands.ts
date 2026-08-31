import { useCallback } from 'react';
import {
  AggregateRevisionSchema,
  AccountIdSchema,
  CourseEnrollmentIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  type CourseEnrollmentId,
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
import type { AdminCourseEnrollmentAttempt } from './adminCourseEnrollmentContracts';

async function assertCommandSucceeded<Kind extends CommandKind>(
  command: Promise<CommandResult<Kind>>
): Promise<void> {
  const result = await command;
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
}

export async function executeAdminCourseEnrollmentAttempt(
  adminAccountId: string,
  attempt: AdminCourseEnrollmentAttempt
): Promise<void> {
  if (attempt.kind === 'create_course_enrollments') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          courseId: CourseIdSchema.parse(attempt.courseId),
          participantIds: [ParticipantIdSchema.parse(attempt.participantId)],
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision: AggregateRevisionSchema.parse(attempt.courseRevision),
        administratorContext: true,
      })
    );
    return;
  }

  const courseEnrollmentId = CourseEnrollmentIdSchema.parse(attempt.target.enrollmentId);
  const expectedRevision = AggregateRevisionSchema.parse(attempt.target.revision);
  if (attempt.kind === 'resolve_course_enrollment_cancellation') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          courseEnrollmentId,
          decision: attempt.decision,
          ...(attempt.decision === 'approve'
            ? { refundAmount: KztMinorUnitsSchema.parse(attempt.refundAmount) }
            : {}),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
      })
    );
    return;
  }
  if (attempt.kind === 'transfer_course_enrollment') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          courseEnrollmentId,
          targetCourseId: CourseIdSchema.parse(attempt.targetCourseId),
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
      })
    );
    return;
  }
  if (attempt.kind === 'record_course_day_attendance') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          courseEnrollmentId,
          courseDayId: CourseDayIdSchema.parse(attempt.courseDayId),
          attendanceStatus: attempt.attendanceStatus,
          ...(attempt.expectedAttendanceRevision === undefined
            ? {}
            : {
                expectedAttendanceRevision: AggregateRevisionSchema.parse(
                  attempt.expectedAttendanceRevision
                ),
              }),
          expectedEnrollmentRevision: expectedRevision,
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        administratorContext: true,
      })
    );
    return;
  }
  if (attempt.kind === 'resolve_attendance_outcome') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: { subjectKind: 'course_enrollment', subjectId: courseEnrollmentId },
        idempotencyKey: attempt.idempotencyKey,
        expectedRevision,
        administratorContext: true,
      })
    );
    return;
  }
  if (attempt.kind === 'link_guest_course_enrollment_to_account_as_administrator') {
    await assertCommandSucceeded(
      executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: attempt.kind,
        intent: {
          enrollmentId: courseEnrollmentId,
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
      kind: attempt.kind,
      intent: { courseEnrollmentId },
      idempotencyKey: attempt.idempotencyKey,
      expectedRevision,
    })
  );
}

export type AdminCourseEnrollmentAttemptResult =
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly error: CanonicalCommandClientError };

export function useAdminCourseEnrollmentCommands(input: {
  readonly adminAccountId: string;
  readonly refreshList: () => Promise<void>;
  readonly refreshEnrollment: (enrollmentId: CourseEnrollmentId) => Promise<void>;
  readonly refreshCourses: () => Promise<void>;
}) {
  const { adminAccountId, refreshList, refreshEnrollment, refreshCourses } = input;
  const runAttempt = useCallback(
    async (attempt: AdminCourseEnrollmentAttempt): Promise<AdminCourseEnrollmentAttemptResult> => {
      const refresh = async () => {
        await Promise.all([refreshList(), refreshCourses()]);
        if (attempt.kind === 'create_course_enrollments') {
          return;
        }
        await refreshEnrollment(attempt.target.enrollmentId);
        await queryAdminFinanceReadModels({
          scope: 'admin_payment_detail',
          paymentId: PaymentIdSchema.parse(attempt.target.paymentId),
        });
      };
      try {
        await executeAdminCourseEnrollmentAttempt(adminAccountId, attempt);
        await refresh();
        return { status: 'success' };
      } catch (error) {
        const normalized =
          error instanceof CanonicalCommandClientError
            ? error
            : toCanonicalCommandClientError(error, 'correlation_admin_course_enrollment_unknown');
        if (normalized.code === 'stale_version') {
          try {
            await refresh();
          } catch {
            // Keep the authoritative stale outcome; the read state exposes retry.
          }
        }
        return { status: 'error', error: normalized };
      }
    },
    [adminAccountId, refreshCourses, refreshEnrollment, refreshList]
  );
  return { runAttempt };
}
