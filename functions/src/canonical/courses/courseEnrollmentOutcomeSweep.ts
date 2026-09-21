import {
  addMillisecondsToCanonicalTimestamp,
  compareCanonicalTimestamps,
  timestampFromDate,
  type CommandResult,
  type CanonicalExecutionScope,
} from '@ski-academy/shared-domain';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { createBookingAttendanceCommandHandlers } from '../bookings/bookingAttendanceCommands';
import {
  COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION,
  CourseEnrollmentOutcomeWorkSchema,
  blockPendingCourseEnrollmentOutcomeWork,
  completePendingCourseEnrollmentOutcomeWork,
  parseCourseEnrollmentOutcomeWork,
  resolveCourseEnrollmentOutcomeEnvelope,
  type PendingCourseEnrollmentOutcomeWork,
} from './courseEnrollmentOutcomeWork';
import { resolveWorkerExecutionScope } from '../testSessions/workerExecutionScope';

export const COURSE_ENROLLMENT_OUTCOME_SWEEP_PAGE_SIZE = 25;
export const COURSE_ENROLLMENT_OUTCOME_SWEEP_MAX_CANDIDATES = 25;
export const COURSE_ENROLLMENT_OUTCOME_RETRY_BASE_MS = 5 * 60 * 1_000;
export const COURSE_ENROLLMENT_OUTCOME_RETRY_MAX_MS = 60 * 60 * 1_000;

export type CourseEnrollmentOutcomeSweepCandidateOutcome =
  | 'processed'
  | 'lifecycle_ineligible'
  | 'future_skipped'
  | 'invalid_work'
  | 'retry_scheduled'
  | 'session_inactive_skipped';

export interface CourseEnrollmentOutcomeSweepResult {
  readonly candidateDocsRead: number;
  readonly processed: number;
  readonly lifecycleIneligible: number;
  readonly invalid: number;
  readonly retried: number;
  readonly futureSkipped: number;
  readonly inactiveSessionSkipped: number;
  readonly truncated: boolean;
  readonly outcomes: readonly {
    readonly enrollmentId: string;
    readonly outcome: CourseEnrollmentOutcomeSweepCandidateOutcome;
  }[];
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(
    COURSE_ENROLLMENT_OUTCOME_RETRY_MAX_MS,
    COURSE_ENROLLMENT_OUTCOME_RETRY_BASE_MS * 2 ** Math.min(attemptCount, 8)
  );
}

async function updatePendingWorkIfCurrent(
  firestore: Firestore,
  expected: PendingCourseEnrollmentOutcomeWork,
  next: Record<string, unknown>
): Promise<void> {
  const ref = firestore
    .collection(COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION)
    .doc(expected.enrollmentId);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = parseCourseEnrollmentOutcomeWork(
      snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
    );
    if (
      !current ||
      current.status !== 'pending' ||
      current.workRevision !== expected.workRevision
    ) {
      return;
    }
    transaction.set(ref, next);
  });
}

function commandOutcome(
  result: CommandResult<'resolve_attendance_outcome'>
): 'processed' | 'lifecycle_ineligible' | 'invalid' | 'retry' {
  if (result.status === 'success') return 'processed';
  if (result.error.code === 'invalid_transition') return 'lifecycle_ineligible';
  if (result.error.code === 'validation') return 'invalid';
  return 'retry';
}

