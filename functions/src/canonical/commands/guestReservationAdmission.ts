import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import {
  CanonicalCommandError,
  compareCanonicalTimestamps,
  timestampFromDate,
  type CanonicalTimestamp,
  type CorrelationId,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';

export type GuestReservationKind = 'lesson' | 'course';

export const GUEST_RESERVATION_ACTIVE_LIMITS = {
  maxActiveLesson: 3,
  maxActiveCourse: 2,
} as const;

export interface GuestReservationAdmissionPolicy {
  readonly actorKey: string;
  readonly maxActiveLesson: number;
  readonly maxActiveCourse: number;
}

export interface GuestReservationAdmissionPlan {
  readonly path: string;
  readonly existed: boolean;
  readonly reservationPaths: readonly string[];
  readonly deleteAt: Date;
}

/** Verified staging https.onCall ingress supplies one platform XFF address.
 * Reject other shapes until their trust boundary is reviewed.
 */
export function deriveGuestReservationActorKey(
  forwardedFor: string | string[] | undefined,
  secret: string
): string | undefined {
  if (typeof forwardedFor !== 'string') return undefined;
  const hops = forwardedFor.split(',');
  if (hops.length !== 1) return undefined;
  const clientAddress = hops[0].trim();
  if (!isIP(clientAddress)) return undefined;
  const normalized =
    isIP(clientAddress) === 6
      ? new URL(`http://[${clientAddress}]/`).hostname.toLowerCase()
      : clientAddress;
  return createHmac('sha256', secret)
    .update('guest-reservation-admission:v1\0')
    .update(normalized)
    .digest('hex');
}

function admissionPath(kind: GuestReservationKind, actorKey: string): string {
  return `guest_reservation_admission/${kind}_${actorKey}`;
}

function reservationPathIsValid(kind: GuestReservationKind, path: unknown): path is string {
  const collection = kind === 'lesson' ? 'bookings' : 'course_enrollments';
  return typeof path === 'string' && new RegExp(`^${collection}/[A-Za-z0-9_-]+$`).test(path);
}

function toDate(timestamp: CanonicalTimestamp): Date {
  return new Date(timestamp.seconds * 1_000 + Math.floor(timestamp.nanoseconds / 1_000_000));
}

export async function readAndPlanGuestReservationAdmission(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly kind: GuestReservationKind;
    readonly policy: GuestReservationAdmissionPolicy;
    readonly reservationPath: string;
    readonly reservationExpiresAt: CanonicalTimestamp;
    readonly now: Date;
    readonly correlationId: CorrelationId;
  }
): Promise<GuestReservationAdmissionPlan> {
  const limit =
    input.kind === 'lesson' ? input.policy.maxActiveLesson : input.policy.maxActiveCourse;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new CanonicalCommandError('internal', { correlationId: input.correlationId });
  }
  const path = admissionPath(input.kind, input.policy.actorKey);
  const guardRead = await session.tx.get({ path });
  session.plan.planRead({ path, category: 'authorization_check' });
  const stored = guardRead.data?.reservationPaths;
  if (
    guardRead.exists &&
    (guardRead.data?.schemaVersion !== 1 ||
      !Array.isArray(stored) ||
      stored.length > 20 ||
      !stored.every((item) => reservationPathIsValid(input.kind, item)))
  ) {
    throw new CanonicalCommandError('internal', { correlationId: input.correlationId });
  }

  const now = timestampFromDate(input.now);
  const activePaths: string[] = [];
  let deleteAt = toDate(input.reservationExpiresAt);
  for (const reservationPath of (stored ?? []) as string[]) {
    const reservationRead = await session.tx.get({ path: reservationPath });
    session.plan.planRead({ path: reservationPath, category: 'authorization_check' });
    if (!reservationRead.exists) continue;
    const reservation =
      input.kind === 'lesson'
        ? parseBooking(reservationRead.data)
        : parseCourseEnrollment(reservationRead.data);
    if (!reservation) {
      throw new CanonicalCommandError('internal', { correlationId: input.correlationId });
    }
    if (
      reservation.attribution.bookingOrigin === 'guest' &&
      reservation.lifecycle.status === 'pending' &&
      compareCanonicalTimestamps(now, reservation.lifecycle.reservationExpiresAt) < 0
    ) {
      activePaths.push(reservationPath);
      const reservationDeleteAt = toDate(reservation.lifecycle.reservationExpiresAt);
      if (reservationDeleteAt > deleteAt) deleteAt = reservationDeleteAt;
    }
  }

  if (activePaths.length >= limit) {
    throw new CanonicalCommandError('guest_reservation_limit', {
      correlationId: input.correlationId,
    });
  }
  session.plan.planMutation({
    path,
    kind: guardRead.exists ? 'update' : 'create',
    category: 'authorization_check',
    estimatedPayloadBytes: 1024,
  });
  return {
    path,
    existed: guardRead.exists,
    reservationPaths: [...activePaths, input.reservationPath],
    deleteAt,
  };
}

export function commitGuestReservationAdmission(
  session: CanonicalAtomicTransactionSession,
  plan: GuestReservationAdmissionPlan
): void {
  const payload = {
    schemaVersion: 1,
    reservationPaths: [...plan.reservationPaths],
    deleteAt: plan.deleteAt,
  };
  if (plan.existed) {
    session.tx.update({ path: plan.path }, payload);
  } else {
    session.tx.create({ path: plan.path }, payload);
  }
}
