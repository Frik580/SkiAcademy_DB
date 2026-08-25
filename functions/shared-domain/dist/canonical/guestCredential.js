"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUEST_ACTION_TOKEN_PURPOSES = exports.GUEST_ACTION_TOKEN_VERSION = void 0;
exports.decodeHmacSha256HexSignature = decodeHmacSha256HexSignature;
exports.signGuestActionCredential = signGuestActionCredential;
exports.verifyGuestActionCredentialParts = verifyGuestActionCredentialParts;
exports.issueGuestActionToken = issueGuestActionToken;
exports.verifyGuestActionToken = verifyGuestActionToken;
exports.createGuestActionTokenNonce = createGuestActionTokenNonce;
const hmac_js_1 = require("@noble/hashes/hmac.js");
const sha2_js_1 = require("@noble/hashes/sha2.js");
const utils_js_1 = require("@noble/hashes/utils.js");
const zod_1 = require("zod");
const canonicalJson_1 = require("./canonicalJson");
const identifiers_1 = require("./identifiers");
const primitives_1 = require("./primitives");
exports.GUEST_ACTION_TOKEN_VERSION = 'guest-token:v1';
exports.GUEST_ACTION_TOKEN_PURPOSES = ['cancel_pending_reservation'];
const GuestActionTokenPayloadSchema = zod_1.z
    .object({
    version: zod_1.z.literal(exports.GUEST_ACTION_TOKEN_VERSION),
    bookingId: identifiers_1.BookingIdSchema,
    guestSubjectId: identifiers_1.GuestSubjectIdSchema,
    purpose: zod_1.z.enum(exports.GUEST_ACTION_TOKEN_PURPOSES),
    expiresAt: primitives_1.CanonicalTimestampSchema,
    nonce: zod_1.z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
})
    .strict();
const HMAC_SHA256_HEX_LENGTH = 64;
const HMAC_SHA256_BYTE_LENGTH = 32;
function decodeHmacSha256HexSignature(signature) {
    if (signature.length !== HMAC_SHA256_HEX_LENGTH) {
        return undefined;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
        return undefined;
    }
    try {
        const bytes = (0, utils_js_1.hexToBytes)(signature.toLowerCase());
        return bytes.length === HMAC_SHA256_BYTE_LENGTH ? bytes : undefined;
    }
    catch {
        return undefined;
    }
}
function base64UrlEncode(bytes) {
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
function base64UrlDecode(value) {
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
function signingKeyBytes(secret) {
    return (0, utils_js_1.utf8ToBytes)(secret);
}
function signPayload(secret, payload) {
    const canonicalPayload = (0, canonicalJson_1.canonicalJsonStringify)(payload);
    return (0, utils_js_1.bytesToHex)((0, hmac_js_1.hmac)(sha2_js_1.sha256, signingKeyBytes(secret), (0, utils_js_1.utf8ToBytes)(canonicalPayload)));
}
function signGuestActionCredential(secret, payload) {
    const parsedPayload = GuestActionTokenPayloadSchema.parse(payload);
    return signPayload(secret, parsedPayload);
}
function verifyGuestActionCredentialParts(input) {
    const payload = GuestActionTokenPayloadSchema.parse({
        version: exports.GUEST_ACTION_TOKEN_VERSION,
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
    if ((0, primitives_1.compareCanonicalTimestamps)(input.now, payload.expiresAt) >= 0) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
}
function issueGuestActionToken(input) {
    const parsedPayload = GuestActionTokenPayloadSchema.parse(input.payload);
    const encodedPayload = base64UrlEncode((0, utils_js_1.utf8ToBytes)((0, canonicalJson_1.canonicalJsonStringify)(parsedPayload)));
    const signature = signPayload(input.secret, parsedPayload);
    return `${encodedPayload}.${signature}`;
}
function verifyGuestActionToken(input) {
    const separatorIndex = input.token.lastIndexOf('.');
    if (separatorIndex <= 0 || separatorIndex >= input.token.length - 1) {
        return { valid: false, reason: 'malformed' };
    }
    const encodedPayload = input.token.slice(0, separatorIndex);
    const providedSignature = input.token.slice(separatorIndex + 1);
    if (decodeHmacSha256HexSignature(providedSignature) === undefined) {
        return { valid: false, reason: 'malformed' };
    }
    let parsedJson;
    try {
        parsedJson = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
    }
    catch {
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
    if ((0, primitives_1.compareCanonicalTimestamps)(input.now, payload.expiresAt) >= 0) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
}
function createGuestActionTokenNonce() {
    const bytes = new Uint8Array(24);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    }
    else {
        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }
    return base64UrlEncode(bytes).slice(0, 32);
}
