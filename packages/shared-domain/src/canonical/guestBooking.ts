import { z } from 'zod';
import type { BookingId } from './identifiers';
import {
  compareCanonicalTimestamps,
  timestampFromDate,
  type CanonicalTimestamp,
} from './primitives';

/** Maximum individual guest lesson reservation hold before service start. */
export const GUEST_LESSON_RESERVATION_TTL_MS = 60 * 60 * 1_000;

export function addMillisecondsToCanonicalTimestamp(
  timestamp: CanonicalTimestamp,
  milliseconds: number
): CanonicalTimestamp {
  const instantMs = timestamp.seconds * 1_000 + timestamp.nanoseconds / 1_000_000 + milliseconds;
  return timestampFromDate(new Date(instantMs));
}

export function minCanonicalTimestamp(
  left: CanonicalTimestamp,
  right: CanonicalTimestamp
): CanonicalTimestamp {
  return compareCanonicalTimestamps(left, right) <= 0 ? left : right;
}

export function resolveGuestLessonReservationExpiresAt(input: {
  readonly createdAt: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp {
  const ttlExpiresAt = addMillisecondsToCanonicalTimestamp(
    input.createdAt,
    GUEST_LESSON_RESERVATION_TTL_MS
  );
  return minCanonicalTimestamp(ttlExpiresAt, input.serviceStartsAt);
}

export function isGuestReservationExpired(input: {
  readonly now: CanonicalTimestamp;
  readonly reservationExpiresAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.reservationExpiresAt) >= 0;
}

export type GuestLessonReservationExpiryRejectReason =
  | 'not_guest'
  | 'already_confirmed'
  | 'terminal_or_non_pending'
  | 'missing_payment'
  | 'fully_funded'
  | 'not_yet_expired';

export type GuestLessonReservationExpiryDecision =
  | { readonly outcome: 'expire' }
  | {
      readonly outcome: 'rejected';
      readonly reason: GuestLessonReservationExpiryRejectReason;
    };

/**
 * Booking-aggregate expiry eligibility. Party size is not an input: a future
 * multi-participant lesson Booking expires once, from Payment funding + deadline.
 */
export function evaluateGuestLessonReservationExpiry(input: {
  readonly bookingOrigin: string;
  readonly lifecycleStatus: string;
  readonly reservationExpiresAt?: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
  readonly hasPayment: boolean;
  readonly paymentFullyFunded: boolean;
}): GuestLessonReservationExpiryDecision {
  if (input.bookingOrigin !== 'guest') {
    return { outcome: 'rejected', reason: 'not_guest' };
  }
  if (input.lifecycleStatus === 'confirmed') {
    return { outcome: 'rejected', reason: 'already_confirmed' };
  }
  if (input.lifecycleStatus !== 'pending' || input.reservationExpiresAt === undefined) {
    return { outcome: 'rejected', reason: 'terminal_or_non_pending' };
  }
  if (!input.hasPayment) {
    return { outcome: 'rejected', reason: 'missing_payment' };
  }
  if (input.paymentFullyFunded) {
    return { outcome: 'rejected', reason: 'fully_funded' };
  }
  if (
    !isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: input.reservationExpiresAt,
    })
  ) {
    return { outcome: 'rejected', reason: 'not_yet_expired' };
  }
  return { outcome: 'expire' };
}

export function isGuestBookingRequestAllowedBeforeStart(input: {
  readonly now: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.serviceStartsAt) < 0;
}

export function isGuestBookingConfirmationAllowedBeforeStart(input: {
  readonly now: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.serviceStartsAt) < 0;
}

export type GuestManualPaymentAcceptanceRejectReason =
  'already_confirmed' | 'terminal_or_non_pending' | 'reservation_expired' | 'service_started';

export type GuestManualPaymentAcceptanceDecision =
  | { readonly outcome: 'not_applicable' }
  | { readonly outcome: 'accepted' }
  | {
      readonly outcome: 'rejected';
      readonly reason: GuestManualPaymentAcceptanceRejectReason;
    };

/**
 * Whether money may be accepted against a guest Booking.
 * Independent of whether an already fully funded Payment should confirm the Booking.
 * `reservationExpiresAt` is the deadline for new guest funding and unpaid holds.
 */
