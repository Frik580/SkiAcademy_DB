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

export const GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS = {
  displayName: 'participant_display_name',
  skillLevel: 'participant_skill_level',
  discipline: 'participant_discipline',
  ageYears: 'participant_age_years',
} as const;

export const GUEST_ACTION_TOKEN_TRANSPORT_KEY = 'guest_action_token';
export const GUEST_ACTION_NONCE_TRANSPORT_KEY = 'guest_action_nonce';
export const GUEST_ACTION_SIGNATURE_TRANSPORT_KEY = 'guest_action_sig';

export function guestBookingCredentialSubjectKey(bookingId: BookingId): string {
  return `guest-booking:${bookingId}`;
}
