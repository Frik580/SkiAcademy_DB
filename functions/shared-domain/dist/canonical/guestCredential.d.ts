import { z } from 'zod';
import { type BookingId, type GuestSubjectId } from './identifiers';
import { type CanonicalTimestamp } from './primitives';
export declare const GUEST_ACTION_TOKEN_VERSION: "guest-token:v1";
export declare const GUEST_ACTION_TOKEN_PURPOSES: readonly ["cancel_pending_reservation"];
export type GuestActionTokenPurpose = (typeof GUEST_ACTION_TOKEN_PURPOSES)[number];
declare const GuestActionTokenPayloadSchema: z.ZodObject<{
    version: z.ZodLiteral<"guest-token:v1">;
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
    purpose: z.ZodEnum<{
        cancel_pending_reservation: "cancel_pending_reservation";
    }>;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    nonce: z.ZodString;
}, z.core.$strict>;
export type GuestActionTokenPayload = Readonly<z.output<typeof GuestActionTokenPayloadSchema>>;
export declare function signGuestActionCredential(secret: string, payload: GuestActionTokenPayload): string;
export declare function verifyGuestActionCredentialParts(input: {
    readonly secret: string;
    readonly nonce: string;
    readonly signature: string;
    readonly now: CanonicalTimestamp;
    readonly expectedBookingId: BookingId;
    readonly expectedGuestSubjectId: GuestSubjectId;
    readonly expectedPurpose: GuestActionTokenPurpose;
    readonly expiresAt: CanonicalTimestamp;
}): GuestActionTokenVerificationResult;
export declare function issueGuestActionToken(input: {
    readonly secret: string;
    readonly payload: GuestActionTokenPayload;
}): string;
export type GuestActionTokenVerificationResult = Readonly<{
    valid: true;
    payload: GuestActionTokenPayload;
}> | Readonly<{
    valid: false;
    reason: 'malformed' | 'invalid_signature' | 'expired' | 'purpose_mismatch' | 'booking_mismatch' | 'guest_mismatch';
}>;
export declare function verifyGuestActionToken(input: {
    readonly secret: string;
    readonly token: string;
    readonly now: CanonicalTimestamp;
    readonly expectedBookingId: BookingId;
    readonly expectedGuestSubjectId: GuestSubjectId;
    readonly expectedPurpose: GuestActionTokenPurpose;
}): GuestActionTokenVerificationResult;
export declare function createGuestActionTokenNonce(): string;
export {};
