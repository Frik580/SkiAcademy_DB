import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { canonicalJsonStringify } from './canonicalJson';
import {
  BookingIdSchema,
  CourseEnrollmentIdSchema,
  GuestSubjectIdSchema,
  type BookingId,
  type CourseEnrollmentId,
  type GuestSubjectId,
} from './identifiers';
import { CanonicalTimestampSchema, compareCanonicalTimestamps, type CanonicalTimestamp } from './primitives';

export const GUEST_ACTION_TOKEN_VERSION = 'guest-token:v1' as const;

export const GUEST_ACTION_TOKEN_PURPOSES = ['cancel_pending_reservation'] as const;
export type GuestActionTokenPurpose = (typeof GUEST_ACTION_TOKEN_PURPOSES)[number];

const GuestActionTokenPayloadSchema = z
  .object({
    version: z.literal(GUEST_ACTION_TOKEN_VERSION),
    bookingId: BookingIdSchema,
    guestSubjectId: GuestSubjectIdSchema,
    purpose: z.enum(GUEST_ACTION_TOKEN_PURPOSES),
    expiresAt: CanonicalTimestampSchema,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  })
  .strict();

export type GuestActionTokenPayload = Readonly<z.output<typeof GuestActionTokenPayloadSchema>>;

const GuestCourseEnrollmentActionTokenPayloadSchema = z
  .object({
    version: z.literal(GUEST_ACTION_TOKEN_VERSION),
    enrollmentId: CourseEnrollmentIdSchema,
    guestSubjectId: GuestSubjectIdSchema,
    purpose: z.enum(GUEST_ACTION_TOKEN_PURPOSES),
    expiresAt: CanonicalTimestampSchema,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  })
  .strict();

export type GuestCourseEnrollmentActionTokenPayload = Readonly<
  z.output<typeof GuestCourseEnrollmentActionTokenPayloadSchema>
>;

const HMAC_SHA256_HEX_LENGTH = 64;
const HMAC_SHA256_BYTE_LENGTH = 32;

export function decodeHmacSha256HexSignature(signature: string): Uint8Array | undefined {
  if (signature.length !== HMAC_SHA256_HEX_LENGTH) {
    return undefined;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
    return undefined;
  }
  try {
    const bytes = hexToBytes(signature.toLowerCase());
    return bytes.length === HMAC_SHA256_BYTE_LENGTH ? bytes : undefined;
  } catch {
    return undefined;
  }
}

export type CompareHmacSha256Signatures = (
  expectedHex: string,
  providedSignature: string
) => boolean;

function base64UrlEncode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function signingKeyBytes(secret: string): Uint8Array {
  return utf8ToBytes(secret);
}

function signPayload(secret: string, payload: GuestActionTokenPayload): string {
  const canonicalPayload = canonicalJsonStringify(payload);
  return bytesToHex(hmac(sha256, signingKeyBytes(secret), utf8ToBytes(canonicalPayload)));
}

function signGuestCourseEnrollmentPayload(
  secret: string,
  payload: GuestCourseEnrollmentActionTokenPayload
): string {
  const parsedPayload = GuestCourseEnrollmentActionTokenPayloadSchema.parse(payload);
  const canonicalPayload = canonicalJsonStringify(parsedPayload);
  return bytesToHex(hmac(sha256, signingKeyBytes(secret), utf8ToBytes(canonicalPayload)));
}

export function signGuestActionCredential(
  secret: string,
  payload: GuestActionTokenPayload
): string {
  const parsedPayload = GuestActionTokenPayloadSchema.parse(payload);
  return signPayload(secret, parsedPayload);
}

export function verifyGuestActionCredentialParts(input: {
  readonly secret: string;
  readonly nonce: string;
  readonly signature: string;
  readonly now: CanonicalTimestamp;
  readonly expectedBookingId: BookingId;
  readonly expectedGuestSubjectId: GuestSubjectId;
  readonly expectedPurpose: GuestActionTokenPurpose;
  readonly expiresAt: CanonicalTimestamp;
  readonly compareSignatures: CompareHmacSha256Signatures;
}): GuestActionTokenVerificationResult {
  const payload = GuestActionTokenPayloadSchema.parse({
    version: GUEST_ACTION_TOKEN_VERSION,
    bookingId: input.expectedBookingId,
    guestSubjectId: input.expectedGuestSubjectId,
    purpose: input.expectedPurpose,
    expiresAt: input.expiresAt,
    nonce: input.nonce,
  });
  const expectedSignature = signPayload(input.secret, payload);
  if (!input.compareSignatures(expectedSignature, input.signature)) {
    return { valid: false, reason: 'invalid_signature' };
  }
  if (compareCanonicalTimestamps(input.now, payload.expiresAt) >= 0) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, payload };
}

