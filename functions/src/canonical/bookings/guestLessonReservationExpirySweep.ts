import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  BookingIdSchema,
  CorrelationIdSchema,
  SystemActorIdSchema,
  buildScheduledCommandIdempotencyKey,
  canonicalDeterministicHash,
  systemCommandActor,
  timestampFromDate,
  type AggregateRevision,
  type BookingId,
  type CommandEnvelope,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { parseBooking } from './bookingStore';

export const GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE = 25;
export const GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES = 100;
export const GUEST_LESSON_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID = SystemActorIdSchema.parse(
  'system_guest_reservation_expiry'
);

export type GuestLessonReservationExpirySweepOutcome =
  | 'expired'
  | 'already_ineligible'
  | 'already_terminal'
  | 'fully_funded'
  | 'stale'
  | 'invalid_integrity'
  | 'failed';

export interface GuestLessonReservationExpirySweepCursor {
  readonly expiresAtSeconds: number;
  readonly bookingId: string;
}

export interface GuestLessonReservationExpirySweepCandidateResult {
  readonly bookingId: string;
  readonly outcome: GuestLessonReservationExpirySweepOutcome;
}

export interface GuestLessonReservationExpirySweepResult {
  readonly scannedCandidates: number;
  readonly outcomes: readonly GuestLessonReservationExpirySweepCandidateResult[];
  readonly cursor?: GuestLessonReservationExpirySweepCursor;
  readonly truncated: boolean;
}

export interface SweepExpiredGuestLessonReservationsOptions {
  readonly now?: Date;
  readonly pageSize?: number;
  readonly maxCandidates?: number;
  readonly startAfter?: GuestLessonReservationExpirySweepCursor;
}

function readCursorFromSnapshot(
  snapshot: QueryDocumentSnapshot
): GuestLessonReservationExpirySweepCursor | undefined {
  const expiresAtSeconds = snapshot.get('lifecycle.reservationExpiresAt.seconds');
  const bookingId = snapshot.get('bookingId');
  if (typeof expiresAtSeconds !== 'number' || typeof bookingId !== 'string') {
    return undefined;
  }
  return { expiresAtSeconds, bookingId };
}

export function classifyExpireGuestReservationCommandResult(
  result: CommandResult<'expire_guest_reservation'>
): GuestLessonReservationExpirySweepOutcome {
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
    if (details?.resourceKind === 'booking' && details.reason === 'conflict') {
      return 'already_terminal';
    }
    return 'already_ineligible';
  }
  if (code === 'validation') {
    if (details?.resourceKind === 'booking' && details.reason === 'unsupported') {
      return 'already_ineligible';
    }
    return 'invalid_integrity';
  }
  return 'failed';
}

function expireEnvelope(booking: {
  readonly bookingId: BookingId;
  readonly revision: AggregateRevision;
}): CommandEnvelope<'expire_guest_reservation'> {
  return {
    kind: 'expire_guest_reservation',
    context: {
      actor: systemCommandActor(GUEST_LESSON_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID),
      exercisedCapability: 'system',
      idempotencyKey: buildScheduledCommandIdempotencyKey({
        systemActorId: GUEST_LESSON_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID,
        commandKind: 'expire_guest_reservation',
        subjectId: booking.bookingId,
      }),
      correlationId: CorrelationIdSchema.parse(
        canonicalDeterministicHash([
          'expire-guest-reservation-sweep:v1',
          booking.bookingId,
        ])
      ),
      source: 'scheduler',
      expectedRevision: booking.revision,
    },
    intent: { bookingId: booking.bookingId },
  };
}

async function processCandidate(
  snapshot: QueryDocumentSnapshot,
  execute: (
    envelope: CommandEnvelope<'expire_guest_reservation'>
  ) => Promise<CommandResult<'expire_guest_reservation'>>
): Promise<GuestLessonReservationExpirySweepCandidateResult> {
  const parsedBookingId = BookingIdSchema.safeParse(snapshot.id);
  const bookingId = parsedBookingId.success ? parsedBookingId.data : snapshot.id;
  const booking = parseBooking(snapshot.data());
  if (!booking || booking.bookingId !== snapshot.id) {
    return { bookingId, outcome: 'invalid_integrity' };
  }
  try {
    const result = await execute(expireEnvelope(booking));
    return { bookingId: booking.bookingId, outcome: classifyExpireGuestReservationCommandResult(result) };
  } catch {
    return { bookingId: booking.bookingId, outcome: 'failed' };
  }
}

export async function sweepExpiredGuestLessonReservations(
  firestore: Firestore,
  options: SweepExpiredGuestLessonReservationsOptions = {}
): Promise<GuestLessonReservationExpirySweepResult> {
  const now = options.now ?? new Date();
  const pageSize = Math.max(
    1,
    options.pageSize ?? GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE
  );
  const maxCandidates = Math.max(
    1,
    options.maxCandidates ?? GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES
  );
  const nowSeconds = timestampFromDate(now).seconds;
  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(now) },
    createFirestoreCanonicalTransactionExecutor(firestore)
  );

  const outcomes: GuestLessonReservationExpirySweepCandidateResult[] = [];
  let cursor = options.startAfter;
  let truncated = false;

  while (outcomes.length < maxCandidates) {
    const remaining = maxCandidates - outcomes.length;
    const limit = Math.min(pageSize, remaining);
    let query: Query = firestore
      .collection('bookings')
      .where('attribution.bookingOrigin', '==', 'guest')
      .where('lifecycle.status', '==', 'pending')
      .where('lifecycle.reservationExpiresAt.seconds', '<=', nowSeconds)
      .orderBy('lifecycle.reservationExpiresAt.seconds', 'asc')
      .orderBy('bookingId', 'asc')
      .limit(limit);
    if (cursor) {
      query = query.startAfter(cursor.expiresAtSeconds, cursor.bookingId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      outcomes.push(await processCandidate(document, (envelope) => commands.execute(envelope)));
      const nextCursor = readCursorFromSnapshot(document);
      if (nextCursor) {
        cursor = nextCursor;
      }
    }

    if (snapshot.size < limit) {
      break;
    }
    if (outcomes.length >= maxCandidates) {
      truncated = true;
      break;
    }
  }

  return {
    scannedCandidates: outcomes.length,
    outcomes,
    ...(cursor ? { cursor } : {}),
    truncated,
  };
}