async function processCandidate(
  firestore: Firestore,
  snapshot: DocumentSnapshot,
  nowDate: Date,
  execute: (
    envelope: ReturnType<typeof resolveCourseEnrollmentOutcomeEnvelope>,
    scope: CanonicalExecutionScope
  ) => Promise<CommandResult<'resolve_attendance_outcome'>>
): Promise<{
  readonly enrollmentId: string;
  readonly outcome: CourseEnrollmentOutcomeSweepCandidateOutcome;
}> {
  const work = parseCourseEnrollmentOutcomeWork(
    snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
  );
  if (!work || work.status !== 'pending' || work.enrollmentId !== snapshot.id) {
    await snapshot.ref.set({
      status: 'blocked',
      blockedReason: 'invalid_work',
      updatedAt: timestampFromDate(nowDate),
    });
    return { enrollmentId: snapshot.id, outcome: 'invalid_work' };
  }
  const now = timestampFromDate(nowDate);
  if (compareCanonicalTimestamps(now, work.dueAt) < 0) {
    return { enrollmentId: work.enrollmentId, outcome: 'future_skipped' };
  }

  let executionScope: CanonicalExecutionScope | undefined;
  try {
    executionScope = await resolveWorkerExecutionScope(firestore, work);
  } catch {
    await updatePendingWorkIfCurrent(
      firestore,
      work,
      blockPendingCourseEnrollmentOutcomeWork(work, {
        blockedReason: 'invalid_work',
        updatedAt: now,
      }) as Record<string, unknown>
    );
    return { enrollmentId: work.enrollmentId, outcome: 'invalid_work' };
  }
  if (!executionScope) {
    return { enrollmentId: work.enrollmentId, outcome: 'session_inactive_skipped' };
  }

  try {
    const classification = commandOutcome(
      await execute(resolveCourseEnrollmentOutcomeEnvelope(work), executionScope)
    );
    if (classification === 'processed' || classification === 'lifecycle_ineligible') {
      await updatePendingWorkIfCurrent(
        firestore,
        work,
        completePendingCourseEnrollmentOutcomeWork(work, {
          completedReason:
            classification === 'processed' ? 'deadline_processed' : 'lifecycle_ineligible',
          updatedAt: now,
        }) as Record<string, unknown>
      );
      return { enrollmentId: work.enrollmentId, outcome: classification };
    }
    if (classification === 'invalid') {
      await updatePendingWorkIfCurrent(
        firestore,
        work,
        blockPendingCourseEnrollmentOutcomeWork(work, {
          blockedReason: 'invalid_enrollment',
          updatedAt: now,
        }) as Record<string, unknown>
      );
      return { enrollmentId: work.enrollmentId, outcome: 'invalid_work' };
    }
  } catch {
    // Transient command failures follow the same bounded retry path.
  }

  const retry = CourseEnrollmentOutcomeWorkSchema.parse({
    ...work,
    dueAt: addMillisecondsToCanonicalTimestamp(now, retryDelayMs(work.attemptCount)),
    attemptCount: work.attemptCount + 1,
    workRevision: work.workRevision + 1,
    updatedAt: now,
  });
  await updatePendingWorkIfCurrent(firestore, work, retry as Record<string, unknown>);
  return { enrollmentId: work.enrollmentId, outcome: 'retry_scheduled' };
}

export async function sweepCourseEnrollmentOutcomes(
  firestore: Firestore,
  options: {
    readonly now?: Date;
    readonly maxCandidates?: number;
    readonly execute?: (
      envelope: ReturnType<typeof resolveCourseEnrollmentOutcomeEnvelope>,
      scope: CanonicalExecutionScope
    ) => Promise<CommandResult<'resolve_attendance_outcome'>>;
  } = {}
): Promise<CourseEnrollmentOutcomeSweepResult> {
  const nowDate = options.now ?? new Date();
  const now = timestampFromDate(nowDate);
  const limit = Math.min(
    COURSE_ENROLLMENT_OUTCOME_SWEEP_MAX_CANDIDATES,
    Math.max(1, options.maxCandidates ?? COURSE_ENROLLMENT_OUTCOME_SWEEP_PAGE_SIZE)
  );
  const snapshot = await firestore
    .collection(COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION)
    .where('status', '==', 'pending')
    .where('dueAt.seconds', '<=', now.seconds)
    .orderBy('dueAt.seconds', 'asc')
    .orderBy('enrollmentId', 'asc')
    .limit(limit + 1)
    .get();

  const execute =
    options.execute ??
    ((
      envelope: ReturnType<typeof resolveCourseEnrollmentOutcomeEnvelope>,
      scope: CanonicalExecutionScope
    ) => {
      const transactionExecutor = createFirestoreCanonicalTransactionExecutor(firestore);
      const commands = createCanonicalCommands(
        createBookingAttendanceCommandHandlers(transactionExecutor),
        { clock: createAuthoritativeCommandClock(nowDate), scope }
      );
      return commands.execute(envelope);
    });
  const outcomes = [] as Array<{
    enrollmentId: string;
    outcome: CourseEnrollmentOutcomeSweepCandidateOutcome;
  }>;
  for (const document of snapshot.docs.slice(0, limit)) {
    outcomes.push(await processCandidate(firestore, document, nowDate, execute));
  }

  return {
    candidateDocsRead: snapshot.size,
    processed: outcomes.filter((entry) => entry.outcome === 'processed').length,
    lifecycleIneligible: outcomes.filter((entry) => entry.outcome === 'lifecycle_ineligible')
      .length,
    invalid: outcomes.filter((entry) => entry.outcome === 'invalid_work').length,
    retried: outcomes.filter((entry) => entry.outcome === 'retry_scheduled').length,
    futureSkipped: outcomes.filter((entry) => entry.outcome === 'future_skipped').length,
    inactiveSessionSkipped: outcomes.filter((entry) => entry.outcome === 'session_inactive_skipped')
      .length,
    truncated: snapshot.size > limit,
    outcomes,
  };
}