export function evaluateGuestManualPaymentAcceptance(input: {
  readonly bookingOrigin: string;
  readonly lifecycleStatus: string;
  readonly reservationExpiresAt?: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
}): GuestManualPaymentAcceptanceDecision {
  if (input.bookingOrigin !== 'guest') {
    return { outcome: 'not_applicable' };
  }
  if (input.lifecycleStatus === 'confirmed') {
    return { outcome: 'rejected', reason: 'already_confirmed' };
  }
  if (input.lifecycleStatus !== 'pending' || input.reservationExpiresAt === undefined) {
    return { outcome: 'rejected', reason: 'terminal_or_non_pending' };
  }
  if (
    isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: input.reservationExpiresAt,
    })
  ) {
    return { outcome: 'rejected', reason: 'reservation_expired' };
  }
  if (
    !isGuestBookingConfirmationAllowedBeforeStart({
      now: input.now,
      serviceStartsAt: input.serviceStartsAt,
    })
  ) {
    return { outcome: 'rejected', reason: 'service_started' };
  }
  return { outcome: 'accepted' };
}

export type GuestBookingFundedConfirmationRejectReason =
  Exclude<GuestManualPaymentAcceptanceRejectReason, 'reservation_expired'>;

export type GuestBookingFundedConfirmationDecision =
  | { readonly outcome: 'not_applicable' }
  | { readonly outcome: 'accepted' }
  | {
      readonly outcome: 'rejected';
      readonly reason: GuestBookingFundedConfirmationRejectReason;
    };

/**
 * Whether an already fully funded Payment may confirm a pending guest Booking.
 * Does not consult `reservationExpiresAt`: that deadline does not block
 * confirmation/reconciliation of money already accepted on the canonical path.
 */
export function evaluateGuestBookingFundedConfirmation(input: {
  readonly bookingOrigin: string;
  readonly lifecycleStatus: string;
  readonly serviceStartsAt: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
}): GuestBookingFundedConfirmationDecision {
  if (input.bookingOrigin !== 'guest') {
    return { outcome: 'not_applicable' };
  }
  if (input.lifecycleStatus === 'confirmed') {
    return { outcome: 'rejected', reason: 'already_confirmed' };
  }
  if (input.lifecycleStatus !== 'pending') {
    return { outcome: 'rejected', reason: 'terminal_or_non_pending' };
  }
  if (
    !isGuestBookingConfirmationAllowedBeforeStart({
      now: input.now,
      serviceStartsAt: input.serviceStartsAt,
    })
  ) {
    return { outcome: 'rejected', reason: 'service_started' };
  }
  return { outcome: 'accepted' };
}

export const GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS = {
  displayName: 'participant_display_name',
  skillLevel: 'participant_skill_level',
  discipline: 'participant_discipline',
  ageYears: 'participant_age_years',
} as const;

export const GuestParticipantProfileFromTransportSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    skillLevel: z.string().trim().min(1).max(64),
    discipline: z.enum(['ski', 'snowboard']),
    ageYears: z.number().finite().int().min(0).max(125),
  })
  .strict();

export type GuestParticipantProfileFromTransport = Readonly<
  z.output<typeof GuestParticipantProfileFromTransportSchema>
>;

export function parseGuestParticipantProfileFromTransportMetadata(
  transportMetadata: Readonly<Record<string, string>> | undefined
): z.ZodSafeParseResult<GuestParticipantProfileFromTransport> {
  if (!transportMetadata) {
    return GuestParticipantProfileFromTransportSchema.safeParse(undefined);
  }

  const ageYearsRaw = transportMetadata[GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.ageYears];
  const parsedAgeYears = ageYearsRaw === undefined ? undefined : Number.parseInt(ageYearsRaw, 10);

  return GuestParticipantProfileFromTransportSchema.safeParse({
    displayName: transportMetadata[GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.displayName],
    skillLevel: transportMetadata[GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.skillLevel],
    discipline: transportMetadata[GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.discipline],
    ageYears: parsedAgeYears,
  });
}

export function guestParticipantTransportMetadataFromProfile(
  profile: GuestParticipantProfileFromTransport
): Readonly<Record<string, string>> {
  return {
    [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.displayName]: profile.displayName,
    [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.skillLevel]: profile.skillLevel,
    [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.discipline]: profile.discipline,
    [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.ageYears]: String(profile.ageYears),
  };
}

export const GUEST_ACTION_TOKEN_TRANSPORT_KEY = 'guest_action_token';
export const GUEST_ACTION_NONCE_TRANSPORT_KEY = 'guest_action_nonce';
export const GUEST_ACTION_SIGNATURE_TRANSPORT_KEY = 'guest_action_sig';

export function guestBookingCredentialSubjectKey(bookingId: BookingId): string {
  return `guest-booking:${bookingId}`;
}