export function verifyGuestCourseEnrollmentActionCredentialParts(input: {
  readonly secret: string;
  readonly nonce: string;
  readonly signature: string;
  readonly now: CanonicalTimestamp;
  readonly expectedEnrollmentId: CourseEnrollmentId;
  readonly expectedGuestSubjectId: GuestSubjectId;
  readonly expectedPurpose: GuestActionTokenPurpose;
  readonly expiresAt: CanonicalTimestamp;
  readonly compareSignatures: CompareHmacSha256Signatures;
}): GuestCourseEnrollmentActionTokenVerificationResult {
  const payload = GuestCourseEnrollmentActionTokenPayloadSchema.parse({
    version: GUEST_ACTION_TOKEN_VERSION,
    enrollmentId: input.expectedEnrollmentId,
    guestSubjectId: input.expectedGuestSubjectId,
    purpose: input.expectedPurpose,
    expiresAt: input.expiresAt,
    nonce: input.nonce,
  });
  const expectedSignature = signGuestCourseEnrollmentPayload(input.secret, payload);
  if (!input.compareSignatures(expectedSignature, input.signature)) {
    return { valid: false, reason: 'invalid_signature' };
  }
  if (compareCanonicalTimestamps(input.now, payload.expiresAt) >= 0) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, payload };
}

export function issueGuestActionToken(input: {
  readonly secret: string;
  readonly payload: GuestActionTokenPayload;
}): string {
  const parsedPayload = GuestActionTokenPayloadSchema.parse(input.payload);
  const encodedPayload = base64UrlEncode(utf8ToBytes(canonicalJsonStringify(parsedPayload)));
  const signature = signPayload(input.secret, parsedPayload);
  return `${encodedPayload}.${signature}`;
}

export type GuestActionTokenVerificationResult =
  | Readonly<{ valid: true; payload: GuestActionTokenPayload }>
  | Readonly<{ valid: false; reason: 'malformed' | 'invalid_signature' | 'expired' | 'purpose_mismatch' | 'booking_mismatch' | 'guest_mismatch' }>;

export type GuestCourseEnrollmentActionTokenVerificationResult =
  | Readonly<{ valid: true; payload: GuestCourseEnrollmentActionTokenPayload }>
  | Readonly<{ valid: false; reason: 'malformed' | 'invalid_signature' | 'expired' | 'purpose_mismatch' | 'enrollment_mismatch' | 'guest_mismatch' }>;

export function verifyGuestActionToken(input: {
  readonly secret: string;
  readonly token: string;
  readonly now: CanonicalTimestamp;
  readonly expectedBookingId: BookingId;
  readonly expectedGuestSubjectId: GuestSubjectId;
  readonly expectedPurpose: GuestActionTokenPurpose;
  readonly compareSignatures: CompareHmacSha256Signatures;
}): GuestActionTokenVerificationResult {
  const separatorIndex = input.token.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex >= input.token.length - 1) {
    return { valid: false, reason: 'malformed' };
  }

  const encodedPayload = input.token.slice(0, separatorIndex);
  const providedSignature = input.token.slice(separatorIndex + 1);
  if (decodeHmacSha256HexSignature(providedSignature) === undefined) {
    return { valid: false, reason: 'malformed' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const parsedPayload = GuestActionTokenPayloadSchema.safeParse(parsedJson);
  if (!parsedPayload.success) {
    return { valid: false, reason: 'malformed' };
  }

  const payload = parsedPayload.data;
  const expectedSignature = signPayload(input.secret, payload);
  if (!input.compareSignatures(expectedSignature, providedSignature)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  if (payload.bookingId !== input.expectedBookingId) {
    return { valid: false, reason: 'booking_mismatch' };
  }
  if (payload.guestSubjectId !== input.expectedGuestSubjectId) {
    return { valid: false, reason: 'guest_mismatch' };
  }
  if (payload.purpose !== input.expectedPurpose) {
    return { valid: false, reason: 'purpose_mismatch' };
  }
  if (compareCanonicalTimestamps(input.now, payload.expiresAt) >= 0) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

export function createGuestActionTokenNonce(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
  for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(bytes).slice(0, 32);
}
