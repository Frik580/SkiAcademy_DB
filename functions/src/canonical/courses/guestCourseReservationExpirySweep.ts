import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  SystemActorIdSchema,
  buildScheduledCommandIdempotencyKey,
  canonicalDeterministicHash,
  systemCommandActor,
  timestampFromDate,
  type CommandEnvelope,
  type CommandResult,
  type CourseEnrollment,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { parseCourseEnrollment } from './courseEnrollmentStore';

export const GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE = 25;
export const GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES = 100;
export const GUEST_COURSE_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID = SystemActorIdSchema.parse(
  'system_guest_course_reservation_expiry'
);

export type GuestCourseReservationExpirySweepOutcome =
  | 'expired'
  | 'already_ineligible'
  | 'already_terminal'
  | 'fully_funded'
  | 'stale'
  | 'invalid_integrity'
  | 'failed';

export interface GuestCourseReservationExpirySweepCursor {
  readonly expiresAtSeconds: number;
  readonly enrollmentId: string;
}

export interface GuestCourseReservationExpirySweepCandidateResult {
  readonly enrollmentId: string;
  readonly outcome: GuestCourseReservationExpirySweepOutcome;
}

export interface GuestCourseReservationExpirySweepResult {
  readonly scannedCandidates: number;
  readonly expired: number;
  readonly fullyFunded: number;
  readonly alreadyTerminal: number;
  readonly alreadyIneligible: number;
  readonly stale: number;
  readonly invalidIntegrity: number;
  readonly failed: number;
  readonly pages: number;
  readonly outcomes: readonly GuestCourseReservationExpirySweepCandidateResult[];
  readonly cursor?: GuestCourseReservationExpirySweepCursor;
  readonly truncated: boolean;
}

export interface SweepExpiredGuestCourseReservationsOptions {
  readonly now?: Date;
  readonly pageSize?: number;
  readonly maxCandidates?: number;
  readonly startAfter?: GuestCourseReservationExpirySweepCursor;
}

function readCursorFromSnapshot(
  snapshot: QueryDocumentSnapshot
): GuestCourseReservationExpirySweepCursor | undefined {
  const expiresAtSeconds = snapshot.get('lifecycle.reservationExpiresAt.seconds');
  const enrollmentId = snapshot.get('enrollmentId');
  if (typeof expiresAtSeconds !== 'number' || typeof enrollmentId !== 'string') {
    return undefined;
  }
  return { expiresAtSeconds, enrollmentId };
}

export function classifyExpireGuestCourseReservationCommandResult(
  result: CommandResult<'expire_guest_reservation'>
): GuestCourseReservationExpirySweepOutcome {
  if (result.status === 'success') {
    return 'expired';
  }
  const { code, details } = result.error;
  if (code === 'stale_version') {
    return 'stale';
  }
  if (code === 'invalid_transition') {
    if (details?.field === 'paymentId' && details.reason === 'conflict') {
      return 'fully_funded';
    }
    if (details?.field === 'reservationExpiresAt' && details.reason === 'out_of_range') {
      return 'already_ineligible';
    }
    if (details?.resourceKind === 'course_enrollment' && details.reason === 'conflict') {
      return 'already_terminal';
    }
    return 'already_ineligible';
  }
  if (code === 'validation') {
    if (details?.resourceKind === 'course_enrollment' && details.reason === 'unsupported') {
      return 'already_ineligible';
    }
    return 'invalid_integrity';
  }
  return 'failed';
}

export function buildGuestCourseReservationExpiryEnvelope(
  enrollment: Pick<CourseEnrollment, 'enrollmentId' | 'revision'>
): CommandEnvelope<'expire_guest_reservation'> {
  return {
    kind: 'expire_guest_reservation',
    context: {
      actor: systemCommandActor(GUEST_COURSE_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID),
      exercisedCapability: 'system',
      idempotencyKey: buildScheduledCommandIdempotencyKey({
        systemActorId: GUEST_COURSE_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID,
        commandKind: 'expire_guest_reservation',
        subjectId: enrollment.enrollmentId,
      }),
      correlationId: CorrelationIdSchema.parse(
        canonicalDeterministicHash([
          'expire-guest-course-reservation-sweep:v1',
          enrollment.enrollmentId,
        ])
      ),
      source: 'scheduler',
      expectedRevision: enrollment.revision,
    },
    intent: { courseEnrollmentId: enrollment.enrollmentId },
  };
}

