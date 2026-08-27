import { z } from 'zod';
import { type BookingId, type CourseEnrollmentId, type GuestSubjectId } from './identifiers';
import { type CanonicalTimestamp } from './primitives';
export declare const GUEST_ACTION_TOKEN_VERSION: "guest-token:v1";
export declare const GUEST_ACTION_TOKEN_PURPOSES: readonly ["cancel_pending_reservation", "link_guest_course_enrollment"];
export type GuestActionTokenPurpose = (typeof GUEST_ACTION_TOKEN_PURPOSES)[number];
declare const GuestActionTokenPayloadSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    version: z.ZodLiteral<"guest-token:v1">;
    subjectKind: z.ZodLiteral<"booking">;
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
    purpose: z.ZodLiteral<"cancel_pending_reservation">;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    nonce: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    version: z.ZodLiteral<"guest-token:v1">;
    subjectKind: z.ZodLiteral<"course_enrollment">;
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
    purpose: z.ZodEnum<{
        cancel_pending_reservation: "cancel_pending_reservation";
        link_guest_course_enrollment: "link_guest_course_enrollment";
    }>;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    nonce: z.ZodString;
}, z.core.$strict>], "subjectKind">;
export type GuestActionTokenPayload = Readonly<z.output<typeof GuestActionTokenPayloadSchema>>;
export type GuestBookingActionTokenPayload = Extract<GuestActionTokenPayload, {
    readonly subjectKind: 'booking';
}>;
export type GuestCourseEnrollmentActionTokenPayload = Extract<GuestActionTokenPayload, {
    readonly subjectKind: 'course_enrollment';
}>;
export declare function decodeHmacSha256HexSignature(signature: string): Uint8Array | undefined;
export type CompareHmacSha256Signatures = (expectedHex: string, providedSignature: string) => boolean;
export declare function signGuestActionCredential(secret: string, payload: GuestBookingActionTokenPayload): string;
export declare function signGuestCourseEnrollmentActionCredential(secret: string, payload: GuestCourseEnrollmentActionTokenPayload): string;
export declare function verifyGuestActionCredentialParts(input: {
    readonly secret: string;
    readonly nonce: string;
    readonly signature: string;
    readonly now: CanonicalTimestamp;
    readonly expectedBookingId: BookingId;
    readonly expectedGuestSubjectId: GuestSubjectId;
    readonly expectedPurpose: 'cancel_pending_reservation';
    readonly expiresAt: CanonicalTimestamp;
    readonly compareSignatures: CompareHmacSha256Signatures;
}): GuestActionTokenVerificationResult;
export declare function verifyGuestCourseEnrollmentActionCredentialParts(input: {
    readonly secret: string;
    readonly nonce: string;
    readonly signature: string;
    readonly now: CanonicalTimestamp;
    readonly expectedEnrollmentId: CourseEnrollmentId;
    readonly expectedGuestSubjectId: GuestSubjectId;
    readonly expectedPurpose: GuestActionTokenPurpose;
    readonly expiresAt: CanonicalTimestamp;
    readonly compareSignatures: CompareHmacSha256Signatures;
}): GuestCourseEnrollmentActionTokenVerificationResult;
export declare function issueGuestActionToken(input: {
    readonly secret: string;
    readonly payload: GuestBookingActionTokenPayload;
}): string;
export type GuestActionTokenVerificationResult = Readonly<{
    valid: true;
    payload: GuestBookingActionTokenPayload;
}> | Readonly<{
    valid: false;
    reason: 'malformed' | 'invalid_signature' | 'expired' | 'purpose_mismatch' | 'booking_mismatch' | 'guest_mismatch';
}>;
export type GuestCourseEnrollmentActionTokenVerificationResult = Readonly<{
    valid: true;
    payload: GuestCourseEnrollmentActionTokenPayload;
}> | Readonly<{
    valid: false;
    reason: 'malformed' | 'invalid_signature' | 'expired' | 'purpose_mismatch' | 'enrollment_mismatch' | 'guest_mismatch';
}>;
export declare function verifyGuestActionToken(input: {
    readonly secret: string;
    readonly token: string;
    readonly now: CanonicalTimestamp;
    readonly expectedBookingId: BookingId;
    readonly expectedGuestSubjectId: GuestSubjectId;
    readonly expectedPurpose: 'cancel_pending_reservation';
    readonly compareSignatures: CompareHmacSha256Signatures;
}): GuestActionTokenVerificationResult;
export declare function createGuestActionTokenNonce(): string;
export {};
