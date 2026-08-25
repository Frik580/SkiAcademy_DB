import type { BookingId } from './identifiers';
import { type CanonicalTimestamp } from './primitives';
/** Maximum individual guest lesson reservation hold before service start. */
export declare const GUEST_LESSON_RESERVATION_TTL_MS: number;
export declare function addMillisecondsToCanonicalTimestamp(timestamp: CanonicalTimestamp, milliseconds: number): CanonicalTimestamp;
export declare function minCanonicalTimestamp(left: CanonicalTimestamp, right: CanonicalTimestamp): CanonicalTimestamp;
export declare function resolveGuestLessonReservationExpiresAt(input: {
    readonly createdAt: CanonicalTimestamp;
    readonly serviceStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp;
export declare function isGuestReservationExpired(input: {
    readonly now: CanonicalTimestamp;
    readonly reservationExpiresAt: CanonicalTimestamp;
}): boolean;
export declare function isGuestBookingRequestAllowedBeforeStart(input: {
    readonly now: CanonicalTimestamp;
    readonly serviceStartsAt: CanonicalTimestamp;
}): boolean;
export declare function isGuestBookingConfirmationAllowedBeforeStart(input: {
    readonly now: CanonicalTimestamp;
    readonly serviceStartsAt: CanonicalTimestamp;
}): boolean;
export declare const GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS: {
    readonly displayName: "participant_display_name";
    readonly skillLevel: "participant_skill_level";
    readonly discipline: "participant_discipline";
    readonly ageYears: "participant_age_years";
};
export declare const GUEST_ACTION_TOKEN_TRANSPORT_KEY = "guest_action_token";
export declare const GUEST_ACTION_NONCE_TRANSPORT_KEY = "guest_action_nonce";
export declare const GUEST_ACTION_SIGNATURE_TRANSPORT_KEY = "guest_action_sig";
export declare function guestBookingCredentialSubjectKey(bookingId: BookingId): string;