async function processCandidate(
  snapshot: QueryDocumentSnapshot,
  execute: (
    envelope: CommandEnvelope<'expire_guest_reservation'>
  ) => Promise<CommandResult<'expire_guest_reservation'>>
): Promise<GuestCourseReservationExpirySweepCandidateResult> {
  const parsedDocumentId = CourseEnrollmentIdSchema.safeParse(snapshot.id);
  const enrollmentId = parsedDocumentId.success ? parsedDocumentId.data : snapshot.id;
  const enrollment = parseCourseEnrollment(snapshot.data());
  if (!enrollment || enrollment.enrollmentId !== snapshot.id) {
    return { enrollmentId, outcome: 'invalid_integrity' };
  }
  try {
    const result = await execute(buildGuestCourseReservationExpiryEnvelope(enrollment));
    return {
      enrollmentId: enrollment.enrollmentId,
      outcome: classifyExpireGuestCourseReservationCommandResult(result),
    };
  } catch {
    return { enrollmentId: enrollment.enrollmentId, outcome: 'failed' };
  }
}

function countOutcomes(outcomes: readonly GuestCourseReservationExpirySweepCandidateResult[]) {
  const counts = {
    expired: 0,
    fullyFunded: 0,
    alreadyTerminal: 0,
    alreadyIneligible: 0,
    stale: 0,
    invalidIntegrity: 0,
    failed: 0,
  };
  for (const candidate of outcomes) {
    switch (candidate.outcome) {
      case 'expired':
        counts.expired += 1;
        break;
      case 'fully_funded':
        counts.fullyFunded += 1;
        break;
      case 'already_terminal':
        counts.alreadyTerminal += 1;
        break;
      case 'already_ineligible':
        counts.alreadyIneligible += 1;
        break;
      case 'stale':
        counts.stale += 1;
        break;
      case 'invalid_integrity':
        counts.invalidIntegrity += 1;
        break;
      case 'failed':
        counts.failed += 1;
        break;
    }
  }
  return counts;
}

export async function sweepExpiredGuestCourseReservations(
  firestore: Firestore,
  options: SweepExpiredGuestCourseReservationsOptions = {}
): Promise<GuestCourseReservationExpirySweepResult> {
  const now = options.now ?? new Date();
  const pageSize = Math.min(
    GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE,
    Math.max(1, options.pageSize ?? GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE)
  );
  const maxCandidates = Math.min(
    GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES,
    Math.max(1, options.maxCandidates ?? GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES)
  );
  const nowSeconds = timestampFromDate(now).seconds;
  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(now) },
    createFirestoreCanonicalTransactionExecutor(firestore)
  );

  const outcomes: GuestCourseReservationExpirySweepCandidateResult[] = [];
  let cursor = options.startAfter;
  let pages = 0;
  let truncated = false;

  while (outcomes.length < maxCandidates) {
    const remaining = maxCandidates - outcomes.length;
    const limit = Math.min(pageSize, remaining);
    let query: Query = firestore
      .collection('course_enrollments')
      .where('attribution.bookingOrigin', '==', 'guest')
      .where('lifecycle.status', '==', 'pending')
      .where('lifecycle.reservationExpiresAt.seconds', '<=', nowSeconds)
      .orderBy('lifecycle.reservationExpiresAt.seconds', 'asc')
      .orderBy('enrollmentId', 'asc')
      .limit(limit);
    if (cursor) {
      query = query.startAfter(cursor.expiresAtSeconds, cursor.enrollmentId);
    }

    const snapshot = await query.get();
    pages += 1;
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      outcomes.push(await processCandidate(document, (envelope) => commands.execute(envelope)));
      const nextCursor = readCursorFromSnapshot(document);
      if (!nextCursor) {
        truncated = true;
        break;
      }
      cursor = nextCursor;
    }

    if (truncated || snapshot.size < limit) {
      break;
    }
    if (outcomes.length >= maxCandidates) {
      truncated = true;
      break;
    }
  }

  return {
    scannedCandidates: outcomes.length,
    ...countOutcomes(outcomes),
    pages,
    outcomes,
    ...(cursor ? { cursor } : {}),
    truncated,
  };
}
